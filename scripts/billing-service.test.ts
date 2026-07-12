import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  usdToBrl,
  brlToUsd,
  getPlanLimitBrl,
  buildTokenEfficiencyReport,
  referenceMonthFromDate,
} from '../lib/billing/billingService.js';

describe('billingService', () => {
  it('usdToBrl aplica câmbio 5.50 e IOF 4.38%', () => {
    const brl = usdToBrl(10, 5.5, 4.38);
    assert.equal(brl, 57.41);
  });

  it('brlToUsd é inverso aproximado de usdToBrl', () => {
    const usd = 20;
    const brl = usdToBrl(usd, 5.5, 4.38);
    const back = brlToUsd(brl, 5.5, 4.38);
    assert.ok(Math.abs(back - usd) < 0.01);
  });

  it('referenceMonthFromDate retorna YYYY-MM', () => {
    const m = referenceMonthFromDate(new Date(2026, 6, 12));
    assert.equal(m, '2026-07');
  });

  it('buildTokenEfficiencyReport sugere consolidação em tarefas repetidas', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      id: String(i),
      recorded_at: new Date().toISOString(),
      reference_month: '2026-07',
      source: 'agent_token' as const,
      external_id: null,
      token_id: `tok-${i}`,
      summary: 'Refatorar módulo financeiro completo',
      amount_usd: 1,
      exchange_rate: 5.5,
      iof_pct: 4.38,
      amount_brl: 10,
      plan_balance_brl: 100,
      metadata: null,
    }));
    const report = buildTokenEfficiencyReport(rows);
    assert.ok(report.recommendations.length > 0);
    assert.ok(report.agentsMdSnippets.some(s => s.includes('diff mínimo')));
  });
});
