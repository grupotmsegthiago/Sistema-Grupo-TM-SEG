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
    conclusao = 'Receita e custo conferem com o cálculo das tabelas aplicadas. Nenhuma divergência encontrada.';
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
      resumo: buildAuditExecutiveSummary(
        {
          overallStatus: 'pendente',
          overallLabel: 'PENDENTE',
          client: emptySide(),
          provider: emptySide(),
          resultadoFinal: 'ERRO',
          skipped: true,
          skipReason: isRefused ? 'OS recusada' : isCancelled ? 'OS cancelada sem valores' : 'Sem valores lançados',
        },
        0,
        0,
      ),
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

  const snap = (mission as any).snapshot_data as Record<string, unknown> | null | undefined;
  const clientTableMissing = !!(
    snap?.clientTableId &&
    !clientTables.some((t) => String(t.id) === String(snap.clientTableId))
  );
  const providerTableMissing = !!(
    snap?.providerTableId &&
    !providerTables.some((t) => String(t.id) === String(snap.providerTableId))
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

  clientDetail = enrichSideMotivos(clientDetail, 'cliente', clientTableMissing);
  providerDetail = enrichSideMotivos(providerDetail, 'fornecedor', providerTableMissing);

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
