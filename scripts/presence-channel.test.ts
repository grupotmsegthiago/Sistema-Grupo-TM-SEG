import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const singletonSrc = fs.readFileSync('lib/presenceChannel.ts', 'utf8');
const hookSrc = fs.readFileSync('lib/useOnlinePresence.ts', 'utf8');
const trackerSrc = fs.readFileSync('components/UserPresenceTracker.tsx', 'utf8');

test('hook usa o singleton (não cria canal próprio)', () => {
  assert.match(hookSrc, /from '\.\/presenceChannel'/);
  assert.doesNotMatch(hookSrc, /supabase\.channel\(/);
  assert.doesNotMatch(hookSrc, /channel\.on\('presence'/);
});

test('tracker usa o singleton (não cria canal próprio)', () => {
  assert.match(trackerSrc, /from '\.\.\/lib\/presenceChannel'/);
  assert.doesNotMatch(trackerSrc, /supabase\.channel\(/);
  assert.doesNotMatch(trackerSrc, /channel\.on\('presence'/);
});

test('singleton registra listeners antes de subscribe', () => {
  const onIdx = singletonSrc.indexOf("channel.on('presence'");
  const subIdx = singletonSrc.indexOf('channel.subscribe(');
  assert.ok(onIdx >= 0, 'deve registrar listeners de presence');
  assert.ok(subIdx >= 0, 'deve chamar subscribe');
  assert.ok(onIdx < subIdx, 'listeners devem ser registrados antes do subscribe');
});

test('singleton exporta subscribePresence e trackPresence', () => {
  assert.match(singletonSrc, /export function subscribePresence\(/);
  assert.match(singletonSrc, /export function trackPresence\(/);
  assert.match(singletonSrc, /export function updatePresencePayload\(/);
});
