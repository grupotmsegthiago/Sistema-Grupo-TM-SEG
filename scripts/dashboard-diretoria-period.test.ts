import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultPeriod,
  formatPeriodLabel,
  getCalendarPartsBR,
  getPeriodRange,
  getPreviousMonthPeriod,
  getRevenueCompareFetchRange,
  getRhReferenceMonth,
  getWeekMonday,
  getWeekSunday,
  isCurrentCalendarMonth,
  listMonthsEndingAt,
  resolveRevenueComparePeriod,
  toIsoDate,
} from '../lib/dashboardDiretoria/periodUtils';

describe('dashboardDiretoria periodUtils', () => {
  const sunday = new Date(2026, 6, 12, 15, 30, 0); // dom 12/07/2026

  it('hoje cobre 00:00 até 23:59 do dia atual', () => {
    const { start, end, startIso, endIso } = getPeriodRange({ mode: 'today', year: 2026, month: 6 }, sunday);
    assert.equal(startIso, '2026-07-12');
    assert.equal(endIso, '2026-07-12');
    assert.equal(start.getHours(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
  });

  it('semana vai de segunda a domingo', () => {
    const monday = getWeekMonday(sunday);
    const weekEnd = getWeekSunday(sunday);
    assert.equal(monday.getDay(), 1);
    assert.equal(weekEnd.getDay(), 0);
    assert.equal(toIsoDate(monday), '2026-07-06');
    assert.equal(toIsoDate(weekEnd), '2026-07-12');

    const { startIso, endIso } = getPeriodRange({ mode: 'week', year: 2026, month: 6 }, sunday);
    assert.equal(startIso, '2026-07-06');
    assert.equal(endIso, '2026-07-12');
  });

  it('mês calendário vai do dia 01 ao último dia (inclusive o mês corrente)', () => {
    const cur = getPeriodRange({ mode: 'month', year: 2026, month: 6 }, sunday);
    assert.equal(cur.startIso, '2026-07-01');
    assert.equal(cur.endIso, '2026-07-31');

    const past = getPeriodRange({ mode: 'month', year: 2026, month: 5 }, sunday);
    assert.equal(past.startIso, '2026-06-01');
    assert.equal(past.endIso, '2026-06-30');
  });

  it('formatPeriodLabel descreve hoje, semana e mês', () => {
    assert.match(formatPeriodLabel({ mode: 'today', year: 2026, month: 6 }, sunday), /Hoje, 12\/07\/2026/);
    assert.match(formatPeriodLabel({ mode: 'week', year: 2026, month: 6 }, sunday), /Semana 06\/07 – 12\/07\/2026/);
    assert.equal(formatPeriodLabel({ mode: 'month', year: 2026, month: 6 }, sunday), 'Julho 2026');
  });

  it('RH usa mês calendário atual em hoje/semana', () => {
    assert.equal(getRhReferenceMonth({ mode: 'today', year: 2025, month: 0 }, sunday), '2026-07');
    assert.equal(getRhReferenceMonth({ mode: 'month', year: 2026, month: 5 }, sunday), '2026-06');
  });

  it('createDefaultPeriod usa mês civil vigente (ex.: 01/08 → Agosto)', () => {
    const aug1 = new Date(2026, 7, 1, 12, 0, 0);
    const p = createDefaultPeriod(aug1);
    assert.deepEqual(p, { mode: 'month', year: 2026, month: 7 });
    assert.equal(isCurrentCalendarMonth(p, aug1), true);
    assert.deepEqual(getPreviousMonthPeriod(p), { mode: 'month', year: 2026, month: 6 });
    assert.deepEqual(getCalendarPartsBR(aug1), { year: 2026, month: 7, day: 1 });
  });

  it('resolveRevenueComparePeriod em hoje/semana força mês vigente', () => {
    const aug1 = new Date(2026, 7, 1, 14, 0, 0);
    const stale = { mode: 'today' as const, year: 2026, month: 5 }; // filtro ainda em junho
    const cmp = resolveRevenueComparePeriod(stale, aug1);
    assert.deepEqual(cmp, { mode: 'month', year: 2026, month: 7 });
    const explicit = resolveRevenueComparePeriod({ mode: 'month', year: 2026, month: 5 }, aug1);
    assert.deepEqual(explicit, { mode: 'month', year: 2026, month: 5 });
  });

  it('listMonthsEndingAt cobre 12 meses até o âncora (Ago → Set ano anterior)', () => {
    const months = listMonthsEndingAt({ mode: 'month', year: 2026, month: 7 }, 12);
    assert.equal(months.length, 12);
    assert.deepEqual(months[0], { mode: 'month', year: 2025, month: 8 });
    assert.deepEqual(months[11], { mode: 'month', year: 2026, month: 7 });
    const range = getRevenueCompareFetchRange({ mode: 'month', year: 2026, month: 7 });
    assert.equal(range.startIso, '2025-09-01');
    assert.equal(range.endIso, '2026-08-31');
  });
});
