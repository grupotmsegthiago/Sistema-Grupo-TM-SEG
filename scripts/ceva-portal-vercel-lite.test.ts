import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('vercel.json desvia ceva-portal do Express catch-all', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const sources = (vercel.rewrites || []).map((r: { source: string; destination: string }) => r);
  const ceva = sources.filter((r: { source: string }) => r.source.includes('ceva-portal'));
  assert.ok(ceva.length >= 10, `esperava rewrites ceva-portal, veio ${ceva.length}`);
  for (const rule of ceva) {
    assert.match(rule.destination, /\/api\/ceva-portal/, rule.source);
  }
  const catchAll = sources.find((r: { destination: string }) => r.destination === '/api/index');
  assert.ok(catchAll, 'catch-all api/index permanece');
  const liveIdx = sources.findIndex((r: { source: string }) => r.source === '/api/live-track');
  const firstCeva = sources.findIndex((r: { source: string }) => r.source.includes('ceva-portal'));
  const catchIdx = sources.findIndex((r: { destination: string }) => r.destination === '/api/index');
  assert.ok(firstCeva > liveIdx && firstCeva < catchIdx, 'rewrites ceva ficam antes do catch-all');
  assert.equal(Object.keys(vercel.functions || {}).length, 50, 'não pode passar de 50 functions');
  assert.equal('api/ceva-portal.ts' in (vercel.functions || {}), false, 'ceva-portal sem entry em functions');
});

test('handler leve não importa Express nem financialUtils', () => {
  const api = readFileSync(join(root, 'api/ceva-portal.ts'), 'utf8');
  const http = readFileSync(join(root, 'lib/cevaPortal/httpHandler.ts'), 'utf8');
  assert.match(api, /handleCevaPortalHttp/);
  assert.doesNotMatch(api, /from ['"]express['"]|vercelApp|server\/cevaPortal/);
  assert.doesNotMatch(http, /from ['"]express['"]|from ['"].*financialUtils|from ['"].*emailService/);
  assert.match(http, /export async function handleCevaPortalHttp/);
  assert.match(http, /op === 'login'/);
  assert.match(http, /op === 'acesso'/);
});

test('AcessoCeva tem timeout para não ficar eternamente em Aguarde', () => {
  const src = readFileSync(join(root, 'components/ceva/AcessoCeva.tsx'), 'utf8');
  assert.match(src, /AbortController/);
  assert.match(src, /AbortError/);
  assert.match(src, /demorou demais/);
});
