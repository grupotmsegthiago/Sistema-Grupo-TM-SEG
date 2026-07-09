import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasOpenShiftJourney,
  mergeShiftEntries,
  resolveActiveShiftEntries,
} from '../lib/timeclock/shiftEntries.ts';
import { needsEntryPunchToday } from '../lib/timeclock/eligibility.ts';

test('hasOpenShiftJourney detecta plantão aberto', () => {
  assert.equal(hasOpenShiftJourney([]), false);
  assert.equal(hasOpenShiftJourney([{ type: 'IN' }]), true);
  assert.equal(
    hasOpenShiftJourney([{ type: 'IN' }, { type: 'BREAK_START' }, { type: 'BREAK_END' }]),
    true,
  );
  assert.equal(
    hasOpenShiftJourney([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
      { type: 'OUT' },
    ]),
    false,
  );
});

test('resolveActiveShiftEntries une ontem+ hoje para noturno em plantão', () => {
  const yesterday = [
    { type: 'IN' as const, timestamp: '2026-07-08T23:00:00.000Z', user_id: '1' },
  ];
  const today: typeof yesterday = [];
  const merged = resolveActiveShiftEntries(today as any, yesterday as any, 'noturno');
  assert.equal(merged.length, 1);
  assert.equal(needsEntryPunchToday(merged), false);
});

test('resolveActiveShiftEntries ignora diurno', () => {
  const yesterday = [{ type: 'IN' as const, timestamp: '2026-07-08T23:00:00.000Z', user_id: '1' }];
  const today: typeof yesterday = [];
  const merged = resolveActiveShiftEntries(today as any, yesterday as any, 'diurno');
  assert.equal(merged.length, 0);
  assert.equal(needsEntryPunchToday(merged), true);
});

test('mergeShiftEntries ordena por timestamp', () => {
  const merged = mergeShiftEntries(
    [{ type: 'IN', timestamp: '2026-07-08T23:00:00.000Z' } as any],
    [{ type: 'OUT', timestamp: '2026-07-09T11:00:00.000Z' } as any],
  );
  assert.equal(merged[0].type, 'IN');
  assert.equal(merged[1].type, 'OUT');
});
