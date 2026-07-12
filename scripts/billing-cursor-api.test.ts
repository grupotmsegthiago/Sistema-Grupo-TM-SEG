import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCursorMembership,
  parseUsdFromUsageCost,
  eventAmountUsd,
  cursorEventBillingCategory,
  type CursorUsageEvent,
} from '../lib/billing/cursorUsageApi.ts';
import { filterBillingLogRows, aggregateCursorBillingRows } from '../lib/billing/billingService.js';

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

test('cursorEventBillingCategory separa incluído vs on-demand', () => {
  assert.equal(cursorEventBillingCategory('USAGE_EVENT_KIND_INCLUDED_IN_ULTRA'), 'included');
  assert.equal(cursorEventBillingCategory('USAGE_EVENT_KIND_USAGE_BASED'), 'on_demand');
});

test('aggregateCursorBillingRows soma só extra em onDemandBrl', () => {
  const rows = [
    {
      id: '1',
      recorded_at: new Date().toISOString(),
      reference_month: '2026-07',
      source: 'cursor_dashboard' as const,
      external_id: 'a',
      token_id: 'm1',
      summary: 'incluído',
      amount_usd: 1,
      exchange_rate: 5.5,
      iof_pct: 4.38,
      amount_brl: 5.74,
      plan_balance_brl: null,
      metadata: { type: 'cursor_usage_event', billingCategory: 'included', kind: 'USAGE_EVENT_KIND_INCLUDED_IN_ULTRA' },
    },
    {
      id: '2',
      recorded_at: new Date().toISOString(),
      reference_month: '2026-07',
      source: 'cursor_dashboard' as const,
      external_id: 'b',
      token_id: 'm2',
      summary: 'extra',
      amount_usd: 2,
      exchange_rate: 5.5,
      iof_pct: 4.38,
      amount_brl: 11.48,
      plan_balance_brl: null,
      metadata: { type: 'cursor_usage_event', billingCategory: 'on_demand', kind: 'USAGE_EVENT_KIND_USAGE_BASED' },
    },
  ];
  const agg = aggregateCursorBillingRows(rows);
  assert.equal(agg.includedUsageValueBrl, 5.74);
  assert.equal(agg.onDemandBrl, 11.48);
});
