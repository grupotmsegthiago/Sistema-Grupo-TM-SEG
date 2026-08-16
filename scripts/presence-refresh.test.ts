import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registerSrc = fs.readFileSync('lib/timeclock/registerPunch.ts', 'utf8');
const trackerSrc = fs.readFileSync('components/UserPresenceTracker.tsx', 'utf8');
const channelSrc = fs.readFileSync('lib/presenceChannel.ts', 'utf8');

test('registerTimeClockPunch dispara requestPresenceRefresh após punch (API primária ou fallback)', () => {
  assert.match(registerSrc, /from '\.\.\/presenceChannel'/);
  assert.match(registerSrc, /registerTimeClockPunchViaApi/);
  assert.match(registerSrc, /requestPresenceRefresh\(\)/);
  // Caminho principal: API server-side, depois refresh (sem insert direto no client).
  const apiBlock = registerSrc.slice(
    registerSrc.indexOf('registerTimeClockPunchViaApi'),
    registerSrc.indexOf('fallback Supabase'),
  );
  assert.match(apiBlock, /requestPresenceRefresh\(\)/);
  // Fallback legado: insert Supabase, depois refresh.
  const fallbackBlock = registerSrc.slice(registerSrc.indexOf('fallback Supabase'));
  const insertIdx = fallbackBlock.indexOf('.insert([payload])');
  const refreshIdx = fallbackBlock.indexOf('requestPresenceRefresh()');
  assert.ok(insertIdx >= 0, 'fallback deve manter insert');
  assert.ok(refreshIdx > insertIdx, 'no fallback refresh deve ocorrer depois do insert');
});

test('UserPresenceTracker escuta refresh externo (heartbeat imediato)', () => {
  assert.match(trackerSrc, /onPresenceRefreshRequested\(/);
  assert.match(trackerSrc, /unsubscribeRefresh\(\)/);
});

test('presenceChannel expõe API de refresh externo', () => {
  assert.match(channelSrc, /export function requestPresenceRefresh\(/);
  assert.match(channelSrc, /export function onPresenceRefreshRequested\(/);
  assert.match(channelSrc, /new EventTarget\(\)/);
});
