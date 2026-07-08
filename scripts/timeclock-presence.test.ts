import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('getOnDutyStageLabel cobre todos os estados', () => {
  assert.equal(getOnDutyStageLabel([]), 'Aguardando ponto');
  assert.equal(getOnDutyStageLabel([{ type: 'IN' }]), 'Em serviço');
  assert.equal(getOnDutyStageLabel([{ type: 'IN' }, { type: 'BREAK_START' }]), 'Em almoço');
  assert.equal(
    getOnDutyStageLabel([{ type: 'IN' }, { type: 'BREAK_START' }, { type: 'BREAK_END' }]),
    'Em serviço'
  );
  assert.equal(
    getOnDutyStageLabel([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
      { type: 'OUT' },
    ]),
    'Fora do expediente'
  );
});

test('parsePresenceState deduplica usuários', () => {
  const users = parsePresenceState({
    u1: [{ userId: 'u1', name: 'Ana', role: 'Operador', isClt: true, onDuty: true, onDutyLabel: 'Em expediente', onlineAt: '' }],
    u2: [{ userId: 'u2', name: 'Bruno', role: 'RH', isClt: false, onDuty: false, onDutyLabel: 'Online', onlineAt: '' }],
  });
  assert.equal(users.length, 2);
  assert.equal(getInitials('Maria Silva'), 'MS');
});

test('parsePresenceState normaliza presença incompleta sem quebrar tela', () => {
  const users = parsePresenceState({
    u1: [{ userId: 'u1' }],
    lixo: [{}],
  });
  assert.equal(users.length, 1);
  assert.equal(users[0].name, 'Usuário');
  assert.equal(users[0].role, 'Online');
});

test('parsePresenceState preserva contractType do payload', () => {
  const users = parsePresenceState({
    u1: [{
      userId: 'u1',
      name: 'Ana CLT',
      role: 'Operador',
      contractType: 'CLT',
      isClt: true,
      onDuty: true,
      onDutyLabel: 'Em serviço',
      onlineAt: '',
    }],
    u2: [{
      userId: 'u2',
      name: 'Bruno PJ',
      role: 'Consultor',
      contractType: 'pj',
      isClt: false,
      onDuty: false,
      onDutyLabel: 'Online',
      onlineAt: '',
    }],
  });
  assert.equal(users.length, 2);
  const ana = users.find((u) => u.userId === 'u1')!;
  const bruno = users.find((u) => u.userId === 'u2')!;
  assert.equal(ana.contractType, 'CLT');
  // Normaliza para uppercase
  assert.equal(bruno.contractType, 'PJ');
  assert.equal(bruno.isClt, false);
});

test('quadro de presença usa ícone de robô em vez de iniciais', () => {
  const boardSrc = fs.readFileSync('components/MissionTeamPresenceBoard.tsx', 'utf8');
  assert.match(boardSrc, /PRESENCE_USER_AVATAR_SRC/);
  assert.match(boardSrc, /<img[\s\S]*src=\{PRESENCE_USER_AVATAR_SRC\}/);
  assert.doesNotMatch(boardSrc, /getInitials\(displayName\)/);
});
