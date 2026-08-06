import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brasiliaLocalToUtc,
  getNightWatchWindowBounds,
  getPreviousBrasiliaDayBounds,
  isNightWatchExemptRole,
  isNightWatchWindow,
  keywordMatches,
  normalizeKeywordInput,
  pickNightWatchKeyword,
} from '../lib/productivity/nightWatch.ts';
import { aggregateProductivityLogs } from '../lib/productivity/aggregateProductivity.ts';

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

test('diretoria/admin isentos; operador não', () => {
  assert.equal(isNightWatchExemptRole('Diretoria'), true);
  assert.equal(isNightWatchExemptRole('administrador'), true);
  assert.equal(isNightWatchExemptRole('Operador'), false);
  assert.equal(isNightWatchExemptRole('Avançado'), false);
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
