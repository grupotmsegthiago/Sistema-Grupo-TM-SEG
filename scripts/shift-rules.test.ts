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

test('noturno libera durante plantão após meia-noite (até 08:00 BRT)', () => {
  // 2026-07-09T05:00:00Z = 02:00 BRT
  const madrugada = new Date('2026-07-09T05:00:00.000Z');
  assert.equal(canPunchEntryNow('noturno', madrugada).allowed, true);
});

test('noturno bloqueia entre 08:00 e 19:30 BRT', () => {
  // 2026-07-09T14:00:00Z = 11:00 BRT
  const manha = new Date('2026-07-09T14:00:00.000Z');
  const r = canPunchEntryNow('noturno', manha);
  assert.equal(r.allowed, false);
  assert.match(r.message || '', /19:30/);
});

test('diretoria não exige ponto', () => {
  assert.equal(isDiretoriaRole('diretoria'), true);
  assert.equal(
    requiresTimeclockUser({ id: '1', name: 'Thiago', role: 'diretoria', isClt: true }),
    false,
  );
});

test('Daniel (auditor) isento de ponto no login', async () => {
  const { requiresTimeclockUser, isTimeclockExemptUser } = await import('../lib/timeclock/eligibility.ts');
  const daniel = {
    id: '6',
    name: 'DANIEL LIMA',
    email: 'daniel@grupotmseg.com.br',
    requiresTimeclock: true,
    isClt: false,
    role: 'Operador',
  };
  assert.equal(isTimeclockExemptUser(daniel), true);
  assert.equal(requiresTimeclockUser(daniel), false);
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
