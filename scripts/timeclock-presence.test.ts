import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isCltOnDutyToday, getOnDutyStageLabel } from '../lib/timeclock/onDuty.ts';
import {
  parsePresenceState,
  getInitials,
  getPresenceCategory,
  getPresenceServiceStatus,
  buildPunchMarks,
  buildPresenceTooltip,
  mergeRosterWithPresence,
  PRESENCE_USER_AVATAR_SRC,
} from '../lib/timeclock/presence.ts';
import { getBrazilDayBounds } from '../lib/dateUtils.ts';

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

test('quadro de presença usa robô inline (SVG) em vez de iniciais ou <img> externo', () => {
  const boardSrc = fs.readFileSync('components/MissionTeamPresenceBoard.tsx', 'utf8');
  // Robô desenhado inline no próprio componente (não depende de arquivo externo
  // que aparecia quebrado no cache do navegador).
  assert.match(boardSrc, /const RobotAvatar/);
  assert.match(boardSrc, /<RobotAvatar \/>/);
  assert.doesNotMatch(boardSrc, /<img[\s\S]*src=\{PRESENCE_USER_AVATAR_SRC\}/);
  assert.doesNotMatch(boardSrc, /getInitials\(displayName\)/);
});

test('mergeRosterWithPresence mantém todos os cadastrados na tela (online + fora)', () => {
  const roster = [
    { userId: 'u1', name: 'Ana', role: 'Operador' },
    { userId: 'u2', name: 'Bruno', role: 'Comercial' },
    { userId: 'u3', name: 'Carla', role: 'Administrador' },
  ];
  const online = [
    {
      userId: 'u2',
      name: 'Bruno',
      role: 'Comercial',
      isClt: true,
      onDuty: true,
      onDutyLabel: 'Em serviço',
      onlineAt: new Date().toISOString(),
    },
  ];
  const merged = mergeRosterWithPresence(roster, online as any);
  // Todos os 3 usuários aparecem, mesmo os offline.
  assert.equal(merged.length, 3);
  const bruno = merged.find((u) => u.userId === 'u2')!;
  const ana = merged.find((u) => u.userId === 'u1')!;
  // Online mantém estado ao vivo; offline vira "Fora de Serviço".
  assert.equal(getPresenceServiceStatus(bruno), 'em_servico');
  assert.equal(getPresenceServiceStatus(ana), 'fora');
  assert.equal(ana.onDutyLabel, 'Fora de Serviço');
});

test('mergeRosterWithPresence inclui usuário online que ainda não está no roster', () => {
  const online = [
    {
      userId: 'novo',
      name: 'Novato',
      role: 'Operador',
      isClt: false,
      onDuty: false,
      onDutyLabel: 'Online',
      onlineAt: new Date().toISOString(),
    },
  ];
  const merged = mergeRosterWithPresence([], online as any);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].userId, 'novo');
});

test('getPresenceCategory agrupa por Operação, Administrativo e Comercial', () => {
  assert.equal(getPresenceCategory('Operador'), 'operacao');
  assert.equal(getPresenceCategory('avançado'), 'operacao');
  assert.equal(getPresenceCategory('Comercial'), 'comercial');
  assert.equal(getPresenceCategory('Diretoria'), 'administrativo');
  assert.equal(getPresenceCategory('Administrador'), 'administrativo');
});

test('getPresenceServiceStatus simplifica para 3 estados', () => {
  assert.equal(
    getPresenceServiceStatus({
      userId: '1',
      name: 'A',
      role: 'Operador',
      isClt: true,
      onDuty: true,
      onDutyLabel: 'Em serviço',
      onlineAt: '',
    }),
    'em_servico'
  );
  assert.equal(
    getPresenceServiceStatus({
      userId: '2',
      name: 'B',
      role: 'Operador',
      isClt: true,
      onDuty: false,
      onDutyLabel: 'Aguardando ponto',
      onlineAt: '',
    }),
    'fora'
  );
  assert.equal(
    getPresenceServiceStatus({
      userId: '3',
      name: 'C',
      role: 'Operador',
      isClt: true,
      onDuty: true,
      onDutyLabel: 'Em almoço',
      onlineAt: '',
    }),
    'em_almoco'
  );
});

test('buildPunchMarks e tooltip exibem marcações do dia', () => {
  const marks = buildPunchMarks([
    { type: 'IN', timestamp: '2026-07-08T10:30:00.000Z' },
    { type: 'BREAK_START', timestamp: '2026-07-08T13:00:00.000Z' },
  ]);
  assert.equal(marks.length, 2);
  assert.equal(marks[0].label, 'Entrada');
  const tooltip = buildPresenceTooltip({
    userId: 'u1',
    name: 'Michelle',
    role: 'Operador',
    isClt: true,
    onDuty: false,
    onDutyLabel: 'Aguardando ponto',
    onlineAt: '',
    punchMarks: marks,
  });
  assert.match(tooltip, /Marcações de hoje/);
  assert.match(tooltip, /Entrada:/);
});

test('getPresenceServiceStatus usa punchMarks quando onDutyLabel diverge', () => {
  assert.equal(
    getPresenceServiceStatus({
      userId: '4',
      name: 'Michelle',
      role: 'Operador',
      isClt: true,
      onDuty: false,
      onDutyLabel: 'Aguardando ponto',
      onlineAt: '',
      punchMarks: [{ type: 'IN', label: 'Entrada', time: '07:35' }],
    }),
    'em_servico'
  );
});

test('getBrazilDayBounds cobre dia civil de Brasília', () => {
  const { start, end } = getBrazilDayBounds('2026-07-08');
  assert.equal(start, '2026-07-08T03:00:00.000Z');
  assert.equal(end, '2026-07-09T02:59:59.999Z');
});

test('avatar de presença aponta para SVG existente', () => {
  assert.equal(PRESENCE_USER_AVATAR_SRC, '/assets/presence-user-robot.svg');
  assert.match(fs.readFileSync('public/assets/presence-user-robot.svg', 'utf8'), /<svg/i);
});
