import test from 'node:test';
import assert from 'node:assert/strict';
import { isCltOnDutyToday, getOnDutyStageLabel } from '../lib/timeclock/onDuty.ts';
import { parsePresenceState, getInitials } from '../lib/timeclock/presence.ts';

test('isCltOnDutyToday após entrada sem saída', () => {
  assert.equal(isCltOnDutyToday([{ type: 'IN' }]), true);
  assert.equal(isCltOnDutyToday([{ type: 'IN' }, { type: 'BREAK_START' }]), true);
  assert.equal(
    isCltOnDutyToday([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
      { type: 'OUT' },
    ]),
    false
  );
});

test('getOnDutyStageLabel', () => {
  assert.equal(getOnDutyStageLabel([{ type: 'IN' }]), 'Em expediente');
  assert.equal(getOnDutyStageLabel([{ type: 'IN' }, { type: 'BREAK_START' }]), 'Em almoço');
});

test('parsePresenceState deduplica usuários', () => {
  const users = parsePresenceState({
    u1: [{ userId: 'u1', name: 'Ana', role: 'Operador', isClt: true, onDuty: true, onDutyLabel: 'Em expediente', onlineAt: '' }],
    u2: [{ userId: 'u2', name: 'Bruno', role: 'RH', isClt: false, onDuty: false, onDutyLabel: 'Online', onlineAt: '' }],
  });
  assert.equal(users.length, 2);
  assert.equal(getInitials('Maria Silva'), 'MS');
});
