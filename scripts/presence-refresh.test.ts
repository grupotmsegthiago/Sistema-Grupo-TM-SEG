import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registerSrc = fs.readFileSync('lib/timeclock/registerPunch.ts', 'utf8');
const trackerSrc = fs.readFileSync('components/UserPresenceTracker.tsx', 'utf8');
const channelSrc = fs.readFileSync('lib/presenceChannel.ts', 'utf8');

test('registerTimeClockPunch dispara requestPresenceRefresh após inserir', () => {
  assert.match(registerSrc, /from '\.\.\/presenceChannel'/);
  assert.match(registerSrc, /requestPresenceRefresh\(\)/);
  const insertIdx = registerSrc.indexOf('.insert([payload])');
  const refreshIdx = registerSrc.indexOf('requestPresenceRefresh()');
  assert.ok(insertIdx >= 0, 'deve chamar insert');
  assert.ok(refreshIdx > insertIdx, 'refresh deve ocorrer depois do insert');
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
