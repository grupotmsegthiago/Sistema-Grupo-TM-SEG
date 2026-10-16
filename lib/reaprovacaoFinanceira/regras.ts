/**
 * Regras puras da reaprovação. Não gravam OS, snapshot, pedágio, franquia nem comissão.
 */
import { perfilAuditoria, podeAcessarAuditoriaFaturamento } from '../auditoriaFaturamentoAccess';
import { isFinanceProfileRole } from '../financeSupervisorAccess';
import { carimboAprovacaoHumana } from '../missionSnapshot';
import {
  ACOES_DIRETORIA,
  CAMPOS_CORRIGIVEIS,
  ETAPAS_REAPROVACAO,
  type AcaoDiretoria,
  type CampoAlterado,
  type CampoCorrigivel,
  type EtapasReaprovacao,
  type EventoReaprovacao,
  type NotificacaoDiretoria,
  type OsReaprovacao,
  type ResumoNotificacao,
  type SituacaoDiretoria,
  type UsuarioReaprovacao,
} from './tipos';

export const PRESERVADOS_NA_REAPROVACAO = [
  'snapshot original',
  'pedágio',
  'franquia',
  'comissão',
] as const;

const CAMPOS_PATCH_PERMITIDOS = new Set([
  'revenue_value',
  'cost_value',
  'revenue_edit_reason',
  'cost_edit_reason',
  'last_update',
]);

const STATUS_ENCERRADOS = new Set([
  'encerrada',
  'encerrado',
  'cancelada',
  'cancelado',
  'recusada',
  'recusado',
]);

export function etapasVazias(): EtapasReaprovacao {
  return {
    permissao: false,
    justificativa: false,
    senha: false,
    capturas: false,
    storage: false,
    gravacao: false,
    notificacao: false,
    confirmacao: false,
  };
}

export function percentualEtapas(etapas: EtapasReaprovacao): number {
  const feitas = ETAPAS_REAPROVACAO.filter((etapa) => etapas[etapa]).length;
  if (feitas === ETAPAS_REAPROVACAO.length) return 100;
  return Math.floor((feitas / ETAPAS_REAPROVACAO.length) * 100);
}

/** 100% só quando a conclusão foi confirmada. Falha nunca aparece como concluída. */
export function percentualExibido(parcial: number, concluida: boolean): number {
  if (concluida) return 100;
  if (!Number.isFinite(parcial) || parcial <= 0) return 0;
  if (parcial >= 100) return 99;
  return Math.floor(parcial);
}

export function rotuloEtapa(etapa: keyof EtapasReaprovacao): string {
  const rotulos: Record<keyof EtapasReaprovacao, string> = {
    permissao: 'Permissão conferida',
    justificativa: 'Justificativa informada',
    senha: 'Senha conferida',
    capturas: 'Capturas antes e depois prontas',
    storage: 'Evidências guardadas',
    gravacao: 'Banco confirmou o evento e os valores',
    notificacao: 'Diretoria avisada',
    confirmacao: 'Conclusão confirmada',
  };
  return rotulos[etapa];
}

function normalizar(valor: unknown): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function papelDiretoria(usuario: UsuarioReaprovacao | null | undefined): boolean {
  return normalizar(usuario?.role) === 'diretoria';
}

export function osJaAprovada(os: OsReaprovacao | null | undefined): boolean {
  if (!os) return false;
  if (os.billing_approved === true) return true;
  return !!carimboAprovacaoHumana(os.snapshot_approved_by);
}

export function motivoBloqueioReaprovacao(os: OsReaprovacao | null | undefined): string | null {
  if (!os) return 'OS não encontrada.';
  if (os.consultaTravaIncompleta) {
    return 'Não foi possível confirmar se a OS está faturada ou paga. A reaprovação foi impedida.';
  }
  if (os.negative_margin_locked === true) {
    return 'OS com prejuízo analisado. Somente a Diretoria altera, e esta ação não desbloqueia a trava.';
  }
  if (os.faturaPaga === true) {
    return 'OS vinculada a fatura paga. A reaprovação não desbloqueia.';
  }
  if (String(os.invoice_number || '').trim()) {
    return 'OS faturada. A reaprovação não desbloqueia a fatura.';
  }
  const status = normalizar(os.status);
  if (status.includes('faturad')) return 'OS faturada. A reaprovação não desbloqueia a fatura.';
  if (STATUS_ENCERRADOS.has(status) || status.includes('encerrad')) {
    return 'OS encerrada. A reaprovação não reabre.';
  }
  return null;
}

export function podeReaprovar(
  usuario: UsuarioReaprovacao | null | undefined,
  os: OsReaprovacao | null | undefined,
): { permitido: boolean; motivo: string } {
  if (!podeAcessarAuditoriaFaturamento(usuario) || !isFinanceProfileRole(usuario?.role)) {
    return { permitido: false, motivo: 'Somente o Financeiro autorizado pode reaprovar.' };
  }
  const trava = motivoBloqueioReaprovacao(os);
  if (trava) return { permitido: false, motivo: trava };
  if (!osJaAprovada(os)) {
    return { permitido: false, motivo: 'A OS ainda não tem aprovação financeira.' };
  }
  return { permitido: true, motivo: '' };
}

export function motivoBloqueioEdicaoTotal(os: OsReaprovacao | null | undefined): string | null {
  if (!os) return 'OS não encontrada.';
  if (os.consultaTravaIncompleta) {
    return 'Não foi possível confirmar se a OS está faturada ou paga. A edição total foi impedida.';
  }
  if (os.negative_margin_locked === true) {
    return 'OS com prejuízo analisado. A edição total não desbloqueia essa trava.';
  }
  if (os.faturaPaga === true) {
    return 'OS vinculada a fatura paga. A edição total não desbloqueia.';
  }
  if (String(os.invoice_number || '').trim()) {
    return 'OS faturada. A edição total não desbloqueia a fatura.';
  }
  const status = normalizar(os.status);
  if (status.includes('faturad')) return 'OS faturada. A edição total não desbloqueia a fatura.';
  if (STATUS_ENCERRADOS.has(status) || status.includes('encerrad')) {
    return 'OS encerrada. A edição total não reabre.';
  }
  return null;
}

export function podeEdicaoTotal(
  usuario: UsuarioReaprovacao | null | undefined,
  os: OsReaprovacao | null | undefined,
): { permitido: boolean; motivo: string } {
  if (perfilAuditoria(usuario?.role) === 'controller' || !podeAcessarAuditoriaFaturamento(usuario)) {
    return { permitido: false, motivo: 'Somente a Diretoria ou o Financeiro autorizado usa a edição total.' };
  }
  const trava = motivoBloqueioEdicaoTotal(os);
  if (trava) return { permitido: false, motivo: trava };
  return { permitido: true, motivo: '' };
}

export function exibirPainelReaprovacao(
  usuario: UsuarioReaprovacao | null | undefined,
  os: OsReaprovacao | null | undefined,
): boolean {
  if (!podeAcessarAuditoriaFaturamento(usuario) || !isFinanceProfileRole(usuario?.role) || !os?.id) return false;
  return osJaAprovada(os) || !!motivoBloqueioReaprovacao(os);
}

export function centavos(valor: unknown): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function camposAlterados(
  antes: { revenue_value?: unknown; cost_value?: unknown },
  depois: { revenue_value?: unknown; cost_value?: unknown },
): CampoAlterado[] {
  const saida: CampoAlterado[] = [];
  for (const campo of CAMPOS_CORRIGIVEIS) {
    const de = centavos(antes[campo]);
    const para = centavos(depois[campo]);
    if (de == null || para == null || de === para) continue;
    saida.push({ campo, antes: de / 100, depois: para / 100 });
  }
  return saida;
}

export function valoresDepoisExplicitos(
  antes: { revenue_value?: unknown; cost_value?: unknown },
  informado: Record<string, unknown>,
): { revenue_value: number; cost_value: number } {
  const receita = Object.prototype.hasOwnProperty.call(informado, 'revenue_value')
    ? centavos(informado.revenue_value)
    : centavos(antes.revenue_value);
  const custo = Object.prototype.hasOwnProperty.call(informado, 'cost_value')
    ? centavos(informado.cost_value)
    : centavos(antes.cost_value);
  return {
    revenue_value: (receita ?? 0) / 100,
    cost_value: (custo ?? 0) / 100,
  };
}

export function formatarQuando(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function montarPatchValores(
  campos: CampoAlterado[],
  justificativa: string,
  usuario: string,
  quandoIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { last_update: quandoIso };
  const carimbo = `[${usuario} - ${formatarQuando(quandoIso)}] Reaprovação: ${justificativa.trim()}`;
  for (const campo of campos) {
    patch[campo.campo] = campo.depois;
    if (campo.campo === 'revenue_value') patch.revenue_edit_reason = carimbo;
    if (campo.campo === 'cost_value') patch.cost_edit_reason = carimbo;
  }
  return patch;
}

export function patchSeguro(
  patch: Record<string, unknown>,
): { ok: true; patch: Record<string, unknown> } | { ok: false; erro: string } {
  const seguro: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(patch)) {
    const baixa = chave.toLowerCase();
    if (
      !CAMPOS_PATCH_PERMITIDOS.has(chave)
      || baixa.includes('snapshot')
      || baixa.includes('toll')
      || baixa.includes('pedagio')
      || baixa.includes('franquia')
      || baixa.includes('franchise')
      || baixa.includes('comiss')
      || baixa.includes('billing_approved')
      || baixa.includes('displacement')
    ) {
      return { ok: false, erro: 'A reaprovação tentou alterar um campo protegido.' };
    }
    seguro[chave] = valor;
  }
  return { ok: true, patch: seguro };
}

export function patchReversao(
  campos: CampoAlterado[],
  motivosAnteriores: { revenue_edit_reason?: string | null; cost_edit_reason?: string | null },
  quandoIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { last_update: quandoIso };
  for (const campo of campos) {
    patch[campo.campo] = campo.antes;
    if (campo.campo === 'revenue_value') patch.revenue_edit_reason = motivosAnteriores.revenue_edit_reason ?? null;
    if (campo.campo === 'cost_value') patch.cost_edit_reason = motivosAnteriores.cost_edit_reason ?? null;
  }
  return patch;
}

export function justificativaValida(texto: unknown): { ok: true; texto: string } | { ok: false; erro: string } {
  const limpo = String(texto || '').trim();
  if (limpo.length < 8) return { ok: false, erro: 'Informe a justificativa da reaprovação.' };
  if (limpo.length > 2000) return { ok: false, erro: 'A justificativa passou do limite.' };
  return { ok: true, texto: limpo };
}

export function tentativaValida(valor: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(valor || '').trim());
}

export function caminhoCaptura(missionId: string, tentativaId: string, lado: 'antes' | 'depois'): string | null {
  const os = String(missionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!os || !tentativaValida(tentativaId)) return null;
  if (lado !== 'antes' && lado !== 'depois') return null;
  return `${os}/${tentativaId}/${lado}.jpg`;
}

export function nomeAprovadorOriginal(os: OsReaprovacao): string | null {
  return carimboAprovacaoHumana(os.snapshot_approved_by) || String(os.billing_verified_by || '').trim() || null;
}

export function montarResumo(evento: EventoReaprovacao): ResumoNotificacao {
  return {
    osNumero: evento.osNumero,
    incluidoPor: evento.incluidoPor,
    aprovadoOriginalmentePor: evento.aprovadoOriginalmentePor,
    aprovadoOriginalmenteEm: evento.aprovadoOriginalmenteEm,
    alteradoPor: evento.alteradoPor,
    reaprovadoPor: evento.reaprovadoPor,
    reaprovadoEm: evento.reaprovadoEm,
    justificativa: evento.justificativa,
    campos: evento.campos,
    capturaAntesPath: evento.capturaAntesPath,
    capturaDepoisPath: evento.capturaDepoisPath,
    preservados: [...PRESERVADOS_NA_REAPROVACAO],
    aprovacaoFinanceiraAlterada: false,
    origem: 'reaprovacao',
  };
}

export function montarResumoEdicao(evento: EventoReaprovacao, cliente: string | null): ResumoNotificacao {
  const alterados = new Set(evento.campos.map((campo) => campo.campo));
  const preservados = [
    'snapshot original',
    'aprovação original',
    'comissão',
    'contas a pagar',
    'notas fiscais',
  ];
  if (!alterados.has('toll_value') && !alterados.has('toll_value_provider')) preservados.push('pedágio');
  preservados.push('franquia do snapshot');
  return {
    ...montarResumo(evento),
    cliente,
    origem: 'edicao_total',
    preservados,
    aprovacaoFinanceiraAlterada: false,
  };
}

export function anexarAcaoDiretoria(
  atual: NotificacaoDiretoria | null,
  acao: unknown,
  por: string,
  em: string,
  observacao: unknown,
): { ok: true; notificacao: NotificacaoDiretoria } | { ok: false; erro: string } {
  if (!atual) return { ok: false, erro: 'A notificação não foi encontrada.' };
  if (!acaoDiretoriaValida(acao)) return { ok: false, erro: 'Ação inválida. Use Lido, Questionar ou Encerrar.' };
  const nota = String(observacao || '').trim();
  if (acao === 'QUESTIONAR' && nota.length < 8) {
    return { ok: false, erro: 'Ao questionar, descreva a pergunta.' };
  }
  const historico = [
    ...atual.historico,
    { acao, por: por.trim() || 'Diretoria', em, observacao: nota || null },
  ];
  return {
    ok: true,
    notificacao: {
      ...atual,
      situacao: situacaoDaAcao(acao),
      historico,
      resumo: { ...atual.resumo, aprovacaoFinanceiraAlterada: false },
    },
  };
}

export function situacaoDaAcao(acao: AcaoDiretoria): SituacaoDiretoria {
  if (acao === 'LIDO') return 'lido';
  if (acao === 'QUESTIONAR') return 'questionado';
  return 'encerrado';
}

export function acaoDiretoriaValida(valor: unknown): valor is AcaoDiretoria {
  return ACOES_DIRETORIA.includes(valor as AcaoDiretoria);
}

export function separarSenha(body: unknown): { senha: string; resto: Record<string, unknown> } {
  const origem = body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : {};
  const senha = typeof origem.senha === 'string' ? origem.senha : '';
  delete origem.senha;
  return { senha, resto: origem };
}

export function textoErroPublico(erro: string, senha: string): string {
  const texto = String(erro || '').trim();
  if (!texto) return 'Não foi possível concluir a reaprovação.';
  if (senha && texto.includes(senha)) return 'Não foi possível concluir a reaprovação.';
  return texto;
}

export function campoEhCorrigivel(campo: string): campo is CampoCorrigivel {
  return (CAMPOS_CORRIGIVEIS as readonly string[]).includes(campo);
}
