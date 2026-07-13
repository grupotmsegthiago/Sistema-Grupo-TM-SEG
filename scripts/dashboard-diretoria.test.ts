import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFinancialKpis,
  computeOperationalKpis,
  computeCashKpis,
  buildQuotesFunnel,
  buildCriticalAlerts,
  buildDailyCashFlow,
} from '../lib/dashboardDiretoria/aggregations';
import { getPeriodRange, getCashMovementDate, formatPeriodRangeHint } from '../lib/dashboardDiretoria/periodUtils';
import { MissionStatus } from '../types';

describe('dashboardDiretoria aggregations', () => {
  it('formatPeriodRangeHint mostra mês calendário completo (01 → último dia)', () => {
    const now = new Date(2026, 6, 12, 12, 0, 0);
    const hint = formatPeriodRangeHint({ mode: 'month', year: 2026, month: 6 }, now);
    assert.equal(hint, 'Período: 01/07/2026 até 31/07/2026');
    const past = formatPeriodRangeHint({ mode: 'month', year: 2026, month: 5 }, now);
    assert.equal(past, 'Período: 01/06/2026 até 30/06/2026');
  });

  it('getPeriodRange no mês corrente vai até o último dia (não corta em hoje)', () => {
    const now = new Date(2026, 6, 13, 12, 0, 0);
    const range = getPeriodRange({ mode: 'month', year: 2026, month: 6 }, now);
    assert.equal(range.startIso, '2026-07-01');
    assert.equal(range.endIso, '2026-07-31');
  });

  it('computeFinancialKpis soma receita canônica e despesas pagas', () => {
    const missions = [{
      id: '1',
      status: MissionStatus.COMPLETED,
      client: 'Cliente A',
      start_time: '2026-07-10T10:00:00',
      revenue_value: 1000,
      cost_value: 600,
      billing_approved: true,
    }];
    const transactions = [
      { id: 't1', type: 'EXPENSE', status: 'PAID', amount: 100, due_date: '2026-07-12', category_id: 'c1', category_name: 'Aluguel' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Aluguel', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const refs = { clientTables: [], providerTables: [], clientsData: [] };
    const kpis = computeFinancialKpis(missions, transactions, categories, refs, { mode: 'month', year: 2026, month: 6 });
    assert.equal(kpis.grossRevenue, 1000);
    assert.equal(kpis.variableCost, 600);
    assert.equal(kpis.expenses, 100);
    assert.equal(kpis.netProfit, 300);
  });

  it('buildQuotesFunnel agrupa por status', () => {
    const funnel = buildQuotesFunnel([
      { status: 'Rascunho', total_value: 100 },
      { status: 'Enviada', total_value: 200 },
      { status: 'Aprovada', total_value: 300 },
    ]);
    assert.equal(funnel[0].count, 1);
    assert.equal(funnel[2].value, 300);
  });

  it('buildCriticalAlerts sinaliza margem baixa', () => {
    const alerts = buildCriticalAlerts({
      operational: { grossMarginPct: 15, grossRevenue: 10000, grossProfit: 1500, variableCost: 8500, missionCount: 10 },
      cash: { incomePaid: 0, expensePaid: 0, pendingReceivable: 0, pendingPayable: 0, overduePayable: 0, cashResult: 0, cashMarginPct: 0, totalCash: 100000, cashForecast: 0 },
      pendingApprovals: [],
      missions: [],
      refs: { clientTables: [], providerTables: [], clientsData: [] },
      openQuotes: 0,
    });
    assert.ok(alerts.some(a => a.id === 'low-margin'));
  });

  it('computeOperationalKpis e computeCashKpis não misturam caixa com OS', () => {
    const missions = [{
      id: '1', status: 'Concluída', start_time: '2026-07-10T10:00:00',
      revenue_value: 1000, cost_value: 600, billing_approved: true, client: 'A',
    }];
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PAID', amount: 5000, due_date: '2026-07-12', payment_date: '2026-07-12', category_id: 'c0' },
      { id: 't2', type: 'EXPENSE', status: 'PAID', amount: 2000, due_date: '2026-07-12', payment_date: '2026-07-12', category_id: 'c1', category_name: 'Aluguel' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Aluguel', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const refs = { clientTables: [], providerTables: [], clientsData: [] };
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const op = computeOperationalKpis(missions, refs, period);
    const cash = computeCashKpis(transactions, transactions, categories, [{ id: 'a1', initial_balance: 1000 }], period);
    assert.equal(op.grossProfit, 400);
    assert.equal(cash.cashResult, 3000);
  });

  it('computeCashKpis calcula previsão do caixa (a receber − a pagar) no período', () => {
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PENDING', amount: 1000, due_date: '2026-07-05', category_id: 'c0' },
      { id: 't2', type: 'INCOME', status: 'SCHEDULED', amount: 500, due_date: '2026-07-10', category_id: 'c0' },
      { id: 't3', type: 'EXPENSE', status: 'PENDING', amount: 800, due_date: '2026-07-15', category_id: 'c1', category_name: 'Fornecedor' },
      { id: 't4', type: 'EXPENSE', status: 'OVERDUE', amount: 200, due_date: '2026-07-20', category_id: 'c1', category_name: 'Aluguel' },
      { id: 't5', type: 'INCOME', status: 'PENDING', amount: 9999, due_date: '2026-08-01', category_id: 'c0' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Aluguel', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const endOfJuly = new Date(2026, 6, 31, 12, 0, 0);
    const cash = computeCashKpis([], transactions, categories, [], period, endOfJuly);
    assert.equal(cash.pendingReceivable, 1500);
    assert.equal(cash.pendingPayable, 1000);
    assert.equal(cash.cashForecast, 500);
  });

  it('computeCashKpis no mês corrente inclui vencimentos após hoje', () => {
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PENDING', amount: 2000, due_date: '2026-07-05', category_id: 'c0' },
      { id: 't2', type: 'INCOME', status: 'PENDING', amount: 3000, due_date: '2026-07-25', category_id: 'c0' },
      { id: 't3', type: 'INCOME', status: 'PENDING', amount: 9999, due_date: '2026-08-02', category_id: 'c0' },
    ] as any[];
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const midJuly = new Date(2026, 6, 13, 12, 0, 0);
    const cash = computeCashKpis([], transactions, [], [], period, midJuly);
    assert.equal(cash.pendingReceivable, 5000);
  });

  it('computeCashKpis filtra pendências por vencimento na semana', () => {
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PENDING', amount: 1000, due_date: '2026-07-10', category_id: 'c0' },
      { id: 't2', type: 'INCOME', status: 'PENDING', amount: 5000, due_date: '2026-08-01', category_id: 'c0' },
      { id: 't3', type: 'EXPENSE', status: 'PENDING', amount: 800, due_date: '2026-07-11', category_id: 'c1', category_name: 'X' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'X', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const period = { mode: 'week' as const, year: 2026, month: 6 };
    const sunday = new Date(2026, 6, 12, 12, 0, 0);
    const cash = computeCashKpis([], transactions, categories, [], period, sunday);
    assert.equal(cash.pendingReceivable, 1000);
    assert.equal(cash.pendingPayable, 800);
    assert.equal(cash.cashForecast, 200);
  });

  it('computeCashKpis usa payment_date para pagos no período (não due_date)', () => {
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PAID', amount: 1000, due_date: '2026-08-01', payment_date: '2026-07-12T14:00:00', category_id: 'c0' },
      { id: 't2', type: 'EXPENSE', status: 'PAID', amount: 400, due_date: '2026-08-05', payment_date: '2026-07-12', category_id: 'c1', category_name: 'Aluguel' },
      { id: 't3', type: 'INCOME', status: 'PAID', amount: 999, due_date: '2026-07-12', payment_date: '2026-06-01', category_id: 'c0' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Aluguel', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const period = { mode: 'today' as const, year: 2026, month: 6 };
    const sunday = new Date(2026, 6, 12, 12, 0, 0);
    const cash = computeCashKpis([], transactions, categories, [], period, sunday);
    assert.equal(cash.incomePaid, 1000);
    assert.equal(cash.expensePaid, 400);
    assert.equal(cash.cashResult, 600);
  });

  it('buildDailyCashFlow agrupa entradas/saídas por data de pagamento no período', () => {
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PAID', amount: 100, due_date: '2026-08-01', payment_date: '2026-07-10', category_id: 'c0' },
      { id: 't2', type: 'EXPENSE', status: 'PAID', amount: 50, due_date: '2026-08-01', payment_date: '2026-07-11', category_id: 'c1', category_name: 'X' },
      { id: 't3', type: 'INCOME', status: 'PAID', amount: 200, due_date: '2026-07-12', payment_date: '2026-06-01', category_id: 'c0' },
    ] as any[];
    const period = { mode: 'week' as const, year: 2026, month: 6 };
    const sunday = new Date(2026, 6, 12, 12, 0, 0);
    const flow = buildDailyCashFlow(transactions, period, sunday);
    assert.equal(flow.length, 2);
    assert.deepEqual(flow[0], { day: '10/07', inflow: 100, outflow: 0 });
    assert.deepEqual(flow[1], { day: '11/07', inflow: 0, outflow: 50 });
  });
});

describe('DiretoriaSistemaTab auth', () => {
  it('usa authFetch com localStorage authToken (não Supabase session)', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('components/dashboard/DiretoriaSistemaTab.tsx', 'utf8'),
    );
    assert.match(src, /authFetch/);
    assert.match(src, /localStorage\.getItem\('authToken'\)/);
    assert.doesNotMatch(src, /supabase\.auth\.getSession/);
    assert.doesNotMatch(src, /from '\.\.\/\.\.\/lib\/supabase'/);
  });
});

describe('Cockpit Atualizar → recalcula OS', () => {
  it('hook chama /api/recalculate-all antes de recarregar KPIs', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('lib/dashboardDiretoria/useDashboardDiretoriaData.ts', 'utf8'),
    );
    assert.match(src, /authFetch\('\/api\/recalculate-open'/);
    assert.match(src, /scope:\s*'open'/);
    assert.match(src, /recalculateOpenMissionsBilling/);
    assert.match(src, /friendlyRecalcError/);
    assert.match(src, /Fetch is aborted|fetch is aborted/i);
    assert.doesNotMatch(src, /new AbortController/);
    assert.match(src, /const refresh = useCallback\(async \(\) =>/);
    assert.match(src, /await recalculateOpenMissionsBilling\(\)/);
    assert.match(src, /await load\(\)/);
  });

  it('botão Atualizar do cockpit dispara data.refresh com feedback', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('components/dashboard/DashboardDiretoria.tsx', 'utf8'),
    );
    assert.match(src, /data\.refresh/);
    assert.match(src, /lastRecalc/);
    assert.match(src, /hora extra/);
  });
});
