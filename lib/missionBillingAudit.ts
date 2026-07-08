import type { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { calculateMissionFinancials } from './financialUtils';

export type AuditStatusLevel = 'validado' | 'atencao' | 'erro' | 'pendente';

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

/** Hash leve das tabelas de preço — invalida cache quando tabelas mudam. */
export function computePricingTablesHash(
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
): string {
  const slice = (rows: Array<Record<string, unknown>>, prefix: string) =>
    rows
      .map((r) =>
        [
          prefix,
          r.id,
          r.activation_fee ?? r.activation_cost,
          r.franchise_km,
          r.franchise_hours,
          r.price_per_extra_km ?? r.cost_per_extra_km,
          r.price_per_extra_hour ?? r.cost_per_extra_hour,
          r.operation_type,
        ].join(':'),
      )
      .sort()
      .join('|');

  return `${clientTables.length}#${slice(clientTables as any[], 'c')}::${providerTables.length}#${slice(providerTables as any[], 'p')}`;
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

/** Tabelas congeladas no snapshot de aprovação (mesma regra do modal/boletim). */
export function buildSnapshotTableOverrides(
  mission: Mission,
): {
  clientTableId?: string;
  providerTableId?: string;
  providerOpsOverride?: { distanceKm: number; durationHours: number };
} | undefined {
  const snap = (mission as any).snapshot_data as Record<string, unknown> | null | undefined;
  const clientTableId = snap?.clientTableId ? String(snap.clientTableId) : undefined;
  const providerTableId = snap?.providerTableId ? String(snap.providerTableId) : undefined;
  const providerOpsOverride = buildProviderOpsOverride(mission);

  if (!clientTableId && !providerTableId && !providerOpsOverride) return undefined;

  return {
    ...(clientTableId ? { clientTableId } : {}),
    ...(providerTableId ? { providerTableId } : {}),
    ...(providerOpsOverride ? { providerOpsOverride } : {}),
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

function resolveOverallStatus(
  clientDiff: number,
  providerDiff: number,
  hasComparableValues: boolean,
): Pick<MissionBillingAuditResult, 'overallStatus' | 'overallLabel' | 'overallIcon' | 'resultadoFinal'> {
  if (!hasComparableValues) {
    return {
      overallStatus: 'pendente',
      overallLabel: 'PENDENTE',
      overallIcon: '⚪',
      resultadoFinal: 'ERRO',
    };
  }

  const maxAbs = Math.max(Math.abs(clientDiff), Math.abs(providerDiff));

  if (maxAbs < 0.005) {
    return {
      overallStatus: 'validado',
      overallLabel: 'VALIDADO',
      overallIcon: '🟢',
      resultadoFinal: 'VALIDADO',
    };
  }

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

export function computeMissionBillingAudit(
  mission: Mission,
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientData?: Client,
  providers?: any[] | null,
  tablesHash?: string,
): MissionBillingAuditResult {
  const hash = tablesHash ?? computePricingTablesHash(clientTables, providerTables);
  const fingerprint = buildMissionAuditFingerprint(mission, hash);
  const cached = auditCache.get(fingerprint);
  if (cached) return cached;

  const status = String((mission as any).status || '').toUpperCase();
  const isRefused = status.includes('RECUS');
  const isCancelled = status.includes('CANCEL');

  const lancadoReceita = safeNumber((mission as any).revenue_value);
  const lancadoCusto = (mission as any).is_same_os
    ? 0
    : safeNumber((mission as any).cost_value);

  const hasComparableValues = !isRefused && (lancadoReceita > 0 || lancadoCusto > 0 || status.includes('CONCLU'));

  if (!hasComparableValues) {
    const emptySide = (): SideAuditDetail => ({
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
    });

    const pending: MissionBillingAuditResult = {
      missionId: mission.id || '',
      overallStatus: 'pendente',
      overallLabel: 'PENDENTE',
      overallIcon: '⚪',
      client: emptySide(),
      provider: emptySide(),
      resultadoFinal: 'ERRO',
      cacheKey: fingerprint,
      skipped: true,
      skipReason: isRefused ? 'OS recusada' : isCancelled ? 'OS cancelada sem valores' : 'Sem valores lançados',
    };
    auditCache.set(fingerprint, pending);
    return pending;
  }

  const mObj = {
    ...mission,
    startKm: (mission as any).startKm ?? (mission as any).start_km,
    endKm: (mission as any).endKm ?? (mission as any).end_km,
    startTime: (mission as any).startTime ?? (mission as any).start_time,
    endTime: (mission as any).endTime ?? (mission as any).end_time,
  };

  const providerOpsOverride = buildProviderOpsOverride(mission);
  const snapshotOverrides = buildSnapshotTableOverrides(mission);
  const tableOverrides = snapshotOverrides ?? (providerOpsOverride ? { providerOpsOverride } : undefined);

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

  const clientDetail = buildSideDetail(
    fin.client,
    fin.realTraveledKm,
    fin.durationHours,
    lancadoReceita,
  );

  const providerDetail = buildSideDetail(
    fin.provider,
    providerKmRodado,
    providerTempoHours,
    lancadoCusto,
  );

  const overall = resolveOverallStatus(
    clientDetail.diferenca,
    providerDetail.diferenca,
    true,
  );

  const result: MissionBillingAuditResult = {
    missionId: mission.id || '',
    ...overall,
    client: clientDetail,
    provider: providerDetail,
    cacheKey: fingerprint,
    skipped: false,
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
): Map<string, MissionBillingAuditResult> {
  const tablesHash = computePricingTablesHash(clientTables, providerTables);
  const map = new Map<string, MissionBillingAuditResult>();

  for (const m of missions) {
    const clientMatch = clientsData.find(
      (c) => c.name === (m as any).originalClientName || c.name === m.client,
    );
    map.set(
      m.id,
      computeMissionBillingAudit(m, clientTables, providerTables, clientMatch, providers, tablesHash),
    );
  }

  return map;
}
