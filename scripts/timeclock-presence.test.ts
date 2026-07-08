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
  enrichPresenceWithPunchMarks,
  sortPresenceBoardUsers,
  buildPresenceHeartbeatFromUser,
  formatPresenceShortName,
  formatPresenceDurationMinutes,
  normalizePresenceUserId,
  PRESENCE_USER_AVATAR_SRC,
} from '../lib/timeclock/presence.ts';
import {
  buildTeamPunchLookup,
  dedupeTeamRoster,
  groupTodayEntriesByUser,
} from '../lib/timeclock/teamPunchBoard.ts';
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

test('dedupeTeamRoster remove duplicata por userId e por nome', () => {
  const roster = dedupeTeamRoster([
    { userId: '5', name: 'Michelle Cristiane', role: 'Operador' },
    { userId: '5', name: 'Michelle Cristiane', role: 'Operador' },
    { userId: '99', name: 'Michelle Cristiane', role: 'RH' },
    { userId: '7', name: 'Bruno', role: 'Comercial' },
  ]);
  assert.equal(roster.length, 2);
  assert.equal(roster[0].userId, '5');
  assert.equal(roster[1].userId, '7');
});

test('groupTodayEntriesByUser agrupa batidas sem duplicar cards', () => {
  const map = groupTodayEntriesByUser([
    { user_id: '5', type: 'IN', timestamp: '2026-07-08T10:00:00.000Z' },
    { user_id: '5', type: 'BREAK_START', timestamp: '2026-07-08T13:00:00.000Z' },
    { user_id: '7', type: 'IN', timestamp: '2026-07-08T09:00:00.000Z' },
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get('5')?.length, 2);
  assert.equal(map.get('5')?.[0].type, 'IN');
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

test('getPresenceServiceStatus distingue online sem ponto de fora offline', () => {
  const awaiting = {
    userId: 'u1',
    name: 'Michelle',
    role: 'Operador',
    isClt: true,
    onDuty: false,
    onDutyLabel: 'Aguardando ponto',
    onlineAt: '',
  };
  assert.equal(getPresenceServiceStatus(awaiting, { isOnline: true }), 'aguardando_ponto');
  assert.equal(getPresenceServiceStatus(awaiting, { isOnline: false }), 'aguardando_ponto');
  assert.equal(
    getPresenceServiceStatus(
      {
        userId: 'u2',
        name: 'Thiago',
        role: 'Diretoria',
        isClt: false,
        onDuty: false,
        onDutyLabel: 'Online',
        onlineAt: '',
      },
      { isOnline: true },
    ),
    'online',
  );
});

test('sortPresenceBoardUsers agrupa online à esquerda', () => {
  const users = [
    { userId: '1', name: 'Zara', role: 'Operador', isClt: true, onDuty: false, onDutyLabel: 'Fora', onlineAt: '' },
    { userId: '2', name: 'Ana', role: 'Operador', isClt: true, onDuty: true, onDutyLabel: 'Em serviço', onlineAt: '' },
    { userId: '3', name: 'Bruno', role: 'Diretoria', isClt: false, onDuty: false, onDutyLabel: 'Online', onlineAt: '' },
  ] as any[];
  const onlineIds = new Set(['2', '3']);
  const sorted = sortPresenceBoardUsers(users, onlineIds);
  assert.deepEqual(sorted.map((u) => u.userId), ['2', '3', '1']);
});

test('enrichPresenceWithPunchMarks corrige aguardando ponto quando há IN', () => {
  const enriched = enrichPresenceWithPunchMarks({
    userId: '5',
    name: 'Beatriz',
    role: 'Operador',
    isClt: true,
    onDuty: false,
    onDutyLabel: 'Aguardando ponto',
    onlineAt: '',
    punchMarks: [{ type: 'IN', label: 'Entrada', time: '07:35' }],
  });
  assert.equal(enriched.onDuty, true);
  assert.equal(enriched.onDutyLabel, 'Em serviço');
  assert.equal(getPresenceServiceStatus(enriched, { isOnline: true }), 'em_servico');
});

test('mergeRosterWithPresence usa punchMarks do heartbeat quando lookup vazio', () => {
  const roster = [{ userId: '5', name: 'Beatriz de Carvalho Simões', role: 'Operador' }];
  const online = [
    {
      userId: '5',
      name: 'Beatriz de Carvalho Simões',
      role: 'Operador',
      isClt: true,
      onDuty: false,
      onDutyLabel: 'Aguardando ponto',
      onlineAt: new Date().toISOString(),
      punchMarks: [{ type: 'IN', label: 'Entrada', time: '07:35' }],
    },
  ];
  const merged = mergeRosterWithPresence(roster, online as any);
  assert.equal(getPresenceServiceStatus(merged[0], { isOnline: true }), 'em_servico');
  assert.equal(merged[0].onDutyLabel, 'Em serviço');
});

test('formatPresenceDurationMinutes exibe horas e minutos', () => {
  assert.equal(formatPresenceDurationMinutes(45), '45 min');
  assert.equal(formatPresenceDurationMinutes(60), '1h');
  assert.equal(formatPresenceDurationMinutes(323), '5h 23min');
  assert.equal(formatPresenceDurationMinutes(323, { compact: true }), '5h 23m');
});

test('buildPresenceHeartbeatFromUser marca operador CLT como aguardando ponto', () => {
  const payload = buildPresenceHeartbeatFromUser({
    id: 4,
    name: 'michelle dias',
    role: 'AVANÇADO',
  } as any);
  assert.equal(payload.isClt, true);
  assert.equal(payload.onDutyLabel, 'Aguardando ponto');
  assert.equal(normalizePresenceUserId(payload.userId), '4');
});

test('buildPresenceHeartbeatFromUser reflete ponto IN como em serviço', () => {
  const payload = buildPresenceHeartbeatFromUser(
    { id: '5', name: 'Beatriz', role: 'Operador' } as any,
    [{ type: 'IN', timestamp: '2026-07-08T10:30:00.000Z' }],
  );
  assert.equal(getPresenceServiceStatus(payload), 'em_servico');
  assert.equal(payload.onDuty, true);
});

test('normalizePresenceUserId unifica number e string do login', () => {
  assert.equal(normalizePresenceUserId(4), '4');
  assert.equal(normalizePresenceUserId('4'), '4');
  assert.equal(normalizePresenceUserId(' 22 '), '22');
  assert.equal(normalizePresenceUserId(null), '');
});

test('mergeRosterWithPresence casa online com userId numérico no broadcast', () => {
  const roster = [{ userId: '4', name: 'Michelle dias', role: 'Operador' }];
  const online = [
    {
      userId: 4,
      name: 'Michelle dias',
      role: 'Operador',
      isClt: true,
      onDuty: false,
      onDutyLabel: 'Aguardando ponto',
      onlineAt: new Date().toISOString(),
    },
  ];
  const merged = mergeRosterWithPresence(roster, online as any);
  assert.equal(merged.length, 1);
  assert.equal(getPresenceServiceStatus(merged[0], { isOnline: true }), 'aguardando_ponto');
});

test('formatPresenceShortName diferencia homônimos', () => {
  assert.equal(formatPresenceShortName('Beatriz de Carvalho Simões'), 'Beatriz S.');
  assert.equal(formatPresenceShortName('BEATRIZ ROCHA'), 'BEATRIZ R.');
  assert.equal(formatPresenceShortName('Thiago'), 'Thiago');
});

test('mergeRosterWithPresence não adiciona usuário online fora do roster fixo', () => {
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
  assert.equal(merged.length, 0);
});

test('mergeRosterWithPresence usa ponto do banco para offline (Michelle)', () => {
  const roster = [{ userId: '5', name: 'Michelle Cristiane', role: 'Operador' }];
  const punchLookup = buildTeamPunchLookup([
    {
      user_id: '5',
      user_name: 'Michelle Cristiane',
      type: 'IN',
      timestamp: '2026-07-08T10:30:00.000Z',
    },
  ]);
  const merged = mergeRosterWithPresence(roster, [], punchLookup);
  assert.equal(merged.length, 1);
  assert.equal(getPresenceServiceStatus(merged[0]), 'em_servico');
  assert.match(merged[0].onDutyLabel || '', /serviço|servico/i);
});

test('mergeRosterWithPresence resolve ponto por nome quando user_id diverge', () => {
  const roster = [{ userId: '5', name: 'Michelle Cristiane Monteiro', role: 'Operador' }];
  const punchLookup = buildTeamPunchLookup([
    {
      user_id: 'legado-uuid',
      user_name: 'Michelle Cristiane Monteiro',
      type: 'IN',
      timestamp: '2026-07-08T08:00:00.000Z',
    },
  ]);
  const merged = mergeRosterWithPresence(roster, [], punchLookup);
  assert.equal(merged.length, 1);
  assert.equal(getPresenceServiceStatus(merged[0]), 'em_servico');
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
    'aguardando_ponto'
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
