import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rotas DHL generate/by-mission não usam handlers isolados (caem no Express via api/index)', () => {
  assert.throws(() => fs.readFileSync('api/dhl/intake/generate.ts', 'utf8'));
  assert.throws(() => fs.readFileSync('api/dhl/intake/by-mission.ts', 'utf8'));
  assert.throws(() => fs.readFileSync('api/dhl/intake/by-mission/[missionId].ts', 'utf8'));
});

test('api/index encaminha para Express completo', () => {
  const src = fs.readFileSync('api/index.ts', 'utf8');
  assert.match(src, /proxyToExpress/);
});

test('Express expõe generate e by-mission com auth', () => {
  const src = fs.readFileSync('server/dhlSupplierIntake.ts', 'utf8');
  assert.match(src, /app\.post\('\/api\/dhl\/intake\/generate', requireAuth/);
  assert.match(src, /app\.get\('\/api\/dhl\/intake\/by-mission', requireAuth/);
});

test('timeline usa URL canônica no link do fornecedor', () => {
  const src = fs.readFileSync('components/DhlIntakeTimeline.tsx', 'utf8');
  assert.match(src, /CANONICAL_PUBLIC_ORIGIN/);
  assert.doesNotMatch(src, /window\.location\.origin/);
});

test('vercel.json não declara funções isoladas para generate/by-mission DHL', () => {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.doesNotMatch(vercel, /api\/dhl\/intake\/generate\.ts/);
  assert.doesNotMatch(vercel, /api\/dhl\/intake\/by-mission/);
  assert.match(vercel, /"source": "\/api\/\(.*\)"/);
});
