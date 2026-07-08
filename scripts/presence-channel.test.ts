import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const singletonSrc = fs.readFileSync('lib/presenceChannel.ts', 'utf8');
const hookSrc = fs.readFileSync('lib/useOnlinePresence.ts', 'utf8');
const trackerSrc = fs.readFileSync('components/UserPresenceTracker.tsx', 'utf8');

test('hook usa o singleton (não cria canal próprio)', () => {
  assert.match(hookSrc, /from '\.\/presenceChannel'/);
  assert.doesNotMatch(hookSrc, /supabase\.channel\(/);
});

test('tracker usa o singleton (não cria canal próprio)', () => {
  assert.match(trackerSrc, /from '\.\.\/lib\/presenceChannel'/);
  assert.doesNotMatch(trackerSrc, /supabase\.channel\(/);
});

test('singleton usa BROADCAST (mais robusto que Presence)', () => {
  assert.match(singletonSrc, /'broadcast'/);
  assert.match(singletonSrc, /broadcast:\s*\{\s*self:\s*true\s*\}/);
  // Não deve mais depender do serviço de Presence do Supabase
  assert.doesNotMatch(singletonSrc, /'presence'/);
  assert.doesNotMatch(singletonSrc, /channel\.track\(/);
});

test('singleton registra listeners antes de subscribe', () => {
  const onIdx = singletonSrc.indexOf(".on('broadcast'");
  const subIdx = singletonSrc.indexOf('.subscribe(');
  assert.ok(onIdx >= 0, 'deve registrar listeners de broadcast');
  assert.ok(subIdx >= 0, 'deve chamar subscribe');
  assert.ok(onIdx < subIdx, 'listeners devem ser registrados antes do subscribe');
});

test('singleton exporta subscribePresence e trackPresence', () => {
  assert.match(singletonSrc, /export function subscribePresence\(/);
  assert.match(singletonSrc, /export function trackPresence\(/);
  assert.match(singletonSrc, /export function updatePresencePayload\(/);
  assert.match(singletonSrc, /export function requestPresenceRefresh\(/);
});

test('singleton tem cleanup periódico (heartbeat + stale)', () => {
  assert.match(singletonSrc, /BROADCAST_INTERVAL_MS/);
  assert.match(singletonSrc, /STALE_MS/);
  assert.match(singletonSrc, /cleanupTimer/);
});
