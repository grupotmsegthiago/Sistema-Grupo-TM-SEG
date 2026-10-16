/**
 * Orquestra a reaprovação.
 * As capturas são validadas antes. Valor, histórico e notificação entram
 * numa transação só. Não há reversão compensatória.
 */
import { validarJpegBase64 } from './capturaSenha';
import {
  anexarAcaoDiretoria,
  caminhoCaptura,
  camposAlterados,
  etapasVazias,
  justificativaValida,
  montarResumo,
  papelDiretoria,
  percentualEtapas,
  podeReaprovar,
  tentativaValida,
  textoErroPublico,
} from './regras';
import type { EntradaAtomica, ResultadoAtomico } from './transacao';
import type {
  EventoReaprovacao,
  NotificacaoDiretoria,
  OsReaprovacao,
  ResultadoReaprovacao,
  UsuarioReaprovacao,
} from './tipos';

export type RepositorioReaprovacao = {
  buscarTentativa(tentativaId: string): Promise<{ ok: true; evento: EventoReaprovacao | null } | { ok: false; erro: string }>;
  confirmar(entrada: EntradaAtomica): Promise<ResultadoAtomico>;
};

export type ArmazenamentoCaptura = {
  guardar(path: string, bytes: Uint8Array): Promise<{ ok: true; path: string } | { ok: false; erro: string }>;
};

export type PedidoReaprovacao = {
  usuario: UsuarioReaprovacao;
  os: OsReaprovacao;
  tentativaId: string;
  justificativa: unknown;
  senha: string;
  capturaAntes: unknown;
  capturaDepois: unknown;
  revenue_value?: unknown;
  cost_value?: unknown;
  agora?: string;
  novoId?: () => string;
};

function resultado(
  http: number,
  status: ResultadoReaprovacao['status'],
  etapas: ResultadoReaprovacao['etapas'],
  erro: string | undefined,
  senha: string,
  extra?: Partial<ResultadoReaprovacao>,
): ResultadoReaprovacao {
  const percentualCheio = percentualEtapas(etapas);
  const ok = status === 'concluida' && percentualCheio === 100 && etapas.confirmacao && etapas.gravacao && etapas.storage && etapas.notificacao;
  return {
    ok,
    http: ok ? 200 : http,
    erro: ok ? undefined : textoErroPublico(erro || 'Não foi possível concluir a reaprovação.', senha),
    percentual: ok ? 100 : Math.min(percentualCheio, 99),
    etapas,
    status: ok ? 'concluida' : status,
    ...extra,
  };
}

function evidenciaConfirmada(evento: EventoReaprovacao | null | undefined): evento is EventoReaprovacao {
  return !!evento
    && evento.status === 'concluida'
    && evento.valoresAplicados === true
    && !!evento.capturaAntesPath
    && !!evento.capturaDepoisPath
    && !!evento.notificacaoId;
}

function concluirDeEvento(evento: EventoReaprovacao, repetida: boolean): ResultadoReaprovacao {
  const etapas = etapasVazias();
  for (const chave of Object.keys(etapas) as (keyof typeof etapas)[]) etapas[chave] = true;
  const resumo = montarResumo(evento);
  return {
    ok: true,
    http: 200,
    percentual: 100,
    etapas,
    status: 'concluida',
    repetida,
    evento,
    resumo,
  };
}

export async function executarReaprovacao(
  pedido: PedidoReaprovacao,
  deps: {
    senhaConfere: (senha: string) => Promise<boolean>;
    repo: RepositorioReaprovacao;
    storage: ArmazenamentoCaptura;
  },
): Promise<ResultadoReaprovacao> {
  const senha = String(pedido.senha || '');
  const etapas = etapasVazias();
  const os = pedido.os;
  const permissao = podeReaprovar(pedido.usuario, os);
  if (!permissao.permitido) {
    return resultado(403, 'recusada', etapas, permissao.motivo, senha);
  }
  etapas.permissao = true;

  const justificativa = justificativaValida(pedido.justificativa);
  if (!justificativa.ok) return resultado(400, 'recusada', etapas, justificativa.erro, senha);
  etapas.justificativa = true;

  if (!senha.trim()) return resultado(401, 'recusada', etapas, 'Informe a senha pessoal.', senha);
  let senhaOk = false;
  try {
    senhaOk = await deps.senhaConfere(senha);
  } catch {
    senhaOk = false;
  }
  if (!senhaOk) return resultado(401, 'recusada', etapas, 'Senha incorreta.', senha);
  etapas.senha = true;

  if (!tentativaValida(pedido.tentativaId)) {
    return resultado(400, 'recusada', etapas, 'A tentativa de reaprovação é inválida.', senha);
  }

  const jaExiste = await deps.repo.buscarTentativa(pedido.tentativaId);
  if (!jaExiste.ok) return resultado(500, 'falha', etapas, jaExiste.erro, senha);
  if (evidenciaConfirmada(jaExiste.evento) && jaExiste.evento.missionId === os.id) {
    return concluirDeEvento(jaExiste.evento, true);
  }

  const antesImg = validarJpegBase64(pedido.capturaAntes);
  const depoisImg = validarJpegBase64(pedido.capturaDepois);
  if (!antesImg.ok || !depoisImg.ok) {
    return resultado(400, 'falha', etapas, 'Falha na captura obrigatória. A reaprovação não foi concluída.', senha);
  }
  etapas.capturas = true;

  const depois = {
    revenue_value: Object.prototype.hasOwnProperty.call(pedido, 'revenue_value') ? pedido.revenue_value : os.revenue_value,
    cost_value: Object.prototype.hasOwnProperty.call(pedido, 'cost_value') ? pedido.cost_value : os.cost_value,
  };
  const camposPrevios = camposAlterados(os, depois);
  if (camposPrevios.length === 0) {
    return resultado(400, 'recusada', etapas, 'Nenhum valor financeiro foi alterado.', senha);
  }

  const pathAntes = caminhoCaptura(os.id, pedido.tentativaId, 'antes');
  const pathDepois = caminhoCaptura(os.id, pedido.tentativaId, 'depois');
  if (!pathAntes || !pathDepois) {
    return resultado(400, 'falha', etapas, 'Não foi possível nomear a evidência.', senha);
  }

  const guardadoAntes = await deps.storage.guardar(pathAntes, antesImg.bytes);
  if (!guardadoAntes.ok) {
    return resultado(500, 'falha', etapas, `Falha no armazenamento da captura. ${guardadoAntes.erro}`, senha);
  }
  const guardadoDepois = await deps.storage.guardar(pathDepois, depoisImg.bytes);
  if (!guardadoDepois.ok) {
    return resultado(500, 'falha', etapas, `Falha no armazenamento da captura. ${guardadoDepois.erro}`, senha);
  }
  etapas.storage = true;

  const quando = pedido.agora || new Date().toISOString();
  const nome = String(pedido.usuario.name || '').trim() || 'Financeiro';
  const confirmado = await deps.repo.confirmar({
    tentativaId: pedido.tentativaId,
    missionId: os.id,
    receitaNova: Number(depois.revenue_value),
    custoNovo: Number(depois.cost_value),
    receitaEsperada: Number(os.revenue_value || 0),
    custoEsperado: Number(os.cost_value || 0),
    justificativa: justificativa.texto,
    alteradoPor: nome,
    capturaAntesPath: guardadoAntes.path,
    capturaDepoisPath: guardadoDepois.path,
    quando,
  });
  if (!confirmado.ok) {
    const http = confirmado.codigo === 'conflito' ? 409 : confirmado.codigo === 'trava' ? 403 : 500;
    return resultado(http, 'falha', etapas, confirmado.erro, senha);
  }
  if (!evidenciaConfirmada(confirmado.evento)) {
    return resultado(500, 'falha', etapas, 'A transação não confirmou histórico, evidência e notificação. A conclusão foi impedida.', senha);
  }
  etapas.gravacao = true;
  etapas.notificacao = true;
  etapas.confirmacao = true;
  return concluirDeEvento(confirmado.evento, confirmado.repetida);
}

export async function executarAcaoDiretoria(
  usuario: UsuarioReaprovacao,
  atual: NotificacaoDiretoria | null,
  acao: unknown,
  observacao: unknown,
  salvar: (notificacao: NotificacaoDiretoria) => Promise<{ ok: true } | { ok: false; erro: string }>,
  agora?: string,
): Promise<{ http: number; body: Record<string, unknown> }> {
  if (!papelDiretoria(usuario)) {
    return { http: 403, body: { ok: false, erro: 'Somente a Diretoria registra leitura, pergunta ou encerramento.', aprovacaoFinanceiraAlterada: false } };
  }
  const anexada = anexarAcaoDiretoria(atual, acao, String(usuario.name || ''), agora || new Date().toISOString(), observacao);
  if (!anexada.ok) {
    return { http: 400, body: { ok: false, erro: anexada.erro, aprovacaoFinanceiraAlterada: false } };
  }
  const gravou = await salvar(anexada.notificacao);
  if (!gravou.ok) {
    return { http: 500, body: { ok: false, erro: gravou.erro, aprovacaoFinanceiraAlterada: false } };
  }
  return {
    http: 200,
    body: {
      ok: true,
      aprovacaoFinanceiraAlterada: false,
      notificacao: anexada.notificacao,
    },
  };
}
