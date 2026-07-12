import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCursorMembership,
  parseUsdFromUsageCost,
  eventAmountUsd,
  type CursorUsageEvent,
} from '../lib/billing/cursorUsageApi.ts';
import { filterBillingLogRows } from '../lib/billing/billingService.js';

test('formatCursorMembership mapeia planos conhecidos', () => {
  assert.equal(formatCursorMembership('pro'), 'Cursor Pro');
  assert.equal(formatCursorMembership('ultra'), 'Cursor Ultra');
  assert.equal(formatCursorMembership('business'), 'Cursor Business');
});

test('parseUsdFromUsageCost lê valores formatados', () => {
  assert.equal(parseUsdFromUsageCost('$1.21'), 1.21);
  assert.equal(parseUsdFromUsageCost('US$ 42.50'), 42.5);
});

test('eventAmountUsd prioriza chargedCents', () => {
  const evt: CursorUsageEvent = {
    timestamp: '1775418973898',
    model: 'claude-4.6-opus-high-thinking',
    kind: 'USAGE_EVENT_KIND_USAGE_BASED',
    chargedCents: 124.73,
    usageBasedCosts: '$1.21',
  };
  assert.equal(eventAmountUsd(evt), 1.25);
});

test('filterBillingLogRows remove resumo interno e sync', () => {
  const rows = filterBillingLogRows([
    {
      id: '1',
      recorded_at: new Date().toISOString(),
      reference_month: '2026-07',
      source: 'cursor_dashboard',
      external_id: 'cursor-summary-x',
      token_id: null,
      summary: 'resumo',
      amount_usd: 0,
      exchange_rate: 5.5,
      iof_pct: 4.38,
      amount_brl: 0,
      plan_balance_brl: null,
      metadata: { type: 'cursor_usage_summary' },
    },
    {
      id: '2',
      recorded_at: new Date().toISOString(),
      reference_month: '2026-07',
      source: 'cursor_dashboard',
      external_id: 'evt-1',
      token_id: 'composer-2',
      summary: 'composer',
      amount_usd: 2,
      exchange_rate: 5.5,
      iof_pct: 4.38,
      amount_brl: 11.48,
      plan_balance_brl: 100,
      metadata: { type: 'cursor_usage_event' },
    },
    {
      id: '3',
      recorded_at: new Date().toISOString(),
      reference_month: '2026-07',
      source: 'sync',
      external_id: null,
      token_id: 'system',
      summary: 'sync',
      amount_usd: 0,
      exchange_rate: 5.5,
      iof_pct: 4.38,
      amount_brl: 0,
      plan_balance_brl: null,
      metadata: null,
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '2');
});
