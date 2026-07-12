import { MissionStatus } from '../../types';
import type { FinancialCategory, FinancialTransaction } from '../../types';
import {
  computeCanonicalRevenueCost,
  filterMissionsByPeriod,
  sumCanonical,
  type CanonicalRefs,
} from '../missionFinancialsCanonical';
import { getMonthRange } from './periodUtils';
import type { CriticalAlert, DashboardPeriod, PendingApprovalItem } from './types';
import { DEFAULT_MONTHLY_REVENUE_GOAL, MARGIN_GOAL_PCT } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return fmtBRL(v);
};

export interface FinancialKpis {
  grossRevenue: number;
  grossMarginPct: number;
  variableCost: number;
  expenses: number;
  taxes: number;
  netProfit: number;
  ebitda: number;
  missionCount: number;
}

export function computeFinancialKpis(
  missions: any[],
  transactions: FinancialTransaction[],
  categories: FinancialCategory[],
  refs: CanonicalRefs,
  period: DashboardPeriod,
  now = new Date(),
): FinancialKpis {
  const { start, end } = getMonthRange(period);
  const inPeriod = filterMissionsByPeriod(missions, start, end);
  const totals = sumCanonical(inPeriod, refs, now);
  const grossRevenue = round2(totals.rev);
  const variableCost = round2(totals.cost);
  const grossMarginPct = grossRevenue > 0 ? round2((totals.profit / grossRevenue) * 100) : 0;

  const investmentIds = new Set(categories.filter(c => c.group === 'INVESTIMENTOS').map(c => c.id));
  const taxIds = new Set(categories.filter(c => c.tag === 'IMPOSTO').map(c => c.id));

  let expenses = 0;
  let taxes = 0;
  for (const t of transactions) {
    if (t.type !== 'EXPENSE' || t.status !== 'PAID') continue;
    if (investmentIds.has(t.category_id)) continue;
    const amt = Number(t.amount) || 0;
    if (taxIds.has(t.category_id)) taxes += amt;
    else expenses += amt;
  }
  expenses = round2(expenses);
  taxes = round2(taxes);
  const netProfit = round2(totals.profit - expenses - taxes);
  const ebitda = round2(totals.profit - expenses);

  return {
    grossRevenue,
    grossMarginPct,
    variableCost,
    expenses,
    taxes,
    netProfit,
    ebitda,
    missionCount: totals.count,
  };
}

export function buildDailyCashFlow(
  transactions: FinancialTransaction[],
): Array<{ day: string; inflow: number; outflow: number }> {
  const map = new Map<string, { inflow: number; outflow: number }>();
  for (const t of transactions) {
    if (t.status !== 'PAID') continue;
    const day = String(t.due_date || '').slice(0, 10);
    if (!day) continue;
    const row = map.get(day) || { inflow: 0, outflow: 0 };
    const amt = Number(t.amount) || 0;
    if (t.type === 'INCOME') row.inflow += amt;
    else row.outflow += amt;
    map.set(day, row);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day: day.slice(8, 10) + '/' + day.slice(5, 7), inflow: round2(v.inflow), outflow: round2(v.outflow) }));
}

export function buildMarginVsGoalSeries(
  missions: any[],
  refs: CanonicalRefs,
  period: DashboardPeriod,
  now = new Date(),
): Array<{ label: string; margin: number; goal: number }> {
  const { start, end } = getMonthRange(period);
  const inPeriod = filterMissionsByPeriod(missions, start, end);
  const byDay = new Map<string, { rev: number; profit: number }>();
  for (const m of inPeriod) {
    if (m.status === MissionStatus.REFUSED) continue;
    const ref = m.start_time || m.startTime || m.created_at || m.createdAt;
    if (!ref) continue;
    const d = new Date(ref);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = byDay.get(key) || { rev: 0, profit: 0 };
    const c = computeCanonicalRevenueCost(m, refs, now);
    row.rev += c.rev;
    row.profit += c.profit;
    byDay.set(key, row);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, v]) => ({
      label: iso.slice(8, 10) + '/' + iso.slice(5, 7),
      margin: v.rev > 0 ? round2((v.profit / v.rev) * 100) : 0,
      goal: MARGIN_GOAL_PCT,
    }));
}

export function buildTopClientsByRevenue(
  missions: any[],
  refs: CanonicalRefs,
  period: DashboardPeriod,
  limit = 5,
  now = new Date(),
): Array<{ name: string; revenue: number }> {
  const { start, end } = getMonthRange(period);
  const inPeriod = filterMissionsByPeriod(missions, start, end);
  const map = new Map<string, number>();
  for (const m of inPeriod) {
    if (m.status === MissionStatus.REFUSED) continue;
    const name = String(m.client || 'Sem cliente').trim();
    const c = computeCanonicalRevenueCost(m, refs, now);
    map.set(name, (map.get(name) || 0) + c.rev);
  }
  return Array.from(map.entries())
    .map(([name, revenue]) => ({ name, revenue: round2(revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function buildClientRevenueCostBars(
  missions: any[],
  refs: CanonicalRefs,
  period: DashboardPeriod,
  limit = 6,
  now = new Date(),
): Array<{ name: string; revenue: number; cost: number }> {
  const { start, end } = getMonthRange(period);
  const inPeriod = filterMissionsByPeriod(missions, start, end);
  const map = new Map<string, { revenue: number; cost: number }>();
  for (const m of inPeriod) {
    if (m.status === MissionStatus.REFUSED) continue;
    const name = String(m.client || 'Sem cliente').trim();
    const row = map.get(name) || { revenue: 0, cost: 0 };
    const c = computeCanonicalRevenueCost(m, refs, now);
    row.revenue += c.rev;
    row.cost += c.cost;
    map.set(name, row);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name: name.length > 14 ? name.slice(0, 14) + '…' : name, revenue: round2(v.revenue), cost: round2(v.cost) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function buildQuotesFunnel(quotes: Array<{ status: string; total_value: number }>) {
  const stages = [
    { key: 'Rascunho', label: 'Rascunho' },
    { key: 'Enviada', label: 'Proposta' },
    { key: 'Aprovada', label: 'Fechado' },
  ];
  return stages.map(s => {
    const rows = quotes.filter(q => q.status === s.key);
    return {
      ...s,
      count: rows.length,
      value: round2(rows.reduce((acc, q) => acc + (Number(q.total_value) || 0), 0)),
    };
  });
}

export function buildMissionStatusCounts(missions: any[]): Array<{ status: string; count: number }> {
  const map = new Map<string, number>();
  for (const m of missions) {
    const st = String(m.status || 'Outros');
    map.set(st, (map.get(st) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildParentMissionsSummary(missions: any[]): { total: number; active: number } {
  const parentIds = new Set<string>();
  for (const m of missions) {
    if (m.parent_mission_id) parentIds.add(String(m.parent_mission_id));
  }
  const parents = missions.filter(m => parentIds.has(String(m.id)));
  const terminal = new Set(['Concluída', 'Cancelada', 'Recusada', 'Faturada']);
  const active = parents.filter(m => !terminal.has(String(m.status)));
  return { total: parents.length, active: active.length };
}

export function buildArApByMonth(
  transactions: FinancialTransaction[],
): Array<{ month: string; receber: number; pagar: number }> {
  const map = new Map<string, { receber: number; pagar: number }>();
  for (const t of transactions) {
    if (!['PENDING', 'SCHEDULED', 'OVERDUE'].includes(t.status)) continue;
    const month = String(t.due_date || '').slice(0, 7);
    if (!month) continue;
    const row = map.get(month) || { receber: 0, pagar: 0 };
    const amt = Number(t.amount) || 0;
    if (t.type === 'INCOME') row.receber += amt;
    else row.pagar += amt;
    map.set(month, row);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([iso, v]) => ({
      month: iso.slice(5, 7) + '/' + iso.slice(2, 4),
      receber: round2(v.receber),
      pagar: round2(v.pagar),
    }));
}

export function buildExpenseDonut(
  transactions: FinancialTransaction[],
  categories: FinancialCategory[],
): Array<{ name: string; value: number }> {
  const catName = new Map(categories.map(c => [c.id, c.name]));
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'EXPENSE' || t.status !== 'PAID') continue;
    const name = catName.get(t.category_id) || t.category_name || 'Outros';
    map.set(name, (map.get(name) || 0) + (Number(t.amount) || 0));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, value: round2(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

export function buildPendingApprovals(missions: any[], refs: CanonicalRefs, now = new Date()): PendingApprovalItem[] {
  const items: PendingApprovalItem[] = [];
  for (const m of missions) {
    if (m.status !== MissionStatus.COMPLETED && m.status !== 'Concluída') continue;
    if (m.billing_approved) continue;
    const c = computeCanonicalRevenueCost(m, refs, now);
    items.push({
      id: m.id,
      label: `OS ${m.id} — ${m.client || 'Cliente'}`,
      amount: c.rev,
      kind: 'mission',
    });
  }
  return items.sort((a, b) => b.amount - a.amount).slice(0, 8);
}

export function buildCriticalAlerts(input: {
  kpis: FinancialKpis;
  pendingApprovals: PendingApprovalItem[];
  missions: any[];
  refs: CanonicalRefs;
  accountBalance?: number;
  openQuotes: number;
  now?: Date;
}): CriticalAlert[] {
  const alerts: CriticalAlert[] = [];
  const now = input.now || new Date();

  if (input.kpis.grossMarginPct < 20 && input.kpis.grossRevenue > 0) {
    alerts.push({
      id: 'low-margin',
      severity: 'critical',
      title: 'Margem abaixo de 20%',
      detail: `Margem bruta do período: ${input.kpis.grossMarginPct.toFixed(1)}% (meta ${MARGIN_GOAL_PCT}%).`,
      actionScreen: 'missions',
    });
  }

  if (input.pendingApprovals.length > 0) {
    alerts.push({
      id: 'pending-billing',
      severity: 'warning',
      title: `${input.pendingApprovals.length} OS aguardando aprovação financeira`,
      detail: 'Conferir faturamento antes do fechamento do mês.',
      actionScreen: 'missions',
    });
  }

  if (typeof input.accountBalance === 'number' && input.accountBalance < 50_000) {
    alerts.push({
      id: 'low-cash',
      severity: 'critical',
      title: 'Fluxo de caixa baixo',
      detail: `Saldo consolidado estimado: ${fmtBRL(input.accountBalance)}.`,
      actionScreen: 'fin-dashboard',
    });
  }

  const lowMarginCount = input.missions.filter(m => {
    if (m.status === MissionStatus.REFUSED) return false;
    const c = computeCanonicalRevenueCost(m, input.refs, now);
    return c.rev > 0 && (c.profit / c.rev) * 100 < 20;
  }).length;
  if (lowMarginCount >= 3) {
    alerts.push({
      id: 'many-low-margin-os',
      severity: 'warning',
      title: `${lowMarginCount} OS com margem < 20%`,
      detail: 'Revisar precificação e custos de fornecedor.',
      actionScreen: 'missions',
    });
  }

  if (input.openQuotes > 5) {
    alerts.push({
      id: 'quotes-pipeline',
      severity: 'info',
      title: `${input.openQuotes} propostas em aberto`,
      detail: 'Pipeline comercial com volume elevado de cotações não fechadas.',
      actionScreen: 'quotes',
    });
  }

  if (input.kpis.grossRevenue < DEFAULT_MONTHLY_REVENUE_GOAL * 0.5) {
    const pct = ((input.kpis.grossRevenue / DEFAULT_MONTHLY_REVENUE_GOAL) * 100).toFixed(0);
    alerts.push({
      id: 'revenue-goal',
      severity: 'warning',
      title: 'Receita abaixo da meta mensal',
      detail: `Atingido ~${pct}% da meta de ${fmtShort(DEFAULT_MONTHLY_REVENUE_GOAL)}.`,
      actionScreen: 'missions',
    });
  }

  return alerts;
}
