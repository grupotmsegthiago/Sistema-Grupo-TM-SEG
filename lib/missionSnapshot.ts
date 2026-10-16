/**
 * Snapshot de faturamento vs constraint Postgres:
 *   CHECK ((snapshot_data IS NOT NULL) OR (billing_approved = false))
 *
 * Aprovar com billing_approved=true exige snapshot_data não nulo.
 * OS recusada zerada costuma deixar snapshot_approved_by preenchido e
 * snapshot_data NULL — o Aprovar antigo falhava com check_snapshot_not_empty.
 */

export function hasUsableBillingSnapshot(snapshotData: unknown): boolean {
  if (snapshotData == null) return false;
  if (typeof snapshotData === 'string') {
    const t = snapshotData.trim();
    if (!t || t === '{}' || t === 'null' || t === '""') return false;
    try {
      return hasUsableBillingSnapshot(JSON.parse(t));
    } catch {
      return false;
    }
  }
  if (typeof snapshotData !== 'object') return false;
  if (Array.isArray(snapshotData)) return snapshotData.length > 0;
  return Object.keys(snapshotData as Record<string, unknown>).length > 0;
}

export function shouldWriteBillingSnapshot(opts: {
  approve: boolean;
  billingApproved: boolean;
  existingSnapshot: unknown;
}): boolean {
  return opts.approve && opts.billingApproved && !hasUsableBillingSnapshot(opts.existingSnapshot);
}

export function buildMinimalBillingSnapshot(opts: {
  route?: string;
  revenueServiceOnly: number;
  costServiceOnly: number;
  tollVal: number;
  tollProvider?: number;
  displacementVal?: number;
  displacementProvider?: number;
}): Record<string, unknown> {
  const revenue = Number(opts.revenueServiceOnly) || 0;
  const cost = Number(opts.costServiceOnly) || 0;
  const toll = Number(opts.tollVal) || 0;
  const displacement = Number(opts.displacementVal) || 0;
  return {
    route: opts.route || '-',
    tableName: '-',
    clientTableId: null,
    providerTableId: null,
    kmTotal: 0,
    revenueServiceOnly: revenue,
    costServiceOnly: cost,
    tollVal: toll,
    tollProvider: Number(opts.tollProvider) || 0,
    displacementVal: displacement,
    displacementProvider: Number(opts.displacementProvider) || 0,
    totalGeral: Math.round((revenue + toll + displacement) * 100) / 100,
  };
}

/** Campos a limpar ao zerar OS Recusada — evita Aprovar posterior sem snapshot. */
export function refusedOsClearSnapshotFields(): {
  snapshot_data: null;
  snapshot_approved_by: null;
  snapshot_approved_at: null;
  billing_approved: false;
} {
  return {
    snapshot_data: null,
    snapshot_approved_by: null,
    snapshot_approved_at: null,
    billing_approved: false,
  };
}

/**
 * Retry após check_snapshot_not_empty:
 * - se a OS vai ficar aprovada, GARANTE snapshot (nunca remove);
 * - se não vai ficar aprovada, pode omitir snapshot.
 */
export function retryPayloadForSnapshotConstraint(opts: {
  payload: Record<string, unknown>;
  billingApproved: boolean;
  userName: string;
  minimalSnapshot: Record<string, unknown>;
  nowIso?: string;
}): Record<string, unknown> {
  const next = { ...opts.payload };
  if (opts.billingApproved) {
    if (!hasUsableBillingSnapshot(next.snapshot_data)) {
      next.snapshot_data = opts.minimalSnapshot;
      next.snapshot_approved_by = opts.userName;
      next.snapshot_approved_at = opts.nowIso || new Date().toISOString();
    }
    return next;
  }
  delete next.snapshot_data;
  delete next.snapshot_approved_by;
  delete next.snapshot_approved_at;
  return next;
}

/** Texto gravado pelo botão Recalcular e Comparar. Não é aprovação financeira. */
export const CARIMBO_RECALCULO_AUTOMATICO = 'Sistema (Recalcular e Comparar)';

export function carimboRecalculoAutomatico(valor: unknown): boolean {
  return String(valor ?? '').trim() === CARIMBO_RECALCULO_AUTOMATICO;
}

/** Nome de quem aprovou. O carimbo automático do recálculo não entra. */
export function carimboAprovacaoHumana(valor: unknown): string | null {
  const texto = String(valor ?? '').trim();
  if (!texto || carimboRecalculoAutomatico(texto)) return null;
  return texto;
}

export type OrigemSnapshotFinanceiro = 'humana' | 'automatica' | 'indeterminada';

export type EstadoDetalhamentoSnapshot = 'valido' | 'zerado' | 'incompleto' | 'invalido';

export const DIVERGENCIA_DETALHAMENTO_ZERADO =
  'Snapshot sem franquia, hora e tarifa gravadas. A tabela atual não preencheu esses campos.';

export const DIVERGENCIA_DETALHAMENTO_INCOMPLETO =
  'Snapshot sem o detalhamento de franquia, hora e tarifa. A tabela atual não o substituiu.';

export const DIVERGENCIA_SNAPSHOT_INVALIDO =
  'Snapshot ausente ou inválido. Franquia, hora e tarifa não foram preenchidas pela tabela atual. O total oficial permanece.';

export const DIVERGENCIA_ALTERACAO_REAL =
  'Divergência posterior sem motivo de edição identificado. Franquia, horas e tarifas gravadas foram mantidas. O total oficial permanece.';

export const DIVERGENCIA_ALTERACAO_COM_MOTIVO =
  'Alteração posterior com motivo de edição registrado. Franquia, horas e tarifas gravadas foram mantidas. O total oficial permanece.';

export const DIVERGENCIA_ALTERACAO_INDETERMINADA =
  'Alteração posterior com origem indeterminada. O texto gravado não comprova autorização. Franquia, horas e tarifas gravadas foram mantidas. O total oficial permanece.';

export type ClassificacaoAlteracaoPosterior = 'com_motivo' | 'sem_motivo' | 'indeterminada';

/** Frases que o sistema já grava como motivo de edição do operador. Texto livre não entra aqui. */
const FRASES_MOTIVO_REGISTRADO = [
  'salvamento manual confirmado',
  'tabela oficial aplicada',
  'edição manual',
  'edicao manual',
  'ajuste manual',
  'valor zero confirmado',
];

function textoMotivo(valor: unknown): string {
  return String(valor ?? '').trim().toLowerCase();
}

function temMotivoRegistrado(texto: string): boolean {
  return FRASES_MOTIVO_REGISTRADO.some((frase) => texto.includes(frase));
}

/**
 * Separa alteração com motivo conhecido, divergência sem justificativa e texto que não comprova autorização.
 * Não trata qualquer frase como autorização e não altera a OS.
 */
export function classificarAlteracaoPosterior(opts: {
  motivoReceita?: unknown;
  motivoCusto?: unknown;
}): ClassificacaoAlteracaoPosterior {
  const receita = textoMotivo(opts.motivoReceita);
  const custo = textoMotivo(opts.motivoCusto);
  if (temMotivoRegistrado(receita) || temMotivoRegistrado(custo)) return 'com_motivo';
  const semTexto = !receita && !custo;
  const soRecalculoSistema = [receita, custo].every((texto) => !texto || texto.includes('recalculado pelo sistema'));
  if (semTexto || soRecalculoSistema) return 'sem_motivo';
  return 'indeterminada';
}

export function textoAlteracaoPosterior(classe: ClassificacaoAlteracaoPosterior): string {
  if (classe === 'com_motivo') return DIVERGENCIA_ALTERACAO_COM_MOTIVO;
  if (classe === 'indeterminada') return DIVERGENCIA_ALTERACAO_INDETERMINADA;
  return DIVERGENCIA_ALTERACAO_REAL;
}

const CAMPOS_DETALHE_SNAPSHOT = [
  'franchiseKm',
  'franchiseHours',
  'unitKm',
  'unitHr',
  'activationFee',
  'kmExtraTotal',
  'hrExtraTotal',
  'kmExtraQtd',
  'hrExtraQtd',
  'durationHours',
] as const;

function objetoSnapshot(snapshot: unknown): Record<string, unknown> | null {
  if (snapshot == null) return null;
  if (typeof snapshot === 'string') {
    const texto = snapshot.trim();
    if (!texto || texto === 'null' || texto === '{}' || texto === '""') return null;
    try {
      return objetoSnapshot(JSON.parse(texto));
    } catch {
      return null;
    }
  }
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  if (Object.keys(snapshot as object).length === 0) return null;
  return snapshot as Record<string, unknown>;
}

function approvedByDoSnapshot(snapshot: unknown): unknown {
  return objetoSnapshot(snapshot)?.approved_by ?? null;
}

/** Origem do registro. O texto do recálculo nunca conta como pessoa. */
export function origemSnapshotFinanceiro(carimbo: unknown, snapshot?: unknown): OrigemSnapshotFinanceiro {
  if (carimboAprovacaoHumana(carimbo)) return 'humana';
  if (carimboRecalculoAutomatico(carimbo)) return 'automatica';
  if (String(carimbo ?? '').trim()) return 'indeterminada';
  const interno = approvedByDoSnapshot(snapshot);
  if (carimboAprovacaoHumana(interno)) return 'humana';
  if (carimboRecalculoAutomatico(interno)) return 'automatica';
  return 'indeterminada';
}

/** Pessoa que ajustou o JSON depois. Não homologa o carimbo automático. */
export function ressincronizadoPorHumano(snapshot: unknown): string | null {
  const nome = String(objetoSnapshot(snapshot)?.snapshot_resynced_by ?? '').trim();
  if (!nome || carimboRecalculoAutomatico(nome)) return null;
  return nome;
}

export function estadoDetalhamentoSnapshot(snapshot: unknown): EstadoDetalhamentoSnapshot {
  const obj = objetoSnapshot(snapshot);
  if (!obj) return 'invalido';
  const presentes = CAMPOS_DETALHE_SNAPSHOT.filter((campo) => {
    const valor = obj[campo];
    if (valor == null || valor === '') return false;
    return Number.isFinite(Number(valor));
  });
  if (presentes.length === 0) return 'incompleto';
  const algumInformado = presentes.some((campo) => Math.abs(Number(obj[campo])) > 0);
  return algumInformado ? 'valido' : 'zerado';
}

/**
 * OS aprovada mostra o detalhamento já gravado.
 * OS sem aprovação e só com o carimbo automático continua simulação.
 * Carimbo humano continua valendo mesmo antes do billing_approved.
 */
export function devePreservarDetalhamentoRegistrado(opts: {
  billingApproved?: boolean | null;
  carimbo: unknown;
  snapshot: unknown;
}): boolean {
  const estado = estadoDetalhamentoSnapshot(opts.snapshot);
  if (estado === 'invalido') return false;
  const origem = origemSnapshotFinanceiro(opts.carimbo, opts.snapshot);
  if (origem === 'humana') return true;
  return opts.billingApproved === true && (origem === 'automatica' || origem === 'indeterminada');
}

export function textoLeituraSnapshot(opts: {
  origem: OrigemSnapshotFinanceiro;
  aprovador: string | null;
  ressincronizadoPor: string | null;
  divergencia: string | null;
}): string {
  if (opts.divergencia) return opts.divergencia;
  if (opts.origem === 'humana' && opts.aprovador) {
    return `Dados congelados. Aprovado por ${opts.aprovador}.`;
  }
  if (opts.origem === 'automatica') {
    const ajuste = opts.ressincronizadoPor
      ? ` O JSON foi ajustado depois por ${opts.ressincronizadoPor}, sem homologação de pessoa no carimbo.`
      : '';
    return `Detalhamento registrado pelo recálculo automático. Não é aprovação humana.${ajuste}`;
  }
  return 'Detalhamento registrado. A origem do snapshot é indeterminada. A aprovação financeira segue billing_approved.';
}

/** Log automático não vira aprovação e não esconde um log humano mais antigo. */
export function primeiroLogDepoisDoAutomatico<T extends { approved_by?: unknown }>(logsDoMaisNovo: readonly T[]): T | null {
  for (const log of logsDoMaisNovo) {
    if (carimboRecalculoAutomatico(log.approved_by)) continue;
    return log;
  }
  return null;
}

/** Coluna já carimbada não é substituída. Log automático não é promovido. */
export function podePromoverLogSnapshot(colunaCarimbo: unknown, logApprovedBy: unknown): boolean {
  if (String(colunaCarimbo ?? '').trim()) return false;
  if (carimboRecalculoAutomatico(logApprovedBy)) return false;
  return true;
}
