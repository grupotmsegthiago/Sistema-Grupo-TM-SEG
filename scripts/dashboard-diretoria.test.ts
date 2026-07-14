import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFinancialKpis,
  computeOperationalKpis,
  computeCashKpis,
  computeAccountBalanceOverview,
  isOperationalGroupAccountName,
  buildQuotesFunnel,
  buildCriticalAlerts,
  buildDailyCashFlow,
  buildDailyRevenueMonthComparison,
  buildCashTitleBreakdown,
  buildOpenCashOutlook,
  buildProvisionHorizon,
  resolveOpenCashEntityName,
} from '../lib/dashboardDiretoria/aggregations';
import {
  getPeriodRange,
  getCashMovementDate,
  formatPeriodRangeHint,
  getPreviousMonthPeriod,
} from '../lib/dashboardDiretoria/periodUtils';
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

  it('buildOpenCashOutlook soma a receber em aberto sem teto de prazo (60/90 dias)', () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const transactions = [
      { id: 'r1', type: 'INCOME', status: 'PENDING', amount: 1000, due_date: '2026-07-10', entity_name: 'Cliente A', category_id: 'c0' },
      { id: 'r2', type: 'INCOME', status: 'SCHEDULED', amount: 5000, due_date: '2026-09-15', entity_name: 'Cliente B', category_id: 'c0' },
      { id: 'r3', type: 'INCOME', status: 'PENDING', amount: 2000, due_date: '2026-10-01', entity_name: 'Cliente A', category_id: 'c0' },
      { id: 'p1', type: 'EXPENSE', status: 'PENDING', amount: 1500, due_date: '2026-08-20', entity_name: 'Fornecedor X', category_id: 'c1', category_name: 'Fornecedor' },
      { id: 'paid', type: 'INCOME', status: 'PAID', amount: 9999, due_date: '2026-07-01', payment_date: '2026-07-01', entity_name: 'Ignorar', category_id: 'c0' },
      { id: 'inv', type: 'INCOME', status: 'PENDING', amount: 8888, due_date: '2026-12-01', entity_name: 'Aplicação', category_id: 'cinv', category_name: 'Investimento' },
    ] as any[];
    const categories = [
      { id: 'c1', name: 'Fornecedor', type: 'EXPENSE', group: 'DESPESAS_VARIAVEIS' },
      { id: 'cinv', name: 'Investimento', type: 'INCOME', group: 'INVESTIMENTOS' },
    ] as any[];
    const outlook = buildOpenCashOutlook(transactions, categories, now, 10);
    assert.equal(outlook.receivableTotal, 8000);
    assert.equal(outlook.payableTotal, 1500);
    assert.equal(outlook.netOutlook, 6500);
    assert.equal(outlook.overdueReceivable, 1000);
    assert.equal(outlook.receivableCount, 3);
    assert.equal(outlook.byClientReceivable[0].entity, 'Cliente B');
    assert.equal(outlook.byClientReceivable[0].amount, 5000);
    assert.equal(outlook.byClientReceivable[1].entity, 'Cliente A');
    assert.equal(outlook.byClientReceivable[1].amount, 3000);
    assert.equal(outlook.topReceivable[0].id, 'r1');
    assert.ok(!outlook.topReceivable.some((r) => r.id === 'inv'));
  });

  it('resolveOpenCashEntityName troca "Outros" pelo cliente lido na descrição', () => {
    assert.equal(resolveOpenCashEntityName({ entity_name: 'Outros', description: 'DHL JUNHO' }), 'DHL');
    assert.equal(resolveOpenCashEntityName({ entity_name: 'Outros', description: 'ceva mensal junho 2026' }), 'CEVA');
    assert.equal(resolveOpenCashEntityName({ entity_name: 'CESLOG LTDA', description: 'x' }), 'CESLOG LTDA');
    assert.equal(
      resolveOpenCashEntityName({ entity_name: 'Outros', description: 'titulo generico' }),
      'Cliente não informado no título',
    );
  });

  it('buildOpenCashOutlook NÃO agrupa receita como "Outros" quando descrição tem cliente', () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const transactions = [
      { id: 'd1', type: 'INCOME', status: 'PENDING', amount: 800_000, due_date: '2026-08-13', entity_name: 'Outros', description: 'DHL JUNHO', category_id: 'c0' },
      { id: 'c1', type: 'INCOME', status: 'PENDING', amount: 275_000, due_date: '2026-09-10', entity_name: 'Outros', description: 'ceva mensal junho 2026', category_id: 'c0' },
    ] as any[];
    const outlook = buildOpenCashOutlook(transactions, [], now, 10);
    assert.equal(outlook.byClientReceivable.find((r) => r.entity === 'DHL')?.amount, 800_000);
    assert.equal(outlook.byClientReceivable.find((r) => r.entity === 'CEVA')?.amount, 275_000);
    assert.ok(!outlook.byClientReceivable.some((r) => /^outros?$/i.test(r.entity)));
  });

  it('getPreviousMonthPeriod volta um mês (inclui virada de ano)', () => {
    assert.deepEqual(getPreviousMonthPeriod({ mode: 'month', year: 2026, month: 6 }), {
      mode: 'month',
      year: 2026,
      month: 5,
    });
    assert.deepEqual(getPreviousMonthPeriod({ mode: 'month', year: 2026, month: 0 }), {
      mode: 'month',
      year: 2025,
      month: 11,
    });
  });

  it('buildDailyRevenueMonthComparison alinha dia D do mês atual × mês anterior e acumula', () => {
    const now = new Date(2026, 6, 14, 12, 0, 0); // 14/07/2026
    const refs = { clientTables: [], providerTables: [], clientsData: [] };
    const missions = [
      {
        id: 'j1',
        status: MissionStatus.COMPLETED,
        start_time: '2026-06-01T10:00:00',
        revenue_value: 1000,
        cost_value: 400,
        billing_approved: true,
      },
      {
        id: 'j2',
        status: MissionStatus.COMPLETED,
        start_time: '2026-06-01T15:00:00',
        revenue_value: 500,
        cost_value: 200,
        billing_approved: true,
      },
      {
        id: 'l1',
        status: MissionStatus.COMPLETED,
        start_time: '2026-07-01T10:00:00',
        revenue_value: 2000,
        cost_value: 800,
        billing_approved: true,
      },
      {
        id: 'l2',
        status: MissionStatus.COMPLETED,
        start_time: '2026-07-02T10:00:00',
        revenue_value: 300,
        cost_value: 100,
        billing_approved: true,
      },
      {
        // depois de "hoje" — não deve entrar no acumulado do mês corrente
        id: 'l-future',
        status: MissionStatus.COMPLETED,
        start_time: '2026-07-20T10:00:00',
        revenue_value: 9999,
        cost_value: 1,
        billing_approved: true,
      },
    ];
    const cmp = buildDailyRevenueMonthComparison(
      missions,
      refs,
      { mode: 'month', year: 2026, month: 6 },
      now,
    );
    assert.equal(cmp.previousLabel, 'Jun/2026');
    assert.equal(cmp.currentLabel, 'Jul/2026');
    const d1 = cmp.points.find((p) => p.day === 1);
    assert.ok(d1);
    assert.equal(d1!.previous, 1500);
    assert.equal(d1!.current, 2000);
    assert.equal(d1!.labelCompare, '01/06 × 01/07');
    const d2 = cmp.points.find((p) => p.day === 2);
    assert.equal(d2!.currentCum, 2300);
    assert.equal(d2!.previousCum, 1500); // jun sem fatura no dia 2
    const d20 = cmp.points.find((p) => p.day === 20);
    assert.equal(d20!.current, null);
    assert.ok((cmp.deltaCumPct ?? 0) > 0);
  });

  it('buildProvisionHorizon alinha dívidas até a última data da receita em aberto', () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const transactions = [
      { id: 'r1', type: 'INCOME', status: 'PENDING', amount: 1_500_000, due_date: '2026-08-13', entity_name: 'DHL', category_id: 'c0' },
      { id: 'r2', type: 'INCOME', status: 'PENDING', amount: 500_000, due_date: '2026-10-20', entity_name: 'CEVA', category_id: 'c0' },
      { id: 'p1', type: 'EXPENSE', status: 'PENDING', amount: 200_000, due_date: '2026-07-20', entity_name: 'Forn A', category_id: 'c1', category_name: 'Fornecedor' },
      { id: 'p2', type: 'EXPENSE', status: 'PENDING', amount: 300_000, due_date: '2026-09-15', entity_name: 'Forn B', category_id: 'c1', category_name: 'Fornecedor' },
      { id: 'p3', type: 'EXPENSE', status: 'PENDING', amount: 900_000, due_date: '2026-11-01', entity_name: 'Forn C', category_id: 'c1', category_name: 'Fornecedor' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Fornecedor', type: 'EXPENSE', group: 'DESPESAS_VARIAVEIS' }] as any[];
    const h = buildProvisionHorizon(transactions, categories, now);
    assert.equal(h.lastReceivableDate, '2026-10-20');
    assert.equal(h.receivableTotal, 2_000_000);
    assert.equal(h.payableInHorizon, 500_000); // p1+p2 até 20/10; p3 fica fora
    assert.equal(h.payableInHorizonCount, 2);
    assert.equal(h.payableBeyondHorizon, 900_000);
    assert.equal(h.payableBeyondCount, 1);
    assert.equal(h.netInHorizon, 1_500_000);
  });

  it('computeAccountBalanceOverview soma total de todas as contas e investimentos', () => {
    assert.equal(isOperationalGroupAccountName('TM Gestão'), true);
    assert.equal(isOperationalGroupAccountName('BTG Renda Fixa'), false);
    const overview = computeAccountBalanceOverview(
      [
        { id: 'op1', name: 'TM Gestão', bank_name: 'Asaas', initial_balance: 10_000 },
        { id: 'inv1', name: 'BTG Renda Fixa', bank_name: 'BTG', initial_balance: 100_000 },
        { id: 'inv2', name: 'XP CDB', bank_name: 'XP', initial_balance: 200_000 },
      ],
      { inv1: 500_000, inv2: 900_000 },
    );
    assert.equal(overview.investmentsTotal, 1_400_000);
    assert.equal(overview.accountsTotal, 1_410_000);
    assert.equal(overview.investmentCount, 2);
    assert.equal(overview.operationalTotal, 10_000);
    assert.equal(overview.accounts.length, 3);
    assert.equal(overview.accounts[0].name, 'XP CDB');
    assert.equal(overview.accounts[0].balance, 900_000);
    assert.equal(overview.accounts.find((a) => a.id === 'inv1')?.kind, 'investment');
    assert.equal(overview.accounts.find((a) => a.id === 'op1')?.kind, 'operational');
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

  it('buildCashTitleBreakdown lista maiores títulos com a mesma regra do KPI', () => {
    const transactions = [
      { id: 'p1', type: 'EXPENSE', status: 'PAID', amount: 900, due_date: '2026-07-01', payment_date: '2026-07-03', category_id: 'c1', category_name: 'FORNECEDOR', description: 'Torres maio', entity_name: 'Torres' },
      { id: 'p2', type: 'EXPENSE', status: 'PAID', amount: 100, due_date: '2026-07-01', payment_date: '2026-07-04', category_id: 'c1', category_name: 'FORNECEDOR', description: 'Pequeno' },
      { id: 'r1', type: 'INCOME', status: 'PENDING', amount: 5000, due_date: '2026-07-20', category_id: 'c0', category_name: 'CLIENTE', description: 'DHL NF' },
      { id: 'r2', type: 'INCOME', status: 'PENDING', amount: 50, due_date: '2026-07-21', category_id: 'c0', category_name: 'CLIENTE', description: 'Outro' },
      { id: 'x1', type: 'EXPENSE', status: 'PENDING', amount: 7000, due_date: '2026-07-15', category_id: 'c1', category_name: 'FORNECEDOR', description: 'Torres junho' },
      { id: 'skip', type: 'EXPENSE', status: 'PENDING', amount: 9999, due_date: '2026-08-01', category_id: 'c1', description: 'fora do mês' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'FORNECEDOR', type: 'EXPENSE', group: 'DESPESAS_VARIAVEIS' }] as any[];
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const list = buildCashTitleBreakdown(transactions, categories, period, now, 1);
    assert.equal(list.paidExpenseCount, 2);
    assert.equal(list.paidExpense[0].id, 'p1');
    assert.equal(list.paidExpense[0].amount, 900);
    assert.equal(list.pendingReceivableCount, 2);
    assert.equal(list.pendingReceivable[0].id, 'r1');
    assert.equal(list.pendingPayable[0].id, 'x1');
    assert.equal(list.pendingPayableCount, 1);
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
  it('hook chama /api/recalculate-open antes de recarregar KPIs', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('lib/dashboardDiretoria/useDashboardDiretoriaData.ts', 'utf8'),
    );
    assert.match(src, /authFetch\('\/api\/recalculate-open'/);
    assert.match(src, /scope:\s*'open'/);
    assert.match(src, /recalculateOpenMissionsBilling/);
    assert.match(src, /friendlyRecalcError/);
    assert.match(src, /Fetch is aborted|fetch is aborted/i);
    assert.match(src, /FUNCTION_INVOCATION_FAILED/);
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

  it('cockpit mostra detalhamento de caixa com ranking de títulos', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('components/dashboard/DashboardDiretoria.tsx', 'utf8'),
    );
    assert.match(src, /buildCashTitleBreakdown/);
    assert.match(src, /Como ler o caixa/);
    assert.match(src, /Resultado realizado/);
    assert.match(src, /Previsão do pendente/);
    assert.match(src, /Maiores a pagar/);
    assert.match(src, /Transferência entre contas da empresa/);
    assert.match(src, /cash-title-breakdown/);
    assert.match(src, /from 'react'/);
  });

  it('cockpit exibe 3 cards de liquidez: dívidas, contas sem XP e receita em aberto', async () => {
    const fs = await import('node:fs/promises');
    const ui = await fs.readFile('components/dashboard/DashboardDiretoria.tsx', 'utf8');
    const hook = await fs.readFile('lib/dashboardDiretoria/useDashboardDiretoriaData.ts', 'utf8');
    assert.match(ui, /computeAccountBalanceOverview/);
    assert.match(ui, /buildOpenCashOutlook/);
    assert.match(ui, /Dívidas em Aberto/);
    assert.match(ui, /Total nas contas/);
    assert.match(ui, /Receita em Aberto/);
    assert.match(ui, /sem XP \/ investimentos/);
    assert.match(ui, /operationalTotal/);
    assert.match(ui, /liquidez-resumo-diretoria/);
    assert.match(ui, /open-cash-outlook-diretoria/);
    assert.match(ui, /provision-horizon-diretoria/);
    assert.match(ui, /buildProvisionHorizon/);
    assert.match(ui, /Provisionamento alinhado/);
    assert.match(ui, /Dívidas · Contas · Receita/);
    assert.match(ui, /Caixa do período \(liquidez\)/);
    assert.match(ui, /buildDailyRevenueMonthComparison/);
    assert.match(ui, /revenue-month-compare-diretoria/);
    assert.match(ui, /Faturamento diário \(OS\)/);
    assert.match(ui, /resolveOpenCashEntityName|Outros/);
    assert.match(hook, /getPreviousMonthPeriod/);
    assert.doesNotMatch(ui, /Saldo total de todas as contas/);
    // Ordem Visão Geral: Cards → OS → Provisionamento → Faturamento diário → Detalhe → Caixa
    const geralStart = ui.indexOf('const renderGeral');
    const geralEnd = ui.indexOf('const renderFinanceiro');
    assert.ok(geralStart > 0 && geralEnd > geralStart);
    const geral = ui.slice(geralStart, geralEnd);
    const idxCards = geral.indexOf('Dívidas · Contas · Receita');
    const idxOp = geral.indexOf('Operação (OS)');
    const idxProv = geral.indexOf('Provisionamento alinhado');
    const idxFat = geral.indexOf('Faturamento diário (OS)');
    const idxDetalhe = geral.indexOf('Detalhe do em aberto');
    const idxCaixa = geral.indexOf('Caixa do período (liquidez)');
    assert.ok(
      idxCards >= 0 &&
        idxOp > idxCards &&
        idxProv > idxOp &&
        idxFat > idxProv &&
        idxDetalhe > idxFat &&
        idxCaixa > idxDetalhe,
      `ordem inválida em renderGeral: cards=${idxCards} op=${idxOp} prov=${idxProv} fat=${idxFat} detalhe=${idxDetalhe} caixa=${idxCaixa}`,
    );
    assert.match(ui, /from 'react'/);
    assert.match(hook, /listBalanceSnapshotsDirect/);
    assert.match(hook, /latestAccountBalances/);
    assert.match(hook, /name, bank_name, initial_balance/);
  });

  it('handler serverless usa bundle CJS do motor financeiro (não import ESM de financialUtils)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/recalculate-open.ts', 'utf8');
    assert.match(src, /require\(["']\.\/_recalculate-open-core\.cjs["']\)/);
    assert.match(src, /createRequire/);
    assert.doesNotMatch(src, /from ['"]\.\.\/lib\/financialUtils/);
    const buildSrc = await fs.readFile('build-server.mjs', 'utf8');
    assert.match(buildSrc, /_recalculate-open-core\.cjs/);
    const core = await fs.readFile('api/_recalculate-open-core.cjs', 'utf8');
    assert.match(core, /calculateMissionFinancials/);
  });
});
