// FONTE ÚNICA DA VERDADE para faturamento/custo/lucro de uma OS.
//
// Toda tela ou worker que precisa somar receita/custo/lucro DEVE chamar
// computeCanonicalRevenueCost() para cada missão e usar getCanonicalDateRange()
// para filtrar por período. Sem isso, cada lugar implementa sua versão e os
// totais divergem (foi exatamente o problema reportado: Relatório R$ 640k,
// Termômetro R$ 630k, Dashboard R$ 627k para o mesmo "Mês").
//
// Aceita tanto missões "frontend" (camelCase + snake_case via App/MissionTable
// mapping) quanto rows brutas do Supabase (snake_case puro), por isso usa
// fallback `m.startTime ?? m.start_time` etc.

import { Mission, MissionStatus, ClientPriceTable, ProviderCostTable, Client } from '../types';
import { calculateMissionFinancials } from './financialUtils';
import { resolveStoredClientToll, resolveStoredProviderToll } from './toll/clientTollBilling';

export type CanonicalPeriod = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM' | 'ALL';

export interface CanonicalRefs {
  clientTables: ClientPriceTable[];
  providerTables: ProviderCostTable[];
  clientsData: Client[];
}

export interface CanonicalResult {
  revBase: number;   // receita base (sem pedágio/deslocamento) — vem do stored ou da estimativa
  tollRev: number;   // pedágio recebido do cliente
  dispRev: number;   // deslocamento cobrado do cliente (aditivo, espelha pedágio)
  rev: number;       // revBase + tollRev + dispRev — a "receita total" da OS
  costBase: number;  // custo base (sem pedágio/deslocamento)
  tollCost: number;  // pedágio pago ao fornecedor
  dispCost: number;  // deslocamento pago ao fornecedor (fallback p/ deslocamento cliente)
  cost: number;      // costBase + tollCost + dispCost — o "custo total" da OS
  profit: number;    // rev - cost
  source: 'saved' | 'estimated' | 'mixed';
}

const num = (v: any): number => (typeof v === 'number' && isFinite(v)) ? v : 0;

const ZERO_RESULT: CanonicalResult = {
  revBase: 0, tollRev: 0, dispRev: 0, rev: 0,
  costBase: 0, tollCost: 0, dispCost: 0, cost: 0,
  profit: 0, source: 'saved',
};

/**
 * Calcula receita/custo/lucro canônico de UMA missão.
 *
 * Regras (mesmas em todo o sistema):
 *  - REFUSED → tudo zero (a OS recusada não fatura).
 *  - Aprovada (billing_approved/billing_verified_by) → usa valores salvos no banco.
 *  - Tem revenue_value E cost_value salvos → usa salvos.
 *  - Tem só um salvo → usa salvo nesse e ESTIMA o outro via tabelas.
 *  - Não tem nenhum salvo → estima ambos.
 *  - Pedágio recebido = toll_value (com regra; legado aplica na leitura).
 *  - Pedágio pago = toll_value_provider (valor real; fallback toll_value).
 *  - CANCELLED é tratada como COMPLETED só pra estimativa não dar zero por causa do status.
 */
export function computeCanonicalRevenueCost(
  m: any,
  refs: CanonicalRefs,
  currentTime: Date = new Date()
): CanonicalResult {
  if (m.status === MissionStatus.REFUSED) return ZERO_RESULT;

  const hasStoredRev = (m.revenue_value != null && m.revenue_value > 0);
  const hasStoredCost = (m.cost_value != null && m.cost_value > 0);
  const isVerified = !!(m.billing_approved || m.billing_verified_by);
  const hasSavedValues = isVerified && (hasStoredRev || hasStoredCost || m.revenue_value === 0 || m.cost_value === 0);

  // Pedágio recebido = toll_value (com regra; legado aplica na leitura);
  // pedágio pago = toll_value_provider (valor real; fallback toll_value).
  const tollRev = resolveStoredClientToll(m.toll_value, m.toll_value_provider);
  const tollCost = resolveStoredProviderToll(m.toll_value, m.toll_value_provider, !!m.is_same_os);
  const dispRev = Math.max(0, num(m.displacement_value));
  const dispCost = Math.max(0, num(m.displacement_value_provider));

  let revBase = 0;
  let costBase = 0;
  let source: CanonicalResult['source'] = 'estimated';

  if (hasSavedValues || (hasStoredRev && hasStoredCost)) {
    revBase = num(m.revenue_value);
    costBase = num(m.cost_value);
    source = 'saved';
  } else {
    if (hasStoredRev) revBase = num(m.revenue_value);
    if (hasStoredCost) costBase = num(m.cost_value);

    if (!hasStoredRev || !hasStoredCost) {
      const isCancelled = m.status === MissionStatus.CANCELLED;
      const missionObj: Mission = {
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
      const clientName = ((m as any).originalClientName || m.client || '').toString().trim();
      const matchedClient = refs.clientsData.find(c => c.name === clientName);
      try {
        const fin = calculateMissionFinancials(missionObj, refs.clientTables, refs.providerTables, matchedClient, currentTime);
        if (!hasStoredRev) revBase = num(fin.client.total);
        if (!hasStoredCost) costBase = num(fin.provider.total);
      } catch {
        // mantém parciais se a estimativa falhar
      }
      source = (hasStoredRev || hasStoredCost) ? 'mixed' : 'estimated';
    } else {
      source = 'saved';
    }
  }

  const rev = revBase + tollRev + dispRev;
  const cost = costBase + tollCost + dispCost;
  return { revBase, tollRev, dispRev, rev, costBase, tollCost, dispCost, cost, profit: rev - cost, source };
}

/**
 * Janela de tempo canônica usada por todas as telas (cliente).
 *
 * Convenção (decidida com o usuário):
 *  - TODAY:     hoje 0:00 → hoje 23:59
 *  - YESTERDAY: ontem 0:00 → ontem 23:59
 *  - WEEK:      domingo desta semana 0:00 → hoje 23:59 (semana corrente do calendário)
 *  - MONTH:     dia 1 do mês 0:00 → hoje 23:59 (mês até a data, SEM contar futuro)
 *  - YEAR:      1º jan 0:00 → hoje 23:59
 *  - CUSTOM:    customStart 0:00 → customEnd 23:59
 *  - ALL:       2000-01-01 → 2100-01-01
 *
 * IMPORTANTE: usa horário local do navegador. No servidor (worker) a referência
 * é Brasília via funções TZ-aware no próprio worker.
 */
export function getCanonicalDateRange(
  period: CanonicalPeriod,
  customStart?: string,
  customEnd?: string
): [Date, Date] {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'TODAY':
      return [startOfDay(now), endOfDay(now)];
    case 'YESTERDAY': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return [startOfDay(y), endOfDay(y)];
    }
    case 'WEEK': {
      const s = new Date(now);
      s.setDate(s.getDate() - s.getDay()); // domingo desta semana
      return [startOfDay(s), endOfDay(now)];
    }
    case 'MONTH':
      return [new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), endOfDay(now)];
    case 'YEAR':
      return [new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), endOfDay(now)];
    case 'CUSTOM': {
      const s = customStart ? new Date(customStart + 'T00:00:00') : startOfDay(now);
      const e = customEnd ? new Date(customEnd + 'T23:59:59') : endOfDay(now);
      return [s, e];
    }
    case 'ALL':
      return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }
}

/**
 * Filtra missões pelo intervalo, usando start_time como referência primária e
 * created_at como fallback. Sem regras especiais (sem incluir "ativas" fora do
 * período etc.) — é estrito e igual em todo lugar.
 */
export function filterMissionsByPeriod<T>(
  missions: T[],
  start: Date,
  end: Date
): T[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return missions.filter((m: any) => {
    const ref = m?.startTime || m?.start_time || m?.createdAt || m?.created_at;
    if (!ref) return false;
    const t = new Date(ref).getTime();
    return t >= startMs && t <= endMs;
  });
}

/**
 * Soma canônica de uma lista de missões (rev/cost/profit/contagem).
 * "count" exclui REFUSED (que contribui zero ao faturamento).
 */
export function sumCanonical(
  missions: any[],
  refs: CanonicalRefs,
  currentTime: Date = new Date()
): { rev: number; revBase: number; tollRev: number; cost: number; costBase: number; tollCost: number; profit: number; count: number } {
  let rev = 0, revBase = 0, tollRev = 0;
  let cost = 0, costBase = 0, tollCost = 0;
  let count = 0;
  for (const m of missions) {
    if (m.status === MissionStatus.REFUSED) continue;
    const r = computeCanonicalRevenueCost(m, refs, currentTime);
    rev += r.rev; revBase += r.revBase; tollRev += r.tollRev;
    cost += r.cost; costBase += r.costBase; tollCost += r.tollCost;
    count++;
  }
  return { rev, revBase, tollRev, cost, costBase, tollCost, profit: rev - cost, count };
}
