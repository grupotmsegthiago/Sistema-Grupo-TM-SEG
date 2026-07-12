import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFinancialKpis,
  computeOperationalKpis,
  computeCashKpis,
  buildQuotesFunnel,
  buildCriticalAlerts,
} from '../lib/dashboardDiretoria/aggregations';
import { MissionStatus } from '../types';

describe('dashboardDiretoria aggregations', () => {
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
      { id: 't1', type: 'INCOME', status: 'PAID', amount: 5000, due_date: '2026-07-12', category_id: 'c0' },
      { id: 't2', type: 'EXPENSE', status: 'PAID', amount: 2000, due_date: '2026-07-12', category_id: 'c1', category_name: 'Aluguel' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Aluguel', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const refs = { clientTables: [], providerTables: [], clientsData: [] };
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const op = computeOperationalKpis(missions, refs, period);
    const cash = computeCashKpis(transactions, transactions, categories, [{ id: 'a1', initial_balance: 1000 }], period);
    assert.equal(op.grossProfit, 400);
    assert.equal(cash.cashResult, 3000);
  });

  it('computeCashKpis calcula previsão do caixa (a receber − a pagar)', () => {
    const transactions = [
      { id: 't1', type: 'INCOME', status: 'PENDING', amount: 1000, due_date: '2026-08-01', category_id: 'c0' },
      { id: 't2', type: 'INCOME', status: 'SCHEDULED', amount: 500, due_date: '2026-08-05', category_id: 'c0' },
      { id: 't3', type: 'EXPENSE', status: 'PENDING', amount: 800, due_date: '2026-08-10', category_id: 'c1', category_name: 'Fornecedor' },
      { id: 't4', type: 'EXPENSE', status: 'OVERDUE', amount: 200, due_date: '2026-06-01', category_id: 'c1', category_name: 'Aluguel' },
    ] as any[];
    const categories = [{ id: 'c1', name: 'Aluguel', type: 'EXPENSE', group: 'DESPESAS_FIXAS' }] as any[];
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const cash = computeCashKpis([], transactions, categories, [], period);
    assert.equal(cash.pendingReceivable, 1500);
    assert.equal(cash.pendingPayable, 1000);
    assert.equal(cash.cashForecast, 500);
  });
});
