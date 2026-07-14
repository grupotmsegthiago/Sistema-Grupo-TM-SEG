import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeJourneyDayMetrics,
  formatDurationHoursMinutes,
} from '../lib/timeclock/journeyMetrics';

describe('journeyMetrics', () => {
  it('formatDurationHoursMinutes formata horas e minutos', () => {
    assert.equal(formatDurationHoursMinutes(0), '0min');
    assert.equal(formatDurationHoursMinutes(45), '45min');
    assert.equal(formatDurationHoursMinutes(60), '1h');
    assert.equal(formatDurationHoursMinutes(135), '2h 15min');
  });

  it('computeJourneyDayMetrics soma serviço e almoço do dia', () => {
    const now = new Date('2026-07-14T18:00:00-03:00');
    const entries = [
      { type: 'IN', timestamp: '2026-07-14T08:00:00-03:00' },
      { type: 'BREAK_START', timestamp: '2026-07-14T12:00:00-03:00' },
      { type: 'BREAK_END', timestamp: '2026-07-14T13:00:00-03:00' },
      { type: 'OUT', timestamp: '2026-07-14T17:00:00-03:00' },
    ];
    const m = computeJourneyDayMetrics(entries, now);
    assert.equal(m.lunchMinutes, 60);
    assert.equal(m.workedMinutes, 8 * 60); // 4h + 4h
    assert.equal(m.onDuty, false);
    assert.equal(m.onLunch, false);
    assert.equal(m.serviceOpenMinutes, 0);
  });

  it('computeJourneyDayMetrics conta trecho aberto em serviço', () => {
    const now = new Date('2026-07-14T10:30:00-03:00');
    const entries = [{ type: 'IN', timestamp: '2026-07-14T08:00:00-03:00' }];
    const m = computeJourneyDayMetrics(entries, now);
    assert.equal(m.serviceOpenMinutes, 150);
    assert.equal(m.workedMinutes, 150);
    assert.equal(m.onDuty, true);
    assert.equal(m.lunchMinutes, 0);
  });

  it('computeJourneyDayMetrics conta almoço em andamento', () => {
    const now = new Date('2026-07-14T12:40:00-03:00');
    const entries = [
      { type: 'IN', timestamp: '2026-07-14T08:00:00-03:00' },
      { type: 'BREAK_START', timestamp: '2026-07-14T12:00:00-03:00' },
    ];
    const m = computeJourneyDayMetrics(entries, now);
    assert.equal(m.workedMinutes, 4 * 60);
    assert.equal(m.lunchMinutes, 40);
    assert.equal(m.onLunch, true);
    assert.equal(m.serviceOpenMinutes, 0);
  });
});
