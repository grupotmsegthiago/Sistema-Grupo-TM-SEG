/**
 * Orquestra a reaprovação. Falha de evidência, banco ou aviso impede a conclusão
 * e não deixa a OS aprovada com valor novo sem o restante obrigatório.
 */
import { validarJpegBase64 } from './capturaSenha';
import {
  anexarAcaoDiretoria,
  caminhoCaptura,
  camposAlterados,
  etapasVazias,
  justificativaValida,
  montarPatchValores,
  montarResumo,
  nomeAprovadorOriginal,
  papelDiretoria,
  patchReversao,
  patchSeguro,
  percentualEtapas,
  podeReaprovar,
  tentativaValida,
  textoErroPublico,
} from './regras';
import type {
  EventoReaprovacao,
  NotificacaoDiretoria,
  OsReaprovacao,
  ResultadoReaprovacao,
  UsuarioReaprovacao,
} from './tipos';

export type RepositorioReaprovacao = {
  buscarTentativa(tentativaId: string): Promise<{ ok: true; evento: EventoReaprovacao | null } | { ok: false; erro: string }>;
  salvarEvento(evento: EventoReaprovacao): Promise<{ ok: true; evento: EventoReaprovacao } | { ok: false; erro: string }>;
  aplicarValores(missionId: string, patch: Record<string, unknown>): Promise<{ ok: true } | { ok: false; erro: string }>;
  criarNotificacao(evento: EventoReaprovacao): Promise<{ ok: true; notificacao: NotificacaoDiretoria } | { ok: false; erro: string }>;
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
  if (jaExiste.evento?.status === 'concluida' && jaExiste.evento.missionId === os.id) {
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
  const campos = camposAlterados(os, depois);
  if (campos.length === 0) {
    return resultado(400, 'recusada', etapas, 'Nenhum valor financeiro foi alterado.', senha);
  }

  const pathAntes = caminhoCaptura(os.id, pedido.tentativaId, 'antes');
  const pathDepois = caminhoCaptura(os.id, pedido.tentativaId, 'depois');
  if (!pathAntes || !pathDepois) {
    return resultado(400, 'falha', etapas, 'Não foi possível nomear a evidência.', senha);
  }

  const guardadoAntes = jaExiste.evento?.capturaAntesPath
    ? { ok: true as const, path: jaExiste.evento.capturaAntesPath }
    : await deps.storage.guardar(pathAntes, antesImg.bytes);
  if (!guardadoAntes.ok) {
    return resultado(500, 'falha', etapas, `Falha no armazenamento da captura. ${guardadoAntes.erro}`, senha);
  }
  const guardadoDepois = jaExiste.evento?.capturaDepoisPath
    ? { ok: true as const, path: jaExiste.evento.capturaDepoisPath }
    : await deps.storage.guardar(pathDepois, depoisImg.bytes);
  if (!guardadoDepois.ok) {
    return resultado(500, 'falha', etapas, `Falha no armazenamento da captura. ${guardadoDepois.erro}`, senha);
  }
  etapas.storage = true;

  const quando = pedido.agora || new Date().toISOString();
  const nome = String(pedido.usuario.name || '').trim() || 'Financeiro';
  const patchNovo = montarPatchValores(campos, justificativa.texto, nome, quando);
  const seguro = patchSeguro(patchNovo);
  if (!seguro.ok) return resultado(500, 'falha', etapas, seguro.erro, senha);

  const base: EventoReaprovacao = jaExiste.evento && jaExiste.evento.missionId === os.id
    ? { ...jaExiste.evento, campos, justificativa: justificativa.texto, erro: null }
    : {
        id: pedido.novoId ? pedido.novoId() : crypto.randomUUID(),
        tentativaId: pedido.tentativaId,
        missionId: os.id,
        osNumero: os.id,
        incluidoPor: String(os.created_by || '').trim() || null,
        aprovadoOriginalmentePor: nomeAprovadorOriginal(os),
        aprovadoOriginalmenteEm: os.snapshot_approved_at || null,
        conferidoOriginalmentePor: String(os.billing_verified_by || '').trim() || null,
        alteradoPor: nome,
        reaprovadoPor: nome,
        reaprovadoEm: quando,
        justificativa: justificativa.texto,
        campos,
        capturaAntesPath: guardadoAntes.path,
        capturaDepoisPath: guardadoDepois.path,
        snapshotOriginal: os.snapshot_data ?? null,
        valoresAplicados: false,
        notificacaoId: null,
        status: 'pendente',
        erro: null,
      };
  base.capturaAntesPath = guardadoAntes.path;
  base.capturaDepoisPath = guardadoDepois.path;
  base.status = 'pendente';

  const gravado = await deps.repo.salvarEvento(base);
  if (!gravado.ok) {
    return resultado(500, 'falha', etapas, `Falha no banco. Os valores da OS não foram alterados. ${gravado.erro}`, senha);
  }

  let evento = gravado.evento;
  if (!evento.valoresAplicados) {
    const aplicou = await deps.repo.aplicarValores(os.id, seguro.patch);
    if (!aplicou.ok) {
      evento = { ...evento, status: 'falha', erro: aplicou.erro };
      await deps.repo.salvarEvento(evento);
      return resultado(500, 'falha', etapas, `Falha no banco ao gravar os valores. ${aplicou.erro}`, senha);
    }
    evento = { ...evento, valoresAplicados: true, erro: null };
    const marcado = await deps.repo.salvarEvento(evento);
    if (!marcado.ok) {
      return resultado(500, 'inconsistente', { ...etapas, gravacao: true }, `Falha no banco depois de alterar os valores. ${marcado.erro}`, senha);
    }
    evento = marcado.evento;
  }
  etapas.gravacao = true;

  if (!evento.notificacaoId) {
    const aviso = await deps.repo.criarNotificacao({ ...evento, status: 'pendente' });
    if (!aviso.ok) {
      const reverso = patchSeguro(patchReversao(campos, os, quando));
      if (!reverso.ok) {
        return resultado(500, 'inconsistente', etapas, 'Falha ao avisar a Diretoria e ao montar a reversão dos valores.', senha);
      }
      const voltou = await deps.repo.aplicarValores(os.id, reverso.patch);
      if (!voltou.ok) {
        evento = { ...evento, status: 'inconsistente', valoresAplicados: true, erro: aviso.erro };
        await deps.repo.salvarEvento(evento);
        return resultado(500, 'inconsistente', etapas, 'A Diretoria não foi avisada e os valores não puderam voltar. A reaprovação não está concluída.', senha);
      }
      evento = { ...evento, status: 'falha', valoresAplicados: false, erro: aviso.erro };
      await deps.repo.salvarEvento(evento);
      etapas.gravacao = false;
      return resultado(500, 'falha', etapas, `Falha ao avisar a Diretoria. Os valores voltaram ao estado anterior. ${aviso.erro}`, senha);
    }
    evento = { ...evento, notificacaoId: aviso.notificacao.id, status: 'concluida', erro: null };
  }

  evento = { ...evento, status: 'concluida', erro: null, valoresAplicados: true };
  const fechado = await deps.repo.salvarEvento(evento);
  if (!fechado.ok) {
    return resultado(500, 'inconsistente', etapas, `Falha no banco ao confirmar a conclusão. ${fechado.erro}`, senha);
  }
  etapas.notificacao = true;
  etapas.confirmacao = true;
  return concluirDeEvento(fechado.evento, false);
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
