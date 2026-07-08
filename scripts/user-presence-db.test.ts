import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizePresenceUserId } from '../lib/timeclock/presence.ts';
import { mergePresenceSources } from '../lib/userPresenceDb.ts';

const dbSrc = fs.readFileSync('lib/userPresenceDb.ts', 'utf8');
const hookSrc = fs.readFileSync('lib/useOnlinePresence.ts', 'utf8');
const trackerSrc = fs.readFileSync('components/UserPresenceTracker.tsx', 'utf8');
const migrationSrc = fs.readFileSync('migrations/2026_07_08_user_presence.sql', 'utf8');

test('migration cria tabela user_presence com RLS e realtime', () => {
  assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS public\.user_presence/);
  assert.match(migrationSrc, /last_seen TIMESTAMPTZ/);
  assert.match(migrationSrc, /Allow all for user_presence/);
  assert.match(migrationSrc, /supabase_realtime ADD TABLE public\.user_presence/);
});

test('userPresenceDb exporta upsert, fetch e subscribe', () => {
  assert.match(dbSrc, /export async function upsertUserPresenceDb/);
  assert.match(dbSrc, /export async function fetchOnlineUsersFromDb/);
  assert.match(dbSrc, /export function subscribeUserPresenceDb/);
  assert.match(dbSrc, /export function mergePresenceSources/);
  assert.match(dbSrc, /PRESENCE_DB_STALE_MS/);
});

test('useOnlinePresence mescla banco + broadcast (banco prevalece)', () => {
  assert.match(hookSrc, /subscribeUserPresenceDb/);
  assert.match(hookSrc, /subscribePresence/);
  assert.match(hookSrc, /mergePresenceSources/);
});

test('TimeClockGate grava heartbeat de presença para CLT', () => {
  const gateSrc = fs.readFileSync('components/TimeClockGate.tsx', 'utf8');
  assert.match(gateSrc, /upsertUserPresenceDb/);
  assert.match(gateSrc, /buildPresenceHeartbeatFromUser/);
  assert.match(gateSrc, /requestPresenceRefresh/);
});

test('UserPresenceTracker grava heartbeat no banco', () => {
  assert.match(trackerSrc, /upsertUserPresenceDb/);
  assert.match(trackerSrc, /removeUserPresenceDb/);
  assert.match(trackerSrc, /buildPresenceHeartbeatFromUser/);
  assert.match(trackerSrc, /refreshDbHeartbeat/);
});

test('mergePresenceSources: banco prevalece sobre broadcast no mesmo userId', () => {
  const broadcast = [
    {
      userId: '4',
      name: 'Michelle',
      role: 'Operador',
      isClt: true,
      onDuty: false,
      onDutyLabel: 'Aguardando ponto',
      onlineAt: '2026-07-08T10:00:00.000Z',
    },
  ];
  const db = [
    {
      userId: '4',
      name: 'Michelle',
      role: 'Operador',
      isClt: true,
      onDuty: true,
      onDutyLabel: 'Em serviço',
      onlineAt: '2026-07-08T11:00:00.000Z',
      minutesOnDuty: 45,
    },
  ];
  const merged = mergePresenceSources(db as any, broadcast as any);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].onDuty, true);
  assert.equal(merged[0].onDutyLabel, 'Em serviço');
});

test('mergePresenceSources une usuários distintos de ambas as fontes', () => {
  const broadcast = [
    {
      userId: '5',
      name: 'Beatriz',
      role: 'Operador',
      isClt: true,
      onDuty: false,
      onDutyLabel: 'Online',
      onlineAt: new Date().toISOString(),
    },
  ];
  const db = [
    {
      userId: '7',
      name: 'Thiago',
      role: 'Diretoria',
      isClt: false,
      onDuty: false,
      onDutyLabel: 'Online',
      onlineAt: new Date().toISOString(),
    },
  ];
  const merged = mergePresenceSources(db as any, broadcast as any);
  assert.equal(merged.length, 2);
  const ids = new Set(merged.map((u) => normalizePresenceUserId(u.userId)));
  assert.ok(ids.has('5'));
  assert.ok(ids.has('7'));
});
