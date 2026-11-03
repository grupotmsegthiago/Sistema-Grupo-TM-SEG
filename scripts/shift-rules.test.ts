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

test('diurno libera entrada a qualquer horário (trava 07:30 removida)', () => {
  const early = new Date('2026-07-08T09:00:00.000Z'); // 06:00 BRT
  assert.equal(canPunchEntryNow('diurno', early).allowed, true);
  const ok = new Date('2026-07-08T11:00:00.000Z');
  assert.equal(canPunchEntryNow('diurno', ok).allowed, true);
});

test('noturno libera entrada a qualquer horário (trava de janela removida)', () => {
  const afternoon = new Date('2026-07-08T21:00:00.000Z'); // 18:00 BRT
  assert.equal(canPunchEntryNow('noturno', afternoon).allowed, true);
  const madrugada = new Date('2026-07-09T05:00:00.000Z');
  assert.equal(canPunchEntryNow('noturno', madrugada).allowed, true);
  const manha = new Date('2026-07-09T13:00:00.000Z'); // 10:00 BRT
  assert.equal(canPunchEntryNow('noturno', manha).allowed, true);
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
