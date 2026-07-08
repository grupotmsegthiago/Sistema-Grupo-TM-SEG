import test from 'node:test';
import assert from 'node:assert/strict';
import { canPunchEntryNow, normalizeShiftType } from '../lib/timeclock/shiftRules.ts';
import {
  employeeRequiresTimeclock,
  isDiretoriaRole,
  requiresTimeclockUser,
} from '../lib/timeclock/eligibility.ts';
import { getActivityStatus } from '../lib/userActivityTracker.ts';

test('normalizeShiftType default diurno', () => {
  assert.equal(normalizeShiftType(''), 'diurno');
  assert.equal(normalizeShiftType('noturno'), 'noturno');
});

test('diurno bloqueia entrada antes das 07:30 BRT', () => {
  const early = new Date('2026-07-08T09:00:00.000Z');
  const r = canPunchEntryNow('diurno', early);
  assert.equal(r.allowed, false);
  assert.match(r.message || '', /07:30/);
});

test('diurno libera após 07:30 BRT', () => {
  const ok = new Date('2026-07-08T11:00:00.000Z');
  assert.equal(canPunchEntryNow('diurno', ok).allowed, true);
});

test('noturno bloqueia antes das 19:30', () => {
  const afternoon = new Date('2026-07-08T21:00:00.000Z');
  const r = canPunchEntryNow('noturno', afternoon);
  assert.equal(r.allowed, false);
});

test('diretoria não exige ponto', () => {
  assert.equal(isDiretoriaRole('diretoria'), true);
  assert.equal(
    requiresTimeclockUser({ id: '1', name: 'Thiago', role: 'diretoria', isClt: true }),
    false,
  );
});

test('CLT elegível exige ponto', () => {
  assert.equal(
    employeeRequiresTimeclock({ contract_type: 'CLT', status: 'Ativo' }),
    true,
  );
});

test('PJ só exige com flag', () => {
  assert.equal(employeeRequiresTimeclock({ contract_type: 'PJ', status: 'Ativo' }), false);
  assert.equal(
    employeeRequiresTimeclock({ contract_type: 'PJ', status: 'Ativo', requires_timeclock: true }),
    true,
  );
});

test('getActivityStatus idle após 10 min', () => {
  if (typeof localStorage === 'undefined') return;
  const old = new Date(Date.now() - 11 * 60_000).toISOString();
  localStorage.setItem('tmseg:last-activity-at', old);
  assert.equal(getActivityStatus(), 'idle');
});
