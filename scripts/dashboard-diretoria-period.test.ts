import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPeriodLabel,
  getPeriodRange,
  getRhReferenceMonth,
  getWeekMonday,
  getWeekSunday,
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

  it('mês corrente termina hoje; mês passado termina no último dia', () => {
    const cur = getPeriodRange({ mode: 'month', year: 2026, month: 6 }, sunday);
    assert.equal(cur.startIso, '2026-07-01');
    assert.equal(cur.endIso, '2026-07-12');

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
});
