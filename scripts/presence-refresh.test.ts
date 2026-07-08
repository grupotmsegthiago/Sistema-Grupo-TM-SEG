import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registerSrc = fs.readFileSync('lib/timeclock/registerPunch.ts', 'utf8');
const trackerSrc = fs.readFileSync('components/UserPresenceTracker.tsx', 'utf8');
const channelSrc = fs.readFileSync('lib/presenceChannel.ts', 'utf8');

test('registerTimeClockPunch dispara refresh e realtime após registrar', () => {
  assert.match(registerSrc, /from '\.\.\/presenceChannel'/);
  assert.match(registerSrc, /requestPresenceRefresh\(\)/);
  assert.match(registerSrc, /dispatchTimeClockRealtime/);
  assert.match(registerSrc, /supabase:time_clock:realtime/);
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
