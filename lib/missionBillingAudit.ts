import type { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { calculateMissionFinancials, extractCityFromAddress } from './financialUtils';
import { isAutoMasterRow } from './providerAutoPricing';
import { computeDhlBand } from './dhlAutoTableSelector';
import { missionEligibleForBillingAudit, isTerminalMissionStatusForAudit } from './missionBillingAuditConfig';

export type AuditStatusLevel = 'validado' | 'atencao' | 'erro' | 'pendente' | 'em_viagem';

export interface SideAuditDetail {
  status: 'validado' | 'erro';
  activation: number;
  franchiseKm: number;
  franchiseHours: number;
  kmRodado: number;
  kmExcedente: number;
  valorKmUnit: number;
  subtotalKm: number;
  tempoExecutadoHours: number;
  horaExcedente: number;
  valorHoraUnit: number;
  subtotalHora: number;
  esperado: number;
  lancado: number;
  diferenca: number;
  motivos: string[];
  tableName?: string;
}

export interface MissionBillingAuditResult {
  missionId: string;
  overallStatus: AuditStatusLevel;
  overallLabel: string;
  overallIcon: string;
  client: SideAuditDetail;
  provider: SideAuditDetail;
  resultadoFinal: 'VALIDADO' | 'ERRO';
  cacheKey: string;
  skipped: boolean;
  skipReason?: string;
  /** Resumo executivo para exibição no popup de auditoria */
  resumo: AuditExecutiveSummary;
}

export interface AuditExecutiveSummary {
  conclusao: string;
  pontos: string[];
  operacao: {
    kmRodado: number;
    duracaoHoras: number;
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

const safeNumber = (val: unknown): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim();
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const n = parseFloat(str);
  return Number.isNaN(n) ? 0 : n;
};

const auditCache = new Map<string, MissionBillingAuditResult>();

export function clearMissionBillingAuditCache(missionId?: string): void {
  if (!missionId) {
    auditCache.clear();
    return;
  }
  for (const key of auditCache.keys()) {
    if (key.startsWith(`${missionId}|`)) auditCache.delete(key);
  }
}

/** Hash leve das tabelas — O(1), sem varrer 1200+ linhas (evita travar a UI). */
export function computePricingTablesHash(
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
): string {
  const fold = (rows: Array<Record<string, unknown>>) => {
    let h = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const base = Number(r.activation_fee ?? r.activation_cost ?? 0);
      const fk = Number(r.franchise_km ?? 0);
      h = ((h << 5) - h + base + fk) | 0;
      if (i === 0 || i === rows.length - 1) {
        h = ((h << 5) - h + String(r.id ?? '').length) | 0;
      }
    }
    return h;
  };
  return `${clientTables.length}:${fold(clientTables as any[])}::${providerTables.length}:${fold(providerTables as any[])}`;
}

export function buildMissionAuditFingerprint(
  mission: Mission,
  tablesHash: string,
): string {
  const m = mission as Record<string, unknown>;
  return [
    mission.id,
    tablesHash,
    m.revenue_value,
    m.cost_value,
    m.start_km ?? m.startKm,
    m.end_km ?? m.endKm,
    m.start_time ?? m.startTime,
    m.end_time ?? m.endTime,
    m.provider_ops_edited,
    m.provider_start_km,
    m.provider_end_km,
    m.provider_start_time,
    m.provider_end_time,
    m.status,
    m.mission_type,
    m.is_same_os,
    m.revenue_edit_reason,
    m.cost_edit_reason,
    m.billing_approved,
    m.billing_verified_by,
    m.snapshot_approved_by,
    (m.snapshot_data as any)?.clientTableId,
    (m.snapshot_data as any)?.providerTableId,
  ].join('|');
}

const normalizeTableLabel = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/\\&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Resolve ID órfão do snapshot: tenta casar pelo nome da tabela / faixa antes de desistir. */
function resolveSnapshotClientTableId(
  snap: Record<string, unknown>,
  clientTables: ClientPriceTable[],
  mission: Mission,
): { id?: string; orphan: boolean } {
  const rawId = snap?.clientTableId ? String(snap.clientTableId) : undefined;
  const tableName = normalizeTableLabel(String(snap.tableName || ''));
  const missionClient = normalizeTableLabel(String((mission as any).originalClientName || mission.client || ''));
  const franchiseKm = Number(snap.franchiseKm || 0);
  const activationFee = Number(snap.activationFee || 0);

  const matchByTableName = (): string | undefined => {
    if (!tableName || tableName === '-') return undefined;
    const byName = clientTables.find((t) => {
      const op = normalizeTableLabel(t.operation_type || '');
      const tc = normalizeTableLabel(t.client || '');
      if (op !== tableName) return false;
      return !missionClient || tc.includes(missionClient) || missionClient.includes(tc);
    });
    return byName ? String(byName.id) : undefined;
  };

  const matchByFranchiseAndFee = (): string | undefined => {
    const byFranchise = clientTables.find((t) => {
      const tc = normalizeTableLabel(t.client || '');
      return (
        (t.franchise_km || 0) === franchiseKm &&
        Math.abs((t.activation_fee || 0) - activationFee) < 0.02 &&
        (!missionClient || tc.includes(missionClient) || missionClient.includes(tc))
      );
    });
    return byFranchise ? String(byFranchise.id) : undefined;
  };

  if (rawId) {
    const tableFromId = clientTables.find((t) => String(t.id) === rawId);
    if (tableFromId) {
      const opFromId = normalizeTableLabel(tableFromId.operation_type || '');
      const feeFromId = Number(tableFromId.activation_fee || 0);
      const nameMismatch = tableName && tableName !== '-' && opFromId !== tableName;
      const feeMismatch = activationFee > 0 && Math.abs(feeFromId - activationFee) > 0.02;
      // ID válido mas divergente do tableName/activationFee congelados no snapshot (ex.: troca manual de tabela).
      if (nameMismatch || feeMismatch) {
        const fromName = matchByTableName();
        if (fromName) return { id: fromName, orphan: false };
        const fromFee = matchByFranchiseAndFee();
        if (fromFee) return { id: fromFee, orphan: false };
      }
      return { id: rawId, orphan: false };
    }
  } else {
    const fromName = matchByTableName();
    if (fromName) return { id: fromName, orphan: false };
  }

  const byName = matchByTableName();
  if (byName) return { id: byName, orphan: false };

  const byFranchise = matchByFranchiseAndFee();
  if (byFranchise) return { id: byFranchise, orphan: false };

  // ID órfão sem fallback confiável — omitir override e deixar o motor auto selecionar.
  return { orphan: true };
}

/** Detecta snapshot com clientTableId divergente do tableName/activationFee congelados. */
export function getSnapshotClientTableCorrection(
  mission: Mission,
  clientTables: ClientPriceTable[],
): {
  needsFix: boolean;
  currentId?: string;
  correctedId?: string;
  correctedTable?: ClientPriceTable;
  reason?: string;
} {
  const snap = (mission as any).snapshot_data as Record<string, unknown> | null | undefined;
  if (!snap?.clientTableId) return { needsFix: false };

  const currentId = String(snap.clientTableId);
  const resolved = resolveSnapshotClientTableId(snap, clientTables, mission);
  if (!resolved.id || resolved.id === currentId) return { needsFix: false };

  const correctedTable = clientTables.find((t) => String(t.id) === resolved.id);
  const tableFromId = clientTables.find((t) => String(t.id) === currentId);
  const tableName = normalizeTableLabel(String(snap.tableName || ''));
  const opFromId = normalizeTableLabel(tableFromId?.operation_type || '');

  let reason = 'clientTableId diverge do snapshot';
  if (tableName && tableName !== '-' && opFromId && opFromId !== tableName) {
    reason = `ID apontava "${tableFromId?.operation_type}" mas snapshot tableName="${snap.tableName}"`;
  } else if (
    tableFromId &&
    correctedTable &&
    Math.abs(Number(tableFromId.activation_fee || 0) - Number(snap.activationFee || 0)) > 0.02
  ) {
    reason = `activationFee snapshot (${snap.activationFee}) ≠ tabela do ID (${tableFromId.activation_fee})`;
  }

  return {
    needsFix: true,
    currentId,
    correctedId: resolved.id,
    correctedTable,
    reason,
  };
}

function resolveSnapshotProviderTableId(
  snap: Record<string, unknown>,
  providerTables: ProviderCostTable[],
  _mission: Mission,
): { id?: string; orphan: boolean } {
  const rawId = snap?.providerTableId ? String(snap.providerTableId) : undefined;
  if (!rawId || rawId.startsWith('auto-')) return { id: rawId, orphan: false };
  if (providerTables.some((t) => String(t.id) === rawId)) return { id: rawId, orphan: false };

  // ID órfão: não adivinhar tabela — omitir override e deixar o motor auto do fornecedor.
  return { orphan: true };
}

export interface BillingAdjustmentRecord {
  clientTableId?: string;
  providerTableId?: string;
  clientTableName?: string;
  providerTableName?: string;
  customClientBase?: number | null;
  customClientKm?: number | null;
  customClientHour?: number | null;
  customProviderBase?: number | null;
  customProviderKm?: number | null;
  customProviderHour?: number | null;
  disableFixedKmRule?: boolean;
  revenueTotal?: number;
  costTotal?: number;
  systemCalculatedRevenue?: number;
  systemCalculatedCost?: number;
}

/** Parseia o log BillingAdjustment (mesma fonte do MissionFinancialModal). */
export function parseBillingAdjustment(details: unknown): BillingAdjustmentRecord | null {
  if (!details) return null;
  try {
    const raw = typeof details === 'string' ? JSON.parse(details) : details;
    if (!raw || typeof raw !== 'object') return null;
    const adj = raw as Record<string, unknown>;
    if (!adj.clientTableId && !adj.providerTableId) return null;
    return {
      clientTableId: adj.clientTableId ? String(adj.clientTableId) : undefined,
      providerTableId: adj.providerTableId ? String(adj.providerTableId) : undefined,
      clientTableName: adj.clientTableName ? String(adj.clientTableName) : undefined,
      providerTableName: adj.providerTableName ? String(adj.providerTableName) : undefined,
      customClientBase: adj.customClientBase != null ? Number(adj.customClientBase) : null,
      customClientKm: adj.customClientKm != null ? Number(adj.customClientKm) : null,
      customClientHour: adj.customClientHour != null ? Number(adj.customClientHour) : null,
      customProviderBase: adj.customProviderBase != null ? Number(adj.customProviderBase) : null,
      customProviderKm: adj.customProviderKm != null ? Number(adj.customProviderKm) : null,
      customProviderHour: adj.customProviderHour != null ? Number(adj.customProviderHour) : null,
      disableFixedKmRule: !!adj.disableFixedKmRule,
      revenueTotal: adj.revenueTotal != null ? Number(adj.revenueTotal) : undefined,
      costTotal: adj.costTotal != null ? Number(adj.costTotal) : undefined,
      systemCalculatedRevenue:
        adj.systemCalculatedRevenue != null ? Number(adj.systemCalculatedRevenue) : undefined,
      systemCalculatedCost:
        adj.systemCalculatedCost != null ? Number(adj.systemCalculatedCost) : undefined,
    };
  } catch {
    return null;
  }
}

/** Busca BillingAdjustment apenas das OS informadas (muito mais rápido que varrer system_logs inteiro). */
export async function fetchBillingAdjustmentsForMissionIds(
  supabaseClient: { from: (table: string) => any },
  missionIds: string[],
): Promise<Map<string, BillingAdjustmentRecord>> {
  if (missionIds.length === 0) return new Map();

  const uniqueIds = [...new Set(missionIds.filter(Boolean))];
  const chunkSize = 150;
  let rows: Array<{ entity_id?: string; details?: unknown; created_at?: string }> = [];

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabaseClient
      .from('system_logs')
      .select('entity_id, details, created_at')
      .eq('entity', 'BillingAdjustment')
      .in('entity_id', chunk)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (data) rows = rows.concat(data);
  }

  return indexBillingAdjustments(rows);
}

/** Monta mapa missionId → último BillingAdjustment (ordenar created_at desc). */
export function indexBillingAdjustments(
  rows: Array<{ entity_id?: string; details?: unknown }>,
): Map<string, BillingAdjustmentRecord> {
  const map = new Map<string, BillingAdjustmentRecord>();
  for (const row of rows) {
    const id = row.entity_id ? String(row.entity_id) : '';
    if (!id || map.has(id)) continue;
    const parsed = parseBillingAdjustment(row.details);
    if (parsed) map.set(id, parsed);
  }
  return map;
}

function buildBillingAdjustmentTableOverrides(
  adj: BillingAdjustmentRecord,
): Record<string, unknown> | undefined {
  const override: Record<string, unknown> = {};
  if (adj.clientTableId && !String(adj.clientTableId).startsWith('auto-')) {
    override.clientTableId = adj.clientTableId;
  }
  if (adj.providerTableId && !String(adj.providerTableId).startsWith('auto-')) {
    override.providerTableId = adj.providerTableId;
  }
  if (adj.customClientBase != null) override.customClientBase = adj.customClientBase;
  if (adj.customClientKm != null) override.customClientUnitKm = adj.customClientKm;
  if (adj.customClientHour != null) override.customClientUnitHour = adj.customClientHour;
  if (adj.customProviderBase != null) override.customProviderBase = adj.customProviderBase;
  if (adj.customProviderKm != null) override.customProviderUnitKm = adj.customProviderKm;
  if (adj.customProviderHour != null) override.customProviderUnitHour = adj.customProviderHour;
  if (adj.disableFixedKmRule) override.disableFixedKmRule = true;
  return Object.keys(override).length > 0 ? override : undefined;
}

/**
 * Fonte de tabelas para auditoria — mesma ordem do modal financeiro:
 * 1) snapshot aprovado  2) BillingAdjustment salvo  3) medição fornecedor editada
 */
export function buildAuditTableOverrides(
  mission: Mission,
  clientTables: ClientPriceTable[] = [],
  providerTables: ProviderCostTable[] = [],
  billingAdjustment?: BillingAdjustmentRecord | null,
): Record<string, unknown> | undefined {
  const snap = (mission as any).snapshot_data as Record<string, unknown> | null | undefined;
  const snapshotOverrides = buildSnapshotTableOverrides(mission, clientTables, providerTables);
  const providerOpsOverride = buildProviderOpsOverride(mission);

  // Mesma prioridade do modal: BillingAdjustment (salvamento manual) > snapshot > medição fornecedor.
  if (billingAdjustment) {
    const adjOverrides = buildBillingAdjustmentTableOverrides(billingAdjustment);
    if (adjOverrides || providerOpsOverride) {
      return {
        ...(adjOverrides || {}),
        ...(providerOpsOverride ? { providerOpsOverride } : {}),
      };
    }
  }

  if (snap?.clientTableId || snap?.providerTableId) {
    return snapshotOverrides as Record<string, unknown> | undefined;
  }

  if (!providerOpsOverride) {
    return snapshotOverrides as Record<string, unknown> | undefined;
  }

  return {
    ...(providerOpsOverride ? { providerOpsOverride } : {}),
  };
}

/** Tabelas congeladas no snapshot de aprovação (mesma regra do modal/boletim). */
export function buildSnapshotTableOverrides(
  mission: Mission,
  clientTables: ClientPriceTable[] = [],
  providerTables: ProviderCostTable[] = [],
): {
  clientTableId?: string;
  providerTableId?: string;
  providerOpsOverride?: { distanceKm: number; durationHours: number };
  clientTableOrphan?: boolean;
  providerTableOrphan?: boolean;
} | undefined {
  const snap = (mission as any).snapshot_data as Record<string, unknown> | null | undefined;
  const providerOpsOverride = buildProviderOpsOverride(mission);

  if (!snap) {
    if (!providerOpsOverride) return undefined;
    return { ...(providerOpsOverride ? { providerOpsOverride } : {}) };
  }

  const clientResolved = resolveSnapshotClientTableId(snap, clientTables, mission);
  const providerResolved = resolveSnapshotProviderTableId(snap, providerTables, mission);

  if (
    !clientResolved.id &&
    !providerResolved.id &&
    !providerOpsOverride &&
    !clientResolved.orphan &&
    !providerResolved.orphan
  ) {
    return undefined;
  }

  return {
    ...(clientResolved.id ? { clientTableId: clientResolved.id } : {}),
    ...(providerResolved.id ? { providerTableId: providerResolved.id } : {}),
    ...(providerOpsOverride ? { providerOpsOverride } : {}),
    ...(clientResolved.orphan ? { clientTableOrphan: true } : {}),
    ...(providerResolved.orphan ? { providerTableOrphan: true } : {}),
  };
}

/** Mesma regra do MissionFinancialModal quando fornecedor tem medição editada. */
export function buildProviderOpsOverride(
  mission: Mission,
): { distanceKm: number; durationHours: number } | undefined {
  if (!(mission as any).provider_ops_edited) return undefined;

  const getKm = (val: unknown) =>
    typeof val === 'number' ? val : parseFloat(String(val ?? '0').replace(',', '.'));

  const pStartKm =
    (mission as any).provider_start_km != null
      ? getKm((mission as any).provider_start_km)
      : getKm((mission as any).startKm ?? (mission as any).start_km);
  const pEndKm =
    (mission as any).provider_end_km != null
      ? getKm((mission as any).provider_end_km)
      : getKm((mission as any).endKm ?? (mission as any).end_km);
  const pHasValidKms = pStartKm > 0 && pEndKm > 0 && pEndKm >= pStartKm;
  const pDistanceKm = pHasValidKms
    ? pEndKm - pStartKm
    : safeNumber((mission as any).totalDistance ?? (mission as any).total_distance);

  const pStartTime = (mission as any).provider_start_time
    ? new Date((mission as any).provider_start_time)
    : (mission as any).startTime
      ? new Date((mission as any).startTime)
      : (mission as any).start_time
        ? new Date((mission as any).start_time)
        : null;
  const pEndTime = (mission as any).provider_end_time
    ? new Date((mission as any).provider_end_time)
    : (mission as any).endTime
      ? new Date((mission as any).endTime)
      : (mission as any).end_time
        ? new Date((mission as any).end_time)
        : null;

  let pDurationHours = 0;
  if (pStartTime && pEndTime && !Number.isNaN(pStartTime.getTime()) && !Number.isNaN(pEndTime.getTime())) {
    pDurationHours = Math.max(0, (pEndTime.getTime() - pStartTime.getTime()) / (1000 * 60 * 60));
  }

  return { distanceKm: pDistanceKm, durationHours: pDurationHours };
}

function detectMotivos(
  side: Pick<
    SideAuditDetail,
    'activation' | 'kmExcedente' | 'horaExcedente' | 'subtotalKm' | 'subtotalHora' | 'esperado'
  >,
  lancado: number,
): string[] {
  const diff = round2(lancado - side.esperado);
  if (Math.abs(diff) < 0.005) return [];

  const motivos: string[] = [];
  const esperadoSemExtras = round2(side.activation);
  const esperadoSoKm = round2(side.activation + side.subtotalKm);
  const esperadoSoHr = round2(side.activation + side.subtotalHora);

  if (diff < 0) {
    if (side.kmExcedente > 0 && side.subtotalKm > 0) {
      if (Math.abs(lancado - esperadoSoHr) < 1 || Math.abs(lancado - esperadoSemExtras) < 1) {
        motivos.push('KM excedente não cobrado');
      }
    }
    if (side.horaExcedente > 0 && side.subtotalHora > 0) {
      if (Math.abs(lancado - esperadoSoKm) < 1 || Math.abs(lancado - esperadoSemExtras) < 1) {
        motivos.push('Hora excedente não cobrada');
      }
    }
    if (motivos.length === 0) motivos.push('Valor divergente');
    return [...new Set(motivos)];
  }

  if (side.kmExcedente === 0 && side.subtotalKm === 0 && lancado > esperadoSoHr + 0.5) {
    motivos.push('KM cobrado indevidamente');
  }
  if (side.horaExcedente === 0 && side.subtotalHora === 0 && lancado > esperadoSoKm + 0.5) {
    motivos.push('Hora cobrada indevidamente');
  }
  if (motivos.length === 0) motivos.push('Valor divergente');
  return [...new Set(motivos)];
}

function buildSideDetail(
  finSide: {
    serviceTotal: number;
    base: number;
    excessKm: number;
    excessHours: number;
    extraKmVal: number;
    extraHrVal: number;
    unitPriceKm?: number;
    unitCostKm?: number;
    unitPriceHour?: number;
    unitCostHour?: number;
    franchiseKm: number;
    franchiseHours: number;
    tableName?: string;
  },
  kmRodado: number,
  tempoHours: number,
  lancado: number,
): SideAuditDetail {
  const valorKmUnit = finSide.unitPriceKm ?? finSide.unitCostKm ?? 0;
  const valorHoraUnit = finSide.unitPriceHour ?? finSide.unitCostHour ?? 0;
  const esperado = round2(finSide.serviceTotal);
  const lancadoR = round2(lancado);
  const diferenca = round2(lancadoR - esperado);
  const absDiff = Math.abs(diferenca);

  const partial: SideAuditDetail = {
    status: absDiff < 0.005 ? 'validado' : 'erro',
    activation: round2(finSide.base),
    franchiseKm: finSide.franchiseKm,
    franchiseHours: finSide.franchiseHours,
    kmRodado: round2(kmRodado),
    kmExcedente: round2(finSide.excessKm),
    valorKmUnit: round2(valorKmUnit),
    subtotalKm: round2(finSide.extraKmVal),
    tempoExecutadoHours: round2(tempoHours),
    horaExcedente: round2(finSide.excessHours),
    valorHoraUnit: round2(valorHoraUnit),
    subtotalHora: round2(finSide.extraHrVal),
    esperado,
    lancado: lancadoR,
    diferenca,
    motivos: [],
    tableName: finSide.tableName,
  };

  partial.motivos = detectMotivos(partial, lancadoR);
  return partial;
}

function enrichSideMotivos(
  side: SideAuditDetail,
  lado: 'cliente' | 'fornecedor',
  tableMissing?: boolean,
): SideAuditDetail {
  const copy = { ...side, motivos: [...side.motivos] };
  if (tableMissing && copy.lancado > 0 && Math.abs(copy.esperado) < 0.005) {
    copy.motivos.unshift(
      `Tabela de ${lado === 'cliente' ? 'preço' : 'custo'} do snapshot não encontrada no cadastro (ID órfão)`,
    );
  } else if (Math.abs(copy.diferenca) >= 0.005 && copy.motivos.length === 0) {
    if (copy.diferenca < 0) {
      if (copy.kmExcedente > 0 && copy.subtotalKm > 0) copy.motivos.push('KM excedente não cobrado ou subcobrado');
      if (copy.horaExcedente > 0 && copy.subtotalHora > 0) copy.motivos.push('Hora excedente não cobrada ou subcobrada');
    } else {
      if (copy.kmExcedente === 0 && copy.subtotalKm === 0) copy.motivos.push('KM cobrado indevidamente');
      if (copy.horaExcedente === 0 && copy.subtotalHora === 0) copy.motivos.push('Hora cobrada indevidamente');
    }
    if (copy.motivos.length === 0) copy.motivos.push('Valor divergente da tabela aplicada');
  }
  copy.status = Math.abs(copy.diferenca) < 0.005 ? 'validado' : 'erro';
  return copy;
}

function buildAuditExecutiveSummary(
  audit: Pick<MissionBillingAuditResult, 'overallStatus' | 'overallLabel' | 'client' | 'provider' | 'resultadoFinal' | 'skipped' | 'skipReason'>,
  kmRodado: number,
  duracaoHoras: number,
): AuditExecutiveSummary {
  const pontos: string[] = [];
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (audit.skipped) {
    return {
      conclusao: audit.skipReason || 'Auditoria indisponível para esta OS.',
      pontos: ['Não há valores suficientes para comparar receita/custo com a tabela.'],
      operacao: { kmRodado, duracaoHoras },
    };
  }

  const clientOk = Math.abs(audit.client.diferenca) < 0.005;
  const providerOk = Math.abs(audit.provider.diferenca) < 0.005;

  if (clientOk) {
    pontos.push(`Cliente: ${fmt(audit.client.lancado)} está correto (tabela ${audit.client.tableName || 'aplicada'}).`);
  } else {
    pontos.push(
      `Cliente: lançado ${fmt(audit.client.lancado)} vs esperado ${fmt(audit.client.esperado)} (Δ ${fmt(audit.client.diferenca)}).`,
    );
    audit.client.motivos.forEach((m) => pontos.push(`→ ${m}`));
  }

  if (providerOk) {
    pontos.push(`Fornecedor: ${fmt(audit.provider.lancado)} está correto (tabela ${audit.provider.tableName || 'aplicada'}).`);
  } else {
    pontos.push(
      `Fornecedor: lançado ${fmt(audit.provider.lancado)} vs esperado ${fmt(audit.provider.esperado)} (Δ ${fmt(audit.provider.diferenca)}).`,
    );
    audit.provider.motivos.forEach((m) => pontos.push(`→ ${m}`));
  }

  let conclusao: string;
  if (audit.overallStatus === 'validado') {
    const hasSmallManualDelta =
      (Math.abs(audit.client.diferenca) >= 0.005 && Math.abs(audit.client.diferenca) < 1) ||
      (Math.abs(audit.provider.diferenca) >= 0.005 && Math.abs(audit.provider.diferenca) < 1);
    conclusao = hasSmallManualDelta
      ? 'Valores confirmados manualmente pelo operador — diferença inferior a R$ 1,00 aceita na conferência.'
      : 'Receita e custo conferem com o cálculo das tabelas aplicadas. Nenhuma divergência encontrada.';
  } else if (audit.overallStatus === 'atencao') {
    conclusao = 'Diferença inferior a R$ 1,00 — revisar antes de fechar, mas dentro da tolerância de atenção.';
  } else {
    const lados: string[] = [];
    if (!clientOk) lados.push('cliente');
    if (!providerOk) lados.push('fornecedor');
    conclusao = `Divergência no ${lados.join(' e ')} — o valor lançado não bate com o cálculo automático pela tabela.`;
  }

  return { conclusao, pontos, operacao: { kmRodado, duracaoHoras } };
}

const normEntityName = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/\\&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function isSyntheticTableId(id: unknown): boolean {
  return String(id || '').startsWith('auto-');
}

function isAutoEngineTableSide(sideFin: { tableId?: string; tableName?: string }): boolean {
  return isSyntheticTableId(sideFin.tableId) || (sideFin.tableName || '').toUpperCase().includes('AUTO');
}

function filterClientTablesForMission(mission: Mission, clientTables: ClientPriceTable[]): ClientPriceTable[] {
  const missionClient = normEntityName(String((mission as any).originalClientName || mission.client || ''));
  return clientTables.filter((t) => {
    if (isAutoMasterRow(t as any)) return false;
    if (!missionClient) return true;
    const tc = normEntityName(String(t.client || ''));
    return tc.includes(missionClient) || missionClient.includes(tc);
  });
}

function filterProviderTablesForMission(mission: Mission, providerTables: ProviderCostTable[]): ProviderCostTable[] {
  const target = normEntityName(mission.provider || '');
  return providerTables.filter((t) => {
    if (isAutoMasterRow(t as any)) return false;
    if (!target) return true;
    const tp = normEntityName(String(t.provider || ''));
    if (!tp || tp.length <= 2) return false;
    if (tp.includes(target) || target.includes(tp)) return true;
    const words = target.split(/\s+/).filter((w) => w.length > 2);
    return words.some((w) => tp.includes(w));
  });
}

function shouldTryRealCatalogMatch(
  sideFin: { tableId?: string; tableName?: string; serviceTotal: number; franchiseKm?: number },
  lancado: number,
  kmRodado?: number,
): boolean {
  const diff = Math.abs(round2(lancado - sideFin.serviceTotal));
  if (diff < 0.005) return false;
  // Motor automático (ex. COMANDO G8 AUTO 100KM) vs tabela real do cadastro.
  if (isAutoEngineTableSide(sideFin)) return true;
  const franq = sideFin.franchiseKm ?? 0;
  const km = kmRodado ?? 0;
  // Franquia muito acima do KM rodado → provável uso de KM previsto (ex. GTM-6258).
  if (km > 0 && franq >= 200 && franq >= km * 2) return true;
  // Rota nomeada errada: franquia alinhada ao KM real mas motor escolheu outra tabela
  // (ex. GTM-6235: LOUVEIRA-SERRA 971km correta vs ANAPOLIS 965km sugerida).
  if (km > 0 && franq >= 200 && Math.abs(franq - km) <= 40 && diff >= 1) return true;
  // Divergência relevante — busca tabela real que reproduz o valor lançado.
  if (diff >= 1) return true;
  return false;
}

/** Reduz varredura do catálogo no batch — foca na faixa compatível com o KM rodado. */
function narrowCatalogCandidates(
  candidates: (ClientPriceTable | ProviderCostTable)[],
  kmRodado: number,
  isAutoSide: boolean,
): (ClientPriceTable | ProviderCostTable)[] {
  if (isAutoSide || kmRodado <= 0 || candidates.length <= 40) return candidates;
  const band = computeDhlBand(kmRodado);
  const narrowed = candidates.filter((t) => {
    const fk = (t as any).franchise_km || 0;
    if (fk <= 0) return false;
    return Math.abs(fk - band) <= 50 || (fk >= kmRodado && fk <= band + 100);
  });
  return narrowed.length > 0 ? narrowed : candidates.slice(0, 40);
}

/** Quando motor auto/snapshot erra, tenta casar valor lançado com tabela REAL do cadastro. */
function tryMatchRealCatalogTable(
  side: 'cliente' | 'fornecedor',
  mission: Mission,
  mObj: Mission,
  lancado: number,
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientData: Client | undefined,
  providers: any[] | null | undefined,
  tableOverrides: Record<string, unknown> | undefined,
  sideFin: { tableId?: string; tableName?: string; serviceTotal: number },
  kmRodado: number,
  tempoHours: number,
  snap?: Record<string, unknown> | null,
): SideAuditDetail | null {
  if (!shouldTryRealCatalogMatch(sideFin, lancado, kmRodado)) return null;

  const candidates = narrowCatalogCandidates(
    side === 'cliente'
      ? filterClientTablesForMission(mission, clientTables)
      : filterProviderTablesForMission(mission, providerTables),
    kmRodado,
    isAutoEngineTableSide(sideFin),
  );

  const snapTableName =
    side === 'cliente' && snap?.tableName
      ? normalizeTableLabel(String(snap.tableName))
      : '';

  type MatchRow = {
    table: ClientPriceTable | ProviderCostTable;
    sideFinCalc: ReturnType<typeof calculateMissionFinancials>['client'];
    diff: number;
  };

  const matches: MatchRow[] = [];

  for (const table of candidates) {
    if (isSyntheticTableId(table.id)) continue;
    const override = {
      ...(tableOverrides || {}),
      ...(side === 'cliente'
        ? { clientTableId: String(table.id) }
        : { providerTableId: String(table.id) }),
    };
    const calc = calculateMissionFinancials(
      mObj,
      clientTables,
      providerTables,
      clientData,
      new Date(),
      override,
      providers,
    );
    const finSide = side === 'cliente' ? calc.client : calc.provider;
    const diff = round2(lancado - finSide.serviceTotal);
    if (Math.abs(diff) < 0.005) {
      matches.push({ table, sideFinCalc: finSide, diff });
    }
  }

  if (matches.length === 0) return null;

  const pickBest = (): MatchRow => {
    if (snapTableName && snapTableName !== '-') {
      const bySnap = matches.find(
        (m) => normalizeTableLabel(String(m.table.operation_type || '')) === snapTableName,
      );
      if (bySnap) return bySnap;
    }
    const originCity = normalizeTableLabel(extractCityFromAddress(mission.origin || ''));
    const destCity = normalizeTableLabel(extractCityFromAddress(mission.destination || ''));
    return [...matches].sort((a, b) => {
      const opA = normalizeTableLabel(String(a.table.operation_type || ''));
      const opB = normalizeTableLabel(String(b.table.operation_type || ''));
      if (destCity) {
        const destA = opA.includes(destCity) ? 0 : 1;
        const destB = opB.includes(destCity) ? 0 : 1;
        if (destA !== destB) return destA - destB;
      }
      if (originCity) {
        const origA = opA.includes(originCity) ? 0 : 1;
        const origB = opB.includes(originCity) ? 0 : 1;
        if (origA !== origB) return origA - origB;
      }
      const proxA = Math.abs(((a.table as any).franchise_km || 0) - kmRodado);
      const proxB = Math.abs(((b.table as any).franchise_km || 0) - kmRodado);
      if (proxA !== proxB) return proxA - proxB;
      const kmA = (a.table as any).franchise_km || 0;
      const kmB = (b.table as any).franchise_km || 0;
      if (kmA !== kmB) return kmA - kmB;
      const baseA = (a.table as any).activation_fee ?? (a.table as any).activation_cost ?? 0;
      const baseB = (b.table as any).activation_fee ?? (b.table as any).activation_cost ?? 0;
      return baseA - baseB;
    })[0];
  };

  const best = pickBest();
  const detail = buildSideDetail(best.sideFinCalc, kmRodado, tempoHours, lancado);
  if (Math.abs(detail.diferenca) >= 0.005) return null;
  return { ...detail, motivos: [] };
}

function resolveOverallStatus(
  clientDiff: number,
  providerDiff: number,
  hasComparableValues: boolean,
  opts?: { clientManualSave?: boolean; providerManualSave?: boolean },
): Pick<MissionBillingAuditResult, 'overallStatus' | 'overallLabel' | 'overallIcon' | 'resultadoFinal'> {
  if (!hasComparableValues) {
    return {
      overallStatus: 'pendente',
      overallLabel: 'PENDENTE',
      overallIcon: '⚪',
      resultadoFinal: 'ERRO',
    };
  }

  const sideOk = (diff: number, manualSave?: boolean) => {
    const abs = Math.abs(round2(diff));
    if (abs < 0.005) return true;
    // Salvamento manual confirmado: diferença < R$ 1 não gera alerta.
    if (abs < 1 && manualSave) return true;
    return false;
  };

  const clientOk = sideOk(clientDiff, opts?.clientManualSave);
  const providerOk = sideOk(providerDiff, opts?.providerManualSave);

  if (clientOk && providerOk) {
    return {
      overallStatus: 'validado',
      overallLabel: 'VALIDADO',
      overallIcon: '🟢',
      resultadoFinal: 'VALIDADO',
    };
  }

  const maxAbs = Math.max(
    clientOk ? 0 : Math.abs(clientDiff),
    providerOk ? 0 : Math.abs(providerDiff),
  );

  if (maxAbs < 1) {
    return {
      overallStatus: 'atencao',
      overallLabel: 'ATENÇÃO',
      overallIcon: '🟡',
      resultadoFinal: 'ERRO',
    };
  }

  return {
    overallStatus: 'erro',
    overallLabel: 'ERRO',
    overallIcon: '🔴',
    resultadoFinal: 'ERRO',
  };
}

/** Salvamento manual confirmado no modal — operador aceitou o valor lançado. */
export function hasManualSaveConfirmed(editReason: string | null | undefined): boolean {
  return String(editReason || '')
    .toLowerCase()
    .includes('salvamento manual confirmado');
}

function applyManualSaveTolerance(
  detail: SideAuditDetail,
  manualSave: boolean,
): SideAuditDetail {
  if (manualSave && Math.abs(detail.diferenca) >= 0.005 && Math.abs(detail.diferenca) < 1) {
    return { ...detail, status: 'validado', motivos: [] };
  }
  return detail;
}

function emptyAuditSide(): SideAuditDetail {
  return {
    status: 'validado',
    activation: 0,
    franchiseKm: 0,
    franchiseHours: 0,
    kmRodado: 0,
    kmExcedente: 0,
    valorKmUnit: 0,
    subtotalKm: 0,
    tempoExecutadoHours: 0,
    horaExcedente: 0,
    valorHoraUnit: 0,
    subtotalHora: 0,
    esperado: 0,
    lancado: 0,
    diferenca: 0,
    motivos: [],
  };
}

function buildSkippedAuditResult(
  mission: Mission,
  fingerprint: string,
  opts: {
    overallStatus: AuditStatusLevel;
    overallLabel: string;
    overallIcon: string;
    skipReason: string;
    resumoPontos?: string[];
  },
): MissionBillingAuditResult {
  const empty = emptyAuditSide();
  const result: MissionBillingAuditResult = {
    missionId: mission.id || '',
    overallStatus: opts.overallStatus,
    overallLabel: opts.overallLabel,
    overallIcon: opts.overallIcon,
    client: empty,
    provider: empty,
    resultadoFinal: 'ERRO',
    cacheKey: fingerprint,
    skipped: true,
    skipReason: opts.skipReason,
    resumo: {
      conclusao: opts.skipReason,
      pontos: opts.resumoPontos || [],
      operacao: { kmRodado: 0, duracaoHoras: 0 },
    },
  };
  auditCache.set(fingerprint, result);
  return result;
}

export function computeMissionBillingAudit(
  mission: Mission,
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientData?: Client,
  providers?: any[] | null,
  tablesHash?: string,
  billingAdjustment?: BillingAdjustmentRecord | null,
): MissionBillingAuditResult {
  const hash = tablesHash ?? computePricingTablesHash(clientTables, providerTables);
  const adjKey = billingAdjustment
    ? `|adj:${billingAdjustment.clientTableId || ''}:${billingAdjustment.providerTableId || ''}:${billingAdjustment.revenueTotal ?? ''}:${billingAdjustment.costTotal ?? ''}:${billingAdjustment.customClientBase ?? ''}:${billingAdjustment.customProviderBase ?? ''}`
    : '';
  const fingerprint = `${buildMissionAuditFingerprint(mission, hash)}${adjKey}`;
  const cached = auditCache.get(fingerprint);
  if (cached) return cached;

  if (!missionEligibleForBillingAudit(mission)) {
    return buildSkippedAuditResult(mission, fingerprint, {
      overallStatus: 'pendente',
      overallLabel: 'PENDENTE',
      overallIcon: '⚪',
      skipReason: 'Fora do período de auditoria (a partir de jun/2026)',
      resumoPontos: ['Não há valores suficientes para comparar receita/custo com a tabela.'],
    });
  }

  const missionStatus = String((mission as any).status || '');

  if (!isTerminalMissionStatusForAudit(missionStatus)) {
    return buildSkippedAuditResult(mission, fingerprint, {
      overallStatus: 'em_viagem',
      overallLabel: 'EM VIAGEM',
      overallIcon: '🛣️',
      skipReason: 'OS em andamento — a auditoria roda quando a OS for concluída, recusada ou cancelada.',
      resumoPontos: [
        `Status atual: ${missionStatus || '—'}.`,
        'Aguarde a conclusão da operação para validar receita e custo.',
      ],
    });
  }

  const status = missionStatus.toUpperCase();
  const isRefused = status.includes('RECUS');
  const isCancelled = status.includes('CANCEL');

  const lancadoReceita = safeNumber((mission as any).revenue_value);
  const lancadoCusto = (mission as any).is_same_os
    ? 0
    : safeNumber((mission as any).cost_value);

  const hasComparableValues =
    status.includes('CONCLU') ||
    isRefused ||
    isCancelled ||
    lancadoReceita > 0 ||
    lancadoCusto > 0;

  if (!hasComparableValues) {
    return buildSkippedAuditResult(mission, fingerprint, {
      overallStatus: 'pendente',
      overallLabel: 'PENDENTE',
      overallIcon: '⚪',
      skipReason: 'Sem valores lançados',
      resumoPontos: ['Não há valores suficientes para comparar receita/custo com a tabela.'],
    });
  }

  const mObj = {
    ...mission,
    startKm: (mission as any).startKm ?? (mission as any).start_km,
    endKm: (mission as any).endKm ?? (mission as any).end_km,
    startTime: (mission as any).startTime ?? (mission as any).start_time,
    endTime: (mission as any).endTime ?? (mission as any).end_time,
  };

  const providerOpsOverride = buildProviderOpsOverride(mission);
  const tableOverrides = buildAuditTableOverrides(
    mission,
    clientTables,
    providerTables,
    billingAdjustment,
  );
  const snap = (mission as any).snapshot_data as Record<string, unknown> | null | undefined;
  const adjClient = !!billingAdjustment?.clientTableId;
  const adjProvider = !!billingAdjustment?.providerTableId;
  // Só bloqueia busca no catálogo quando há salvamento manual (BillingAdjustment).
  const skipClientCatalog = adjClient;
  const skipProviderCatalog = adjProvider;
  const clientTableMissing = !!(
    snap?.clientTableId &&
    !clientTables.some((t) => String(t.id) === String(snap.clientTableId)) &&
    !tableOverrides?.clientTableId
  );
  const providerTableMissing = !!(
    snap?.providerTableId &&
    !String(snap.providerTableId).startsWith('auto-') &&
    !providerTables.some((t) => String(t.id) === String(snap.providerTableId)) &&
    !tableOverrides?.providerTableId
  );

  const fin = calculateMissionFinancials(
    mObj,
    clientTables,
    providerTables,
    clientData,
    new Date(),
    tableOverrides,
    providers,
  );

  const providerKmRodado = providerOpsOverride?.distanceKm ?? fin.realTraveledKm;
  const providerTempoHours = providerOpsOverride?.durationHours ?? fin.durationHours;

  let clientDetail = buildSideDetail(
    fin.client,
    fin.realTraveledKm,
    fin.durationHours,
    lancadoReceita,
  );

  let providerDetail = buildSideDetail(
    fin.provider,
    providerKmRodado,
    providerTempoHours,
    lancadoCusto,
  );

  // Só busca tabela no catálogo quando NÃO há BillingAdjustment (salvamento manual no modal).
  if (!skipClientCatalog) {
    const clientCatalogMatch = tryMatchRealCatalogTable(
      'cliente',
      mission,
      mObj,
      lancadoReceita,
      clientTables,
      providerTables,
      clientData,
      providers,
      tableOverrides,
      fin.client,
      fin.realTraveledKm,
      fin.durationHours,
      snap,
    );
    if (clientCatalogMatch) clientDetail = clientCatalogMatch;
  }

  if (!(mission as any).is_same_os && !skipProviderCatalog) {
    const providerCatalogMatch = tryMatchRealCatalogTable(
      'fornecedor',
      mission,
      mObj,
      lancadoCusto,
      clientTables,
      providerTables,
      clientData,
      providers,
      tableOverrides,
      fin.provider,
      providerKmRodado,
      providerTempoHours,
      snap,
    );
    if (providerCatalogMatch) providerDetail = providerCatalogMatch;
  }

  clientDetail = enrichSideMotivos(clientDetail, 'cliente', clientTableMissing);
  providerDetail = enrichSideMotivos(providerDetail, 'fornecedor', providerTableMissing);

  const clientManualSave = hasManualSaveConfirmed((mission as any).revenue_edit_reason);
  const providerManualSave = hasManualSaveConfirmed((mission as any).cost_edit_reason);
  clientDetail = applyManualSaveTolerance(clientDetail, clientManualSave);
  providerDetail = applyManualSaveTolerance(providerDetail, providerManualSave);

  const overall = resolveOverallStatus(
    clientDetail.diferenca,
    providerDetail.diferenca,
    true,
    { clientManualSave, providerManualSave },
  );

  const result: MissionBillingAuditResult = {
    missionId: mission.id || '',
    ...overall,
    client: clientDetail,
    provider: providerDetail,
    cacheKey: fingerprint,
    skipped: false,
    resumo: buildAuditExecutiveSummary(
      { overallStatus: overall.overallStatus, overallLabel: overall.overallLabel, client: clientDetail, provider: providerDetail, resultadoFinal: overall.resultadoFinal, skipped: false },
      fin.realTraveledKm,
      fin.durationHours,
    ),
  };

  auditCache.set(fingerprint, result);
  return result;
}

export function auditMissionsBatch(
  missions: Mission[],
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientsData: Client[] = [],
  providers?: any[] | null,
  billingAdjustments?: Map<string, BillingAdjustmentRecord>,
): Map<string, MissionBillingAuditResult> {
  const tablesHash = computePricingTablesHash(clientTables, providerTables);
  const map = new Map<string, MissionBillingAuditResult>();

  for (const m of missions) {
    const clientMatch = clientsData.find(
      (c) => c.name === (m as any).originalClientName || c.name === m.client,
    );
    const adj = m.id ? billingAdjustments?.get(m.id) : undefined;
    map.set(
      m.id,
      computeMissionBillingAudit(
        m,
        clientTables,
        providerTables,
        clientMatch,
        providers,
        tablesHash,
        adj,
      ),
    );
  }

  return map;
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Auditoria em lotes com yield — não bloqueia a thread principal da UI.
 */
export async function auditMissionsBatchAsync(
  missions: Mission[],
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientsData: Client[] = [],
  providers?: any[] | null,
  billingAdjustments?: Map<string, BillingAdjustmentRecord>,
  chunkSize = 40,
  signal?: { cancelled: boolean },
): Promise<Map<string, MissionBillingAuditResult>> {
  const tablesHash = computePricingTablesHash(clientTables, providerTables);
  const clientByName = new Map(clientsData.map((c) => [c.name, c]));
  const map = new Map<string, MissionBillingAuditResult>();

  for (let i = 0; i < missions.length; i += chunkSize) {
    if (signal?.cancelled) break;
    const chunk = missions.slice(i, i + chunkSize);
    for (const m of chunk) {
      const clientMatch = clientByName.get(
        String((m as any).originalClientName || m.client || ''),
      );
      const adj = m.id ? billingAdjustments?.get(m.id) : undefined;
      map.set(
        m.id,
        computeMissionBillingAudit(
          m,
          clientTables,
          providerTables,
          clientMatch,
          providers,
          tablesHash,
          adj,
        ),
      );
    }
    if (i + chunkSize < missions.length) await yieldToMain();
  }

  return map;
}
