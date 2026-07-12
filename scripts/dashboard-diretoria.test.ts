import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFinancialKpis,
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
    const kpis = computeFinancialKpis(missions, transactions, categories, refs, { year: 2026, month: 6 });
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
      kpis: { grossMarginPct: 15, grossRevenue: 10000 } as any,
      pendingApprovals: [],
      missions: [],
      refs: { clientTables: [], providerTables: [], clientsData: [] },
      openQuotes: 0,
    });
    assert.ok(alerts.some(a => a.id === 'low-margin'));
  });
});
