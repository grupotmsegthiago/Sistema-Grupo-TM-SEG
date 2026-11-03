/**
 * Serviço local da fase 2. As operações simuladas ficam na memória.
 * A persistência real não existe e a flag desligada recusa qualquer tentativa.
 */
import { REFERENCIA_ETAPA_7 } from '../centroHomologacao';
import { homologacaoRealHabilitada } from './flag';
import { autorizarHomologacao, autorizarIdentidade } from './politicaAcesso';
import { bloqueiosDaHomologacao } from './regras';
import { RepositorioMemoria } from './repositorioMemoria';
import type {
  EventoDecisao,
  FalhaDecisao,
  IdentidadeServidor,
  ImpactoCalculado,
  ImpactoEmpresa,
  LancamentoProtegido,
  PedidoDecisao,
  ResultadoDecisao,
  StatusHomologacao,
  SucessoDecisao,
} from './tipos';

type Relogio = () => string;

export interface ServicoHomologacao {
  preparar(identidade: IdentidadeServidor, pedido: PedidoDecisao): ResultadoDecisao;
  validar(identidade: IdentidadeServidor, pedido: PedidoDecisao): FalhaDecisao | { ok: true; motivo: '' };
  simularHomologacao(identidade: IdentidadeServidor, pedido: PedidoDecisao): ResultadoDecisao;
  simularRejeicao(identidade: IdentidadeServidor, pedido: PedidoDecisao): ResultadoDecisao;
  simularDocumentacao(identidade: IdentidadeServidor, pedido: PedidoDecisao): ResultadoDecisao;
  simularRevogacao(identidade: IdentidadeServidor, pedido: PedidoDecisao): ResultadoDecisao;
  consultarHistorico(lancamentoId?: string): readonly EventoDecisao[];
  calcularImpacto(): ImpactoCalculado;
  identificarConflitos(pedido: PedidoDecisao): string[];
  tentarPersistenciaReal(identidade: IdentidadeServidor, pedido: PedidoDecisao, env?: Record<string, string | undefined>): FalhaDecisao;
  consultarTentativas(): readonly { codigo: string; lancamentoId: string | null }[];
}

export function criarServicoHomologacao(
  catalogo: readonly LancamentoProtegido[],
  opcoes: { agora?: Relogio; repositorio?: RepositorioMemoria } = {},
): ServicoHomologacao {
  const repo = opcoes.repositorio ?? new RepositorioMemoria();
  const agora = opcoes.agora ?? (() => new Date().toISOString());
  const porId = new Map(catalogo.map((item) => [item.id, item]));

  const falha = (identidade: IdentidadeServidor, lancamentoId: string | null, codigo: FalhaDecisao['codigo'], motivo: string): FalhaDecisao => {
    repo.registrarTentativa({
      em: agora(),
      usuarioInformado: identidade.usuarioId,
      origem: identidade.origem,
      lancamentoId,
      codigo,
      motivo,
    });
    return { ok: false, codigo, motivo };
  };

  const sucesso = (decisao: EventoDecisao, repetida: boolean): SucessoDecisao => ({
    ok: true,
    decisao,
    historico: repo.listar(decisao.lancamentoId),
    impacto: impactoDe(repo, porId),
    repetida,
  });

  const repetirOuConflitar = (identidade: IdentidadeServidor, pedido: PedidoDecisao, status: StatusHomologacao): SucessoDecisao | FalhaDecisao | null => {
    const anterior = repo.buscarChave(pedido.chaveIdempotencia);
    if (!anterior) return null;
    const igual = anterior.lancamentoId === pedido.lancamentoId
      && anterior.status === status
      && anterior.valorConsideradoCentavos === pedido.valorConsideradoCentavos
      && anterior.empresaId === pedido.empresaId;
    if (!igual && anterior.status === 'revogada_simulada') {
      return falha(identidade, pedido.lancamentoId, 'revogada_nao_reativa', 'A decisão revogada não volta a valer com a mesma chave. O histórico dela permanece.');
    }
    if (!igual) return falha(identidade, pedido.lancamentoId, 'conflito_idempotencia', 'A mesma chave veio com outro conteúdo. A decisão anterior foi preservada.');
    return sucesso(anterior, true);
  };

  const guardar = (
    identidade: IdentidadeServidor,
    pedido: PedidoDecisao,
    status: StatusHomologacao,
    checarHomologacao: boolean,
  ): ResultadoDecisao => {
    const repetida = repetirOuConflitar(identidade, pedido, status);
    if (repetida) return repetida;
    const lancamento = porId.get(pedido.lancamentoId) ?? null;
    const acesso = checarHomologacao
      ? autorizarHomologacao(identidade, pedido.empresaId)
      : autorizarIdentidade(identidade);
    if (!acesso.permitido && acesso.codigo) return falha(identidade, pedido.lancamentoId, acesso.codigo, acesso.motivo);
    if (checarHomologacao) {
      const bloqueio = bloqueiosDaHomologacao(lancamento, pedido)[0];
      if (bloqueio) return falha(identidade, pedido.lancamentoId, bloqueio.codigo, bloqueio.motivo);
    } else if (!pedido.justificativa.trim()) {
      return falha(identidade, pedido.lancamentoId, 'justificativa_ausente', 'A decisão precisa de justificativa.');
    } else if (!lancamento) {
      return falha(identidade, pedido.lancamentoId, 'lancamento_ausente', 'O lançamento não está na base protegida desta simulação.');
    }
    const versaoAtual = repo.versaoAtual(pedido.lancamentoId);
    if (pedido.versaoEsperada !== versaoAtual) {
      return falha(identidade, pedido.lancamentoId, 'conflito_versao', 'Outra decisão chegou antes. A versão esperada não confere.');
    }
    const vigente = repo.vigente(pedido.lancamentoId);
    if (vigente?.status === 'homologada_simulada' && status === 'homologada_simulada') {
      return falha(identidade, pedido.lancamentoId, 'duplicidade', 'Este lançamento já tem homologação simulada ativa.');
    }
    const decisao = repo.anexar({
      lancamentoId: pedido.lancamentoId,
      empresaId: pedido.empresaId,
      cnpj: pedido.cnpj,
      status,
      valorConsideradoCentavos: pedido.valorConsideradoCentavos,
      classificacao: pedido.classificacao,
      usuarioId: identidade.usuarioId,
      decididoEm: agora(),
      justificativa: pedido.justificativa.trim(),
      referenciaDocumental: pedido.referenciaDocumental.trim(),
      versao: versaoAtual + 1,
      decisaoAnteriorId: vigente?.id ?? null,
      evidencias: pedido.evidencias,
      chaveIdempotencia: pedido.chaveIdempotencia,
    });
    return sucesso(decisao, false);
  };

  return {
    preparar: (identidade, pedido) => guardar(identidade, pedido, 'preparada', false),
    validar: (identidade, pedido) => {
      const lancamento = porId.get(pedido.lancamentoId) ?? null;
      const acesso = autorizarHomologacao(identidade, pedido.empresaId ?? lancamento?.empresaId ?? null);
      if (!acesso.permitido && acesso.codigo) return { ok: false, codigo: acesso.codigo, motivo: acesso.motivo };
      const bloqueio = bloqueiosDaHomologacao(lancamento, pedido)[0];
      if (bloqueio) return { ok: false, codigo: bloqueio.codigo, motivo: bloqueio.motivo };
      return { ok: true, motivo: '' };
    },
    simularHomologacao: (identidade, pedido) => guardar(identidade, pedido, 'homologada_simulada', true),
    simularRejeicao: (identidade, pedido) => guardar(identidade, pedido, 'rejeitada_simulada', false),
    simularDocumentacao: (identidade, pedido) => guardar(identidade, pedido, 'documentacao_solicitada', false),
    simularRevogacao: (identidade, pedido) => {
      const vigente = repo.vigente(pedido.lancamentoId);
      if (!vigente || vigente.status === 'revogada_simulada') {
        return falha(identidade, pedido.lancamentoId, 'decisao_ausente', 'Não há decisão vigente para revogar.');
      }
      return guardar(identidade, pedido, 'revogada_simulada', false);
    },
    consultarHistorico: (lancamentoId) => repo.listar(lancamentoId),
    calcularImpacto: () => impactoDe(repo, porId),
    identificarConflitos: (pedido) => {
      const conflitos: string[] = [];
      if (repo.versaoAtual(pedido.lancamentoId) !== pedido.versaoEsperada) conflitos.push('conflito_versao');
      const vigente = repo.vigente(pedido.lancamentoId);
      if (vigente?.status === 'homologada_simulada') conflitos.push('duplicidade');
      const bloqueio = bloqueiosDaHomologacao(porId.get(pedido.lancamentoId) ?? null, pedido)[0];
      if (bloqueio) conflitos.push(bloqueio.codigo);
      return conflitos;
    },
    tentarPersistenciaReal: (identidade, pedido, env) => {
      if (!homologacaoRealHabilitada(env)) {
        return falha(identidade, pedido.lancamentoId, 'ativacao_desligada', 'A homologação real está desligada. Nenhuma gravação foi feita.');
      }
      return falha(identidade, pedido.lancamentoId, 'escrita_nao_disponivel', 'Mesmo com a flag, esta fase não tem escrita. Nenhuma gravação foi feita.');
    },
    consultarTentativas: () => repo.listarTentativas().map((item) => ({ codigo: item.codigo, lancamentoId: item.lancamentoId })),
  };
}

function impactoDe(repo: RepositorioMemoria, catalogo: Map<string, LancamentoProtegido>): ImpactoCalculado {
  const empresas = (Object.keys(REFERENCIA_ETAPA_7.empresas) as Array<'TM GESTAO' | 'TM SEGURANCA' | 'TM SECURITY'>).map((empresaId) => {
    const base = REFERENCIA_ETAPA_7.empresas[empresaId];
    const despesa = despesaVigente(repo, catalogo, empresaId);
    const resultado = base.resultadoPainelCentavos - despesa;
    return {
      empresaId,
      receitaCentavos: base.receitaCentavos,
      custoOsCentavos: base.custoOsCentavos,
      despesaHomologadaCentavos: despesa,
      resultadoCentavos: resultado,
    } satisfies ImpactoEmpresa;
  });
  const despesaHomologada = empresas.reduce((total, empresa) => total + empresa.despesaHomologadaCentavos, 0);
  return {
    receitaCentavos: REFERENCIA_ETAPA_7.grupo.receitaCentavos,
    custoOsCentavos: REFERENCIA_ETAPA_7.grupo.custoOsCentavos,
    despesaReconhecidaCentavos: REFERENCIA_ETAPA_7.jaReconhecidoCentavos,
    despesaHomologadaCentavos: despesaHomologada,
    resultadoCentavos: REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos - despesaHomologada,
    porEmpresa: empresas,
    homologacaoReal: false,
  };
}

function despesaVigente(
  repo: RepositorioMemoria,
  catalogo: Map<string, LancamentoProtegido>,
  empresaId: ImpactoEmpresa['empresaId'],
): number {
  const ids = new Set<string>();
  for (const evento of repo.listar()) ids.add(evento.lancamentoId);
  let total = 0;
  for (const id of ids) {
    const vigente = repo.vigente(id);
    const lancamento = catalogo.get(id);
    if (!vigente || !lancamento) continue;
    if (vigente.status !== 'homologada_simulada') continue;
    if (vigente.classificacao !== 'gerencial' || lancamento.classificacao !== 'gerencial') continue;
    if (lancamento.jaNoResultado || lancamento.empresaId !== empresaId) continue;
    total += lancamento.valorCentavos;
  }
  return total;
}
