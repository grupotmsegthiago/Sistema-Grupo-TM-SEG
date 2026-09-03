/**
 * Total oficial único por OS — boletim, medição, Asaas, NF, recebível e comparador.
 *
 * Precedência revBase (sem pedágio/deslocamento):
 *   edição manual > snapshot congelado > revenue_value persistido > motor estimado
 *
 * Pedágio e deslocamento são sempre aditivos via helpers oficiais (DB + derivação KM).
 */
import { Mission, MissionStatus, Client } from '../../types';
import {
  calculateMissionFinancials,
  isIntentionalBillingOverride,
} from '../financialUtils';
import { resolveMissionDisplacement } from './resolveMissionDisplacement';
import { resolveStoredClientToll, resolveStoredProviderToll } from '../toll/clientTollBilling';
import type { CanonicalRefs } from '../missionFinancialsCanonical';

const r2 = (v: number) => Math.round(v * 100) / 100;

const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export type OfficialTotalSource = 'manual' | 'snapshot' | 'saved' | 'estimated' | 'mixed';
export type OfficialValueStatus = 'official' | 'estimated' | 'needs_validation' | 'simulation';

export interface OfficialMissionTotalResult {
  revBase: number;
  base: number;
  kmEx: number;
  hrEx: number;
  toll: number;
  disp: number;
  total: number;
  source: OfficialTotalSource;
  valueStatus: OfficialValueStatus;
  /** billingAdjustment pós-snapshot ainda não persistido — colunas não alteram total */
  isSimulation: boolean;
  clientUnitKm: number;
  providerUnitKm: number;
}

export interface OfficialProviderTotalResult {
  costBase: number;
  base: number;
  kmEx: number;
  hrEx: number;
  toll: number;
  disp: number;
  total: number;
  source: OfficialTotalSource;
  valueStatus: OfficialValueStatus;
  isSimulation: boolean;
}

export interface ResolveOfficialMissionTotalOptions {
  clientData?: Client;
  /** Ajuste de faturamento (BillingAdjustment) — não altera total se snapshot vigente */
  billingAdjustment?: Record<string, unknown> | null;
  billingAdjustmentAt?: number;
  snapshotAt?: number;
  currentTime?: Date;
}

function buildTableOverrides(adj?: Record<string, unknown> | null) {
  if (!adj) return undefined;
  return {
    clientTableId: adj.clientTableId ? String(adj.clientTableId) : undefined,
    providerTableId:
      adj.providerTableId && !String(adj.providerTableId).startsWith('auto-')
        ? String(adj.providerTableId)
        : undefined,
    customClientBase: adj.customClientBase ? Number(adj.customClientBase) : undefined,
    customClientUnitKm: adj.customClientKm ? Number(adj.customClientKm) : undefined,
    customClientUnitHour: adj.customClientHour ? Number(adj.customClientHour) : undefined,
    customProviderBase: adj.customProviderBase ? Number(adj.customProviderBase) : undefined,
    customProviderUnitKm: adj.customProviderKm ? Number(adj.customProviderKm) : undefined,
    customProviderUnitHour: adj.customProviderHour ? Number(adj.customProviderHour) : undefined,
    forceIblFee: adj.forceIblFee ? true : undefined,
  };
}

function missionForMotor(m: any, isCancelled: boolean): Mission {
  return {
    ...m,
    startKm: m.startKm ?? m.start_km,
    endKm: m.endKm ?? m.end_km,
    startTime: m.startTime ?? m.start_time,
    endTime: m.endTime ?? m.end_time,
    createdAt: m.createdAt ?? m.created_at,
    lastUpdate: m.lastUpdate ?? m.last_update,
    totalDistance: m.totalDistance ?? m.total_distance,
    ...(isCancelled ? { status: MissionStatus.COMPLETED } : {}),
  } as Mission;
}

function matchedClient(m: any, refs: CanonicalRefs, clientData?: Client): Client | undefined {
  if (clientData) return clientData;
  const clientName = ((m as any).originalClientName || m.client || '').toString().trim();
  return refs.clientsData.find((c) => c.name === clientName);
}

function getSnapshot(m: any): Record<string, unknown> | null {
  const snap = m.snapshot_data;
  if (!snap || typeof snap !== 'object') return null;
  return snap as Record<string, unknown>;
}

/** Edição manual vence snapshot (T07). */
export function hasManualEditOverride(m: any, snap: Record<string, unknown> | null): boolean {
  if (isIntentionalBillingOverride(m.revenue_edit_reason)) return true;
  if (!snap) return false;
  const snapRev = num(snap.revenueServiceOnly);
  if (m.revenue_value == null) return false;
  const rev = num(m.revenue_value);
  const reason = String(m.revenue_edit_reason || '').trim();
  if (!reason) return false;
  if (snapRev <= 0 && rev <= 0) return false;
  if (Math.abs(rev - snapRev) <= 0.01) return false;
  return true;
}

function snapshotRevBase(snap: Record<string, unknown>): number {
  const svc = num(snap.revenueServiceOnly);
  if (svc > 0 || snap.revenueServiceOnly === 0) return svc;
  const total = num(snap.totalGeral);
  if (total <= 0) return 0;
  const tollSnap = num(snap.tollVal);
  const dispSnap = num(snap.displacementVal);
  if (total > tollSnap + dispSnap) return r2(total - tollSnap - dispSnap);
  const base = num(snap.activationFee);
  const km = num(snap.kmExtraTotal);
  const hr = num(snap.hrExtraTotal);
  if (base + km + hr > 0) return r2(base + km + hr);
  return 0;
}

function snapshotBreakdown(snap: Record<string, unknown>) {
  return {
    base: num(snap.activationFee),
    kmEx: num(snap.kmExtraTotal),
    hrEx: num(snap.hrExtraTotal),
  };
}

function motorBreakdown(fin: ReturnType<typeof calculateMissionFinancials>) {
  return {
    base: num(fin.client.base),
    kmEx: num(fin.client.extraKmVal),
    hrEx: num(fin.client.extraHrVal),
  };
}

function resolveRates(
  m: any,
  refs: CanonicalRefs,
  clientData: Client | undefined,
  currentTime: Date,
  overrides?: ReturnType<typeof buildTableOverrides>,
) {
  const isCancelled = String(m.status || '').toLowerCase().includes('cancel');
  let clientUnitKm = 0;
  let providerUnitKm = 0;
  let fin: ReturnType<typeof calculateMissionFinancials> | null = null;
  try {
    fin = calculateMissionFinancials(
      missionForMotor(m, isCancelled),
      refs.clientTables,
      refs.providerTables,
      clientData,
      currentTime,
      overrides,
    );
    clientUnitKm = num(fin.client.unitPriceKm);
    providerUnitKm = num(fin.provider.unitCostKm);
  } catch {
    /* taxas podem ser 0 — fallback DHL por UF no resolver de DESL */
  }
  return { fin, clientUnitKm, providerUnitKm };
}

/**
 * Total oficial cliente (receita) de uma OS para o boletim e downstream financeiro.
 */
export function resolveOfficialMissionTotal(
  m: any,
  refs: CanonicalRefs,
  opts: ResolveOfficialMissionTotalOptions = {},
): OfficialMissionTotalResult {
  const currentTime = opts.currentTime ?? new Date();
  if (m.status === MissionStatus.REFUSED) {
    return {
      revBase: 0,
      base: 0,
      kmEx: 0,
      hrEx: 0,
      toll: 0,
      disp: 0,
      total: 0,
      source: 'saved',
      valueStatus: 'official',
      isSimulation: false,
      clientUnitKm: 0,
      providerUnitKm: 0,
    };
  }

  const snap = getSnapshot(m);
  const hasApprovedSnapshot = !!(m.snapshot_approved_by && snap);
  const clientData = matchedClient(m, refs, opts.clientData);
  const manualEdit = hasManualEditOverride(m, snap);

  const adjAt = opts.billingAdjustmentAt ?? 0;
  const snapAt = opts.snapshotAt ?? (m.snapshot_approved_at ? new Date(m.snapshot_approved_at).getTime() : 0);
  const isSimulation = !!(
    hasApprovedSnapshot
    && opts.billingAdjustment
    && adjAt > snapAt
    && !manualEdit
  );

  const motorOverrides = isSimulation ? undefined : buildTableOverrides(opts.billingAdjustment);
  const { fin, clientUnitKm, providerUnitKm } = resolveRates(m, refs, clientData, currentTime, motorOverrides);

  const toll = resolveStoredClientToll(m.toll_value, m.toll_value_provider);
  const disp = resolveMissionDisplacement(m, {
    clientUnitPriceKm: clientUnitKm,
    providerUnitPriceKm: providerUnitKm,
  }).client;

  let revBase = 0;
  let source: OfficialTotalSource = 'estimated';
  let valueStatus: OfficialValueStatus = 'estimated';
  let breakdown = { base: 0, kmEx: 0, hrEx: 0 };

  if (manualEdit && m.revenue_value != null) {
    revBase = num(m.revenue_value);
    source = 'manual';
    valueStatus = 'official';
    breakdown = snap ? snapshotBreakdown(snap) : fin ? motorBreakdown(fin) : breakdown;
  } else if (hasApprovedSnapshot && snap) {
    revBase = snapshotRevBase(snap);
    source = 'snapshot';
    valueStatus = 'official';
    breakdown = snapshotBreakdown(snap);
    if (breakdown.base + breakdown.kmEx + breakdown.hrEx <= 0 && fin) {
      breakdown = motorBreakdown(fin);
    }
  } else if (m.revenue_value != null) {
    revBase = num(m.revenue_value);
    source = 'saved';
    valueStatus = m.billing_approved || m.billing_verified_by ? 'official' : 'needs_validation';
    breakdown = fin ? motorBreakdown(fin) : breakdown;
  } else if (fin) {
    revBase = num(fin.client.serviceTotal);
    source = 'estimated';
    valueStatus = 'estimated';
    breakdown = motorBreakdown(fin);
  }

  const total = r2(revBase + toll + disp);

  return {
    revBase: r2(revBase),
    base: r2(breakdown.base),
    kmEx: r2(breakdown.kmEx),
    hrEx: r2(breakdown.hrEx),
    toll: r2(toll),
    disp: r2(disp),
    total,
    source,
    valueStatus: isSimulation ? 'simulation' : valueStatus,
    isSimulation,
    clientUnitKm,
    providerUnitKm,
  };
}

/** Total oficial fornecedor (custo) — modo fornecedor do boletim. */
export function resolveOfficialProviderTotal(
  m: any,
  refs: CanonicalRefs,
  opts: ResolveOfficialMissionTotalOptions = {},
): OfficialProviderTotalResult {
  const currentTime = opts.currentTime ?? new Date();
  const isSameOs = !!m.is_same_os;
  if (m.status === MissionStatus.REFUSED) {
    return {
      costBase: 0,
      base: 0,
      kmEx: 0,
      hrEx: 0,
      toll: 0,
      disp: 0,
      total: 0,
      source: 'saved',
      valueStatus: 'official',
      isSimulation: false,
    };
  }

  const snap = getSnapshot(m);
  const hasApprovedSnapshot = !!(m.snapshot_approved_by && snap);
  const clientData = matchedClient(m, refs, opts.clientData);
  const manualEdit = hasManualEditOverride(m, snap);

  const { fin, clientUnitKm, providerUnitKm } = resolveRates(
    m,
    refs,
    clientData,
    currentTime,
    buildTableOverrides(opts.billingAdjustment),
  );

  const toll = resolveStoredProviderToll(m.toll_value, m.toll_value_provider, isSameOs);
  const disp = isSameOs
    ? 0
    : resolveMissionDisplacement(m, {
        clientUnitPriceKm: clientUnitKm,
        providerUnitPriceKm: providerUnitKm,
      }).provider;

  let costBase = 0;
  let source: OfficialTotalSource = 'estimated';
  let valueStatus: OfficialValueStatus = 'estimated';
  let breakdown = { base: 0, kmEx: 0, hrEx: 0 };

  if (isSameOs) {
    costBase = 0;
    source = 'saved';
    valueStatus = 'official';
  } else if (manualEdit && m.cost_value != null) {
    costBase = num(m.cost_value);
    source = 'manual';
    valueStatus = 'official';
    breakdown = snap
      ? { base: num(snap.activationFee), kmEx: num(snap.kmExtraTotal), hrEx: num(snap.hrExtraTotal) }
      : fin
        ? { base: num(fin.provider.base), kmEx: num(fin.provider.extraKmVal), hrEx: num(fin.provider.extraHrVal) }
        : breakdown;
  } else if (hasApprovedSnapshot && snap && snap.costServiceOnly != null) {
    costBase = num(snap.costServiceOnly);
    source = 'snapshot';
    valueStatus = 'official';
    breakdown = {
      base: num(snap.activationFee),
      kmEx: num(snap.kmExtraTotal),
      hrEx: num(snap.hrExtraTotal),
    };
  } else if (m.cost_value != null) {
    costBase = num(m.cost_value);
    source = 'saved';
    valueStatus = 'official';
    breakdown = fin
      ? { base: num(fin.provider.base), kmEx: num(fin.provider.extraKmVal), hrEx: num(fin.provider.extraHrVal) }
      : breakdown;
  } else if (fin) {
    costBase = num(fin.provider.serviceTotal);
    source = 'estimated';
    valueStatus = 'estimated';
    breakdown = {
      base: num(fin.provider.base),
      kmEx: num(fin.provider.extraKmVal),
      hrEx: num(fin.provider.extraHrVal),
    };
  }

  const total = r2(costBase + toll + disp);

  return {
    costBase: r2(costBase),
    base: r2(breakdown.base),
    kmEx: r2(breakdown.kmEx),
    hrEx: r2(breakdown.hrEx),
    toll: r2(toll),
    disp: r2(disp),
    total,
    source,
    valueStatus,
    isSimulation: false,
  };
}

/** Soma totais oficiais de uma lista de missões (modo cliente). */
export function sumOfficialMissionTotals(
  missions: any[],
  refs: CanonicalRefs,
  opts: Omit<ResolveOfficialMissionTotalOptions, 'billingAdjustment' | 'billingAdjustmentAt'> & {
    billingAdjustments?: Record<string, Record<string, unknown>>;
    billingAdjustmentTimestamps?: Record<string, number>;
  } = {},
): number {
  let sum = 0;
  for (const m of missions) {
    if (m.status === MissionStatus.REFUSED) continue;
    const id = m.id as string;
    const r = resolveOfficialMissionTotal(m, refs, {
      ...opts,
      billingAdjustment: opts.billingAdjustments?.[id] ?? null,
      billingAdjustmentAt: opts.billingAdjustmentTimestamps?.[id],
      snapshotAt: m.snapshot_approved_at ? new Date(m.snapshot_approved_at).getTime() : undefined,
    });
    sum += r.total;
  }
  return r2(sum);
}
