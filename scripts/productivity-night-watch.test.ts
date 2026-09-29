import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brasiliaLocalToUtc,
  dinnerBreakLabel,
  getCurrentBrasiliaDayBounds,
  getEveningNightSliceBounds,
  getNightWatchWindowBounds,
  getPreviousBrasiliaDayBounds,
  isDinnerBreakWindow,
  isNightWatchActive,
  isNightWatchExemptRole,
  isNightWatchWindow,
  keywordMatches,
  normalizeKeywordInput,
  pickNightWatchKeyword,
} from '../lib/productivity/nightWatch.ts';
import { aggregateProductivityLogs } from '../lib/productivity/aggregateProductivity.ts';
import {
  isIdleLogoutDue,
  SESSION_IDLE_LOGOUT_MINUTES,
  SESSION_IDLE_LOGOUT_MS,
  shouldEnforceSessionIdleLogout,
  getIdleLogoutThresholdMs,
  getIdleLogoutThresholdMinutes,
} from '../lib/productivity/sessionIdleLogout.ts';
import {
  NIGHT_FORCE_LOGOUT_MINUTES,
  NIGHT_FORCE_LOGOUT_MS,
  NIGHT_HEARTBEAT_INTERVAL_MINUTES,
  NIGHT_HEARTBEAT_INTERVAL_MS,
  NIGHT_IDLE_MINUTES,
  NIGHT_STALE_ALERT_MINUTES,
} from '../lib/productivity/nightWatch.ts';

test('isNightWatchWindow: 20h–08h BRT', () => {
  // 20:00 BRT = 23:00 UTC
  assert.equal(isNightWatchWindow(new Date('2026-08-05T23:00:00.000Z')), true);
  // 07:59 BRT = 10:59 UTC
  assert.equal(isNightWatchWindow(new Date('2026-08-06T10:59:00.000Z')), true);
  // 08:00 BRT = 11:00 UTC → fora
  assert.equal(isNightWatchWindow(new Date('2026-08-06T11:00:00.000Z')), false);
  // 15:00 BRT = 18:00 UTC → fora
  assert.equal(isNightWatchWindow(new Date('2026-08-06T18:00:00.000Z')), false);
  // 19:59 BRT = 22:59 UTC → fora
  assert.equal(isNightWatchWindow(new Date('2026-08-05T22:59:00.000Z')), false);
});

test('diretoria/ceo isentos; admin e operador entram na vigia', () => {
  assert.equal(isNightWatchExemptRole('Diretoria'), true);
  assert.equal(isNightWatchExemptRole('ceo'), true);
  assert.equal(isNightWatchExemptRole('administrador'), false);
  assert.equal(isNightWatchExemptRole('admin'), false);
  assert.equal(isNightWatchExemptRole('Operador'), false);
  assert.equal(isNightWatchExemptRole('Avançado'), false);
});

test('horário de janta 00:00–01:00 BRT não contabiliza na vigia', () => {
  assert.equal(dinnerBreakLabel(), '00:00–01:00');
  // 00:30 BRT = 03:30 UTC
  const janta = new Date('2026-08-06T03:30:00.000Z');
  assert.equal(isDinnerBreakWindow(janta), true);
  assert.equal(isNightWatchWindow(janta), true);
  assert.equal(isNightWatchActive(janta), false);
  // 00:00 BRT = 03:00 UTC → início da janta
  assert.equal(isDinnerBreakWindow(new Date('2026-08-06T03:00:00.000Z')), true);
  // 01:00 BRT = 04:00 UTC → fim (já fora)
  assert.equal(isDinnerBreakWindow(new Date('2026-08-06T04:00:00.000Z')), false);
  assert.equal(isNightWatchActive(new Date('2026-08-06T04:00:00.000Z')), true);
  // 23:30 BRT = 02:30 UTC → ainda não é janta
  assert.equal(isDinnerBreakWindow(new Date('2026-08-06T02:30:00.000Z')), false);
  assert.equal(isNightWatchActive(new Date('2026-08-06T02:30:00.000Z')), true);
});

test('palavra-chave case-insensitive e sem acento', () => {
  assert.equal(keywordMatches('PRESENTE', 'presente'), true);
  assert.equal(keywordMatches('ATENCAO', 'atenção'), true);
  assert.equal(keywordMatches('OPERACAO', 'errada'), false);
  assert.equal(normalizeKeywordInput('  vigilante '), 'VIGILANTE');
});

test('pickNightWatchKeyword retorna palavra da lista', () => {
  const w = pickNightWatchKeyword(0);
  assert.equal(typeof w, 'string');
  assert.ok(w.length >= 4);
});

test('janela noturna 20h→08h tem 12h', () => {
  // 06/08 09:00 BRT = 12:00 UTC
  const b = getNightWatchWindowBounds(new Date('2026-08-06T12:00:00.000Z'));
  const start = new Date(b.startIso).getTime();
  const end = new Date(b.endIso).getTime();
  assert.equal((end - start) / 3600_000, 12);
  // Fim = 06/08 08:00 BRT
  assert.equal(brasiliaLocalToUtc('2026-08-06T08:00:00').toISOString(), b.endIso);
});

test('dia civil anterior para relatório 09h', () => {
  // 06/08 09:00 BRT → dia anterior 05/08
  const d = getPreviousBrasiliaDayBounds(new Date('2026-08-06T12:00:00.000Z'));
  assert.equal(d.dateLabel, '05/08/2026');
});

test('dia civil atual para relatório 21h (parcial)', () => {
  // 06/08 21:00 BRT = 07/08 00:00 UTC
  const d = getCurrentBrasiliaDayBounds(new Date('2026-08-07T00:00:00.000Z'));
  assert.equal(d.dateLabel, '06/08/2026');
  assert.equal(d.endIso, '2026-08-07T00:00:00.000Z');
  // início = 06/08 00:00 BRT
  assert.equal(brasiliaLocalToUtc('2026-08-06T00:00:00').toISOString(), d.startIso);
});

test('fatia noturna do relatório 21h só após 20h', () => {
  // 06/08 15:00 BRT = 18:00 UTC → ainda sem noite
  const before = getEveningNightSliceBounds(new Date('2026-08-06T18:00:00.000Z'));
  assert.equal(before.startIso, before.endIso);
  // 06/08 21:00 BRT = 00:00 UTC do dia 7
  const after = getEveningNightSliceBounds(new Date('2026-08-07T00:00:00.000Z'));
  assert.equal(brasiliaLocalToUtc('2026-08-06T20:00:00').toISOString(), after.startIso);
  assert.ok(after.endIso > after.startIso);
});

test('logout por idle: 30 min diurno / 20 min noturno e isenção só diretoria/CEO', () => {
  assert.equal(SESSION_IDLE_LOGOUT_MINUTES, 30);
  assert.equal(SESSION_IDLE_LOGOUT_MS, 30 * 60 * 1000);
  assert.equal(NIGHT_IDLE_MINUTES, 10);
  assert.equal(NIGHT_FORCE_LOGOUT_MINUTES, 20);
  assert.equal(NIGHT_FORCE_LOGOUT_MS, 20 * 60 * 1000);
  assert.equal(NIGHT_HEARTBEAT_INTERVAL_MINUTES, 2);
  assert.equal(NIGHT_HEARTBEAT_INTERVAL_MS, 2 * 60 * 1000);
  assert.equal(NIGHT_STALE_ALERT_MINUTES, 80);
  assert.equal(shouldEnforceSessionIdleLogout('funcionario'), true);
  assert.equal(shouldEnforceSessionIdleLogout('Operador'), true);
  assert.equal(shouldEnforceSessionIdleLogout('admin'), true);
  assert.equal(shouldEnforceSessionIdleLogout('administrador'), true);
  assert.equal(shouldEnforceSessionIdleLogout('Diretoria'), false);
  assert.equal(shouldEnforceSessionIdleLogout('ceo'), false);
  // 15:00 BRT = 18:00 UTC → diurno 30 min
  const day = new Date('2026-08-06T18:00:00.000Z');
  assert.equal(getIdleLogoutThresholdMinutes(day), 30);
  assert.equal(getIdleLogoutThresholdMs(day), SESSION_IDLE_LOGOUT_MS);
  assert.equal(isIdleLogoutDue(29 * 60 * 1000, day), false);
  assert.equal(isIdleLogoutDue(30 * 60 * 1000, day), true);
  // 22:00 BRT = 01:00 UTC → noturno 20 min
  const night = new Date('2026-08-07T01:00:00.000Z');
  assert.equal(getIdleLogoutThresholdMinutes(night), 20);
  assert.equal(isIdleLogoutDue(19 * 60 * 1000, night), false);
  assert.equal(isIdleLogoutDue(20 * 60 * 1000, night), true);
});

test('aggregateProductivityLogs resume desafios e tempo ativo', () => {
  const dayLogs = [
    {
      created_at: '2026-08-05T12:00:00.000Z',
      user_name: 'Moacir Juvencio',
      action_type: 'LOGIN',
      entity: 'Auth',
      entity_id: '19',
      details: null,
    },
    {
      created_at: '2026-08-05T12:10:00.000Z',
      user_name: 'Moacir Juvencio',
      action_type: 'MISSION_UPDATE',
      entity: 'Mission',
      entity_id: 'GTM-1',
      details: '{}',
    },
    {
      created_at: '2026-08-05T12:15:00.000Z',
      user_name: 'Moacir Juvencio',
      action_type: 'PRODUCTIVITY_STATS',
      entity: 'Productivity',
      entity_id: '19',
      details: JSON.stringify({ interactions: 42, clicks: 30 }),
    },
    {
      created_at: '2026-08-05T23:30:00.000Z',
      user_name: 'DANIEL LIMA',
      action_type: 'IDLE_CHALLENGE_SHOWN',
      entity: 'Productivity',
      entity_id: '6',
      details: '{}',
    },
    {
      created_at: '2026-08-05T23:31:00.000Z',
      user_name: 'DANIEL LIMA',
      action_type: 'IDLE_CHALLENGE_TIMEOUT',
      entity: 'Productivity',
      entity_id: '6',
      details: '{}',
    },
  ];
  const nightLogs = [
    {
      created_at: '2026-08-05T23:30:00.000Z',
      user_name: 'DANIEL LIMA',
      action_type: 'IDLE_CHALLENGE_SHOWN',
      entity: 'Productivity',
      entity_id: '6',
      details: '{}',
    },
    {
      created_at: '2026-08-05T23:31:00.000Z',
      user_name: 'DANIEL LIMA',
      action_type: 'IDLE_CHALLENGE_TIMEOUT',
      entity: 'Productivity',
      entity_id: '6',
      details: '{}',
    },
  ];
  const rows = aggregateProductivityLogs(dayLogs, nightLogs);
  const moacir = rows.find((r) => r.userName === 'Moacir Juvencio');
  const daniel = rows.find((r) => r.userName === 'DANIEL LIMA');
  assert.ok(moacir);
  assert.ok(daniel);
  assert.equal(moacir!.logins, 1);
  assert.equal(moacir!.updates, 1);
  assert.equal(moacir!.interactions, 42);
  assert.equal(moacir!.clicks, 30);
  assert.equal(moacir!.activeMinutesDay, 15);
  assert.equal(daniel!.challengesShown, 1); // sem duplicar dia+noite
  assert.equal(daniel!.challengesTimeout, 1);
});
