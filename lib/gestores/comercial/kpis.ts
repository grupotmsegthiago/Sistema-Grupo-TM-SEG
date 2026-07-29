import { MissionStatus } from '../../../types';
import {
  computeCanonicalRevenueCost,
  filterMissionsByPeriod,
  type CanonicalRefs,
} from '../../missionFinancialsCanonical';
import { calculateTieredCommission } from './commission';
import type {
  GcClientHealth,
  GcCommissionPlan,
  GcDashboardKpis,
  GcSettingsMap,
} from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthBounds(year: number, month: number, now = new Date()) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  if (year === now.getFullYear() && month === now.getMonth()) {
    end.setTime(now.getTime());
  }
  return { start, end };
}

function classifyTripDistance(km: number): 'short' | 'medium' | 'long' {
  if (km <= 100) return 'short';
  if (km <= 400) return 'medium';
  return 'long';
}

function serviceBucket(serviceType: string): 'escolta' | 'pronta' | 'moto' | 'other' {
  const s = String(serviceType || '').toLowerCase();
  if (s.includes('moto')) return 'moto';
  if (s.includes('pronta') || s.includes('pr ')) return 'pronta';
  if (s.includes('escolta')) return 'escolta';
  return 'other';
}

export function computeGcDashboardKpis(opts: {
  missions: any[];
  refs: CanonicalRefs;
  quotes?: Array<{ status: string; total_value?: number }>;
  monthlyGoal: number;
  commissionPlan?: GcCommissionPlan | null;
  commissionPercentFallback?: number;
  year?: number;
  month?: number; // 0-11
  now?: Date;
  /** Comercial não vê lucro/margem estratégicos — zera campos sensíveis */
  hideStrategic?: boolean;
}): GcDashboardKpis {
  const now = opts.now || new Date();
  const year = opts.year ?? now.getFullYear();
  const month = opts.month ?? now.getMonth();
  const { start, end } = monthBounds(year, month, now);

  const prev = month === 0
    ? monthBounds(year - 1, 11, now)
    : monthBounds(year, month - 1, now);

  const inMonth = filterMissionsByPeriod(opts.missions, start, end).filter(
    (m) => m.status !== MissionStatus.REFUSED,
  );
  const prevMonth = filterMissionsByPeriod(opts.missions, prev.start, prev.end).filter(
    (m) => m.status !== MissionStatus.REFUSED,
  );

  let receita = 0;
  let custo = 0;
  for (const m of inMonth) {
    const c = computeCanonicalRevenueCost(m, opts.refs, now);
    receita += c.rev;
    custo += c.cost;
  }
  let prevReceita = 0;
  for (const m of prevMonth) {
    prevReceita += computeCanonicalRevenueCost(m, opts.refs, now).rev;
  }

  const lucro = receita - custo;
  const margemPct = receita > 0 ? (lucro / receita) * 100 : 0;
  const meta = Math.max(0, Number(opts.monthlyGoal) || 0);
  const metaPct = meta > 0 ? (receita / meta) * 100 : 0;

  const day = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const projecaoMes = day > 0 ? (receita / day) * daysInMonth : 0;

  const commission = calculateTieredCommission(
    receita,
    opts.commissionPlan,
    opts.commissionPercentFallback || 0,
  );
  // Confirmada = comissão sobre OS finalizadas/faturadas no período
  const finalized = inMonth.filter((m) =>
    m.status === MissionStatus.COMPLETED || m.billing_approved === true,
  );
  let faturado = 0;
  for (const m of finalized) {
    faturado += computeCanonicalRevenueCost(m, opts.refs, now).rev;
  }
  const confirmed = calculateTieredCommission(
    faturado,
    opts.commissionPlan,
    opts.commissionPercentFallback || 0,
  );
  const forecast = calculateTieredCommission(
    projecaoMes,
    opts.commissionPlan,
    opts.commissionPercentFallback || 0,
  );

  const quotes = opts.quotes || [];
  const won = quotes.filter((q) => /aprov|ganh|acei|fecha/i.test(q.status)).length;
  const conversaoPct = quotes.length > 0 ? (won / quotes.length) * 100 : 0;
  const crescimentoPct = prevReceita > 0 ? ((receita - prevReceita) / prevReceita) * 100 : (receita > 0 ? 100 : 0);

  const performanceScore = Math.max(
    0,
    Math.min(
      100,
      metaPct * 0.45 +
        Math.min(100, margemPct * 2) * 0.25 +
        Math.min(100, conversaoPct) * 0.15 +
        Math.min(100, Math.max(0, 50 + crescimentoPct)) * 0.15,
    ),
  );

  const carteiraScore = Math.max(
    0,
    Math.min(100, 40 + Math.min(40, inMonth.length) + (crescimentoPct > 0 ? 10 : 0) + (margemPct >= 20 ? 10 : 0)),
  );

  const kpis: GcDashboardKpis = {
    metaAtual: round2(meta),
    valorVendido: round2(receita),
    valorFaturado: round2(faturado),
    receitaGerada: round2(receita),
    lucroGerado: opts.hideStrategic ? 0 : round2(lucro),
    margemPct: opts.hideStrategic ? 0 : round2(margemPct),
    comissaoEstimada: round2(commission.total),
    comissaoConfirmada: round2(confirmed.total),
    previsaoComissao: round2(forecast.total),
    projecaoMes: round2(projecaoMes),
    metaPct: round2(metaPct),
    performanceScore: round2(performanceScore),
    crescimentoPct: round2(crescimentoPct),
    rentabilidadePct: opts.hideStrategic ? 0 : round2(margemPct),
    carteiraScore: round2(carteiraScore),
    conversaoPct: round2(conversaoPct),
    operations: inMonth.length,
  };
  return kpis;
}

export function buildClientHealthCards(opts: {
  clients: Array<{
    id: string;
    name: string;
    trading_name?: string | null;
    status?: string;
    created_by?: string | null;
    created_at?: string | null;
  }>;
  missions: any[];
  refs: CanonicalRefs;
  settings: GcSettingsMap;
  agendaByClient?: Map<string, { last?: string; next?: string }>;
  now?: Date;
  hideStrategic?: boolean;
}): GcClientHealth[] {
  const now = opts.now || new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthStart = new Date(y, m, 1);
  const yearStart = new Date(y, 0, 1);
  const prevStart = new Date(y, m - 1, 1);
  const prevEnd = new Date(y, m, 0, 23, 59, 59, 999);
  const taxPct = opts.settings.tax_rate_pct;

  const byClientName = new Map<string, any[]>();
  for (const mission of opts.missions) {
    if (mission.status === MissionStatus.REFUSED) continue;
    const key = String(mission.client || '').trim();
    if (!key) continue;
    const arr = byClientName.get(key) || [];
    arr.push(mission);
    byClientName.set(key, arr);
  }

  const cards: GcClientHealth[] = [];

  for (const client of opts.clients) {
    const names = [client.name, client.trading_name].filter(Boolean).map((n) => String(n).trim());
    const missions = names.flatMap((n) => byClientName.get(n) || []);
    // dedupe by id
    const seen = new Set<string>();
    const unique = missions.filter((x) => {
      const id = String(x.id || '');
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    let monthlyRevenue = 0;
    let yearlyRevenue = 0;
    let cost = 0;
    let escoltas = 0;
    let prontas = 0;
    let motos = 0;
    let short = 0;
    let medium = 0;
    let long = 0;
    let prevRevenue = 0;
    let lastMissionAt: string | null = null;

    for (const mission of unique) {
      const c = computeCanonicalRevenueCost(mission, opts.refs, now);
      const d = new Date(mission.created_at || mission.date || mission.start_date || 0);
      if (Number.isNaN(d.getTime())) continue;
      if (d >= yearStart) {
        yearlyRevenue += c.rev;
        cost += c.cost;
        const bucket = serviceBucket(mission.service_type || mission.type || '');
        if (bucket === 'escolta') escoltas += 1;
        if (bucket === 'pronta') prontas += 1;
        if (bucket === 'moto') motos += 1;
        const km = Number(mission.km_total || mission.total_km || mission.distance_km || 0);
        const trip = classifyTripDistance(km);
        if (trip === 'short') short += 1;
        else if (trip === 'medium') medium += 1;
        else long += 1;
      }
      if (d >= monthStart) monthlyRevenue += c.rev;
      if (d >= prevStart && d <= prevEnd) prevRevenue += c.rev;
      const iso = d.toISOString();
      if (!lastMissionAt || iso > lastMissionAt) lastMissionAt = iso;
    }

    const grossProfit = yearlyRevenue - cost;
    const taxAmount = (yearlyRevenue * taxPct) / 100;
    const netProfit = grossProfit - taxAmount;
    const marginPct = yearlyRevenue > 0 ? (grossProfit / yearlyRevenue) * 100 : 0;
    const ops = unique.filter((mission) => {
      const d = new Date(mission.created_at || mission.date || 0);
      return d >= yearStart;
    }).length;
    const avgTicket = ops > 0 ? yearlyRevenue / ops : 0;
    const daysWithoutRevenue = lastMissionAt
      ? Math.floor((now.getTime() - new Date(lastMissionAt).getTime()) / 86400000)
      : 999;
    const trendPct = prevRevenue > 0
      ? ((monthlyRevenue - prevRevenue) / prevRevenue) * 100
      : (monthlyRevenue > 0 ? 100 : 0);
    const trend: GcClientHealth['trend'] =
      trendPct > 8 ? 'up' : trendPct < -8 ? 'down' : 'stable';

    const agenda = opts.agendaByClient?.get(client.id);
    let healthScore = 70;
    if (daysWithoutRevenue > opts.settings.days_without_revenue) healthScore -= 25;
    if (marginPct < opts.settings.min_margin_pct) healthScore -= 15;
    if (trend === 'down') healthScore -= 10;
    if (trend === 'up') healthScore += 10;
    if (monthlyRevenue > 0) healthScore += 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    cards.push({
      clientId: client.id,
      clientName: client.trading_name || client.name,
      status: client.status || 'Ativo',
      monthlyRevenue: round2(monthlyRevenue),
      yearlyRevenue: round2(yearlyRevenue),
      cost: opts.hideStrategic ? 0 : round2(cost),
      grossProfit: opts.hideStrategic ? 0 : round2(grossProfit),
      taxAmount: opts.hideStrategic ? 0 : round2(taxAmount),
      netProfit: opts.hideStrategic ? 0 : round2(netProfit),
      marginPct: opts.hideStrategic ? 0 : round2(marginPct),
      operations: ops,
      escoltas,
      prontasRespostas: prontas,
      motoAcompanhamento: motos,
      tripsShort: short,
      tripsMedium: medium,
      tripsLong: long,
      avgTicket: round2(avgTicket),
      lastContactAt: agenda?.last || lastMissionAt,
      nextContactAt: agenda?.next || null,
      daysWithoutRevenue,
      trend,
      trendPct: round2(trendPct),
      healthScore,
      ownedBy: client.created_by || null,
    });
  }

  return cards.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
}

export function buildTopLists(
  health: GcClientHealth[],
  limit = 10,
): {
  topRevenue: GcClientHealth[];
  topProfit: GcClientHealth[];
  topMargin: GcClientHealth[];
  topGrowth: GcClientHealth[];
  topDrop: GcClientHealth[];
  topRentabilidade: GcClientHealth[];
} {
  const withRevenue = health.filter((h) => h.yearlyRevenue > 0 || h.monthlyRevenue > 0);
  return {
    topRevenue: [...withRevenue].sort((a, b) => b.monthlyRevenue - a.monthlyRevenue).slice(0, limit),
    topProfit: [...withRevenue].sort((a, b) => b.netProfit - a.netProfit).slice(0, limit),
    topMargin: [...withRevenue].filter((h) => h.yearlyRevenue > 0).sort((a, b) => b.marginPct - a.marginPct).slice(0, limit),
    topGrowth: [...withRevenue].filter((h) => h.trend === 'up').sort((a, b) => b.trendPct - a.trendPct).slice(0, limit),
    topDrop: [...withRevenue].filter((h) => h.trend === 'down').sort((a, b) => a.trendPct - b.trendPct).slice(0, limit),
    topRentabilidade: [...withRevenue].sort((a, b) => b.marginPct - a.marginPct).slice(0, limit),
  };
}
