import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('generate DHL usa handler standalone (sem proxy Express)', () => {
  const src = fs.readFileSync('api/dhl/intake/generate.ts', 'utf8');
  assert.doesNotMatch(src, /proxyToExpress/);
  assert.match(src, /resolvePublicAppUrl/);
  assert.match(src, /PROVIDER_EMAIL_REQUIRED/);
});

test('by-mission DHL usa handler standalone', () => {
  const byMission = fs.readFileSync('api/dhl/intake/by-mission.ts', 'utf8');
  assert.doesNotMatch(byMission, /proxyToExpress/);
  assert.match(byMission, /dhl_supplier_intakes/);
});

test('Express mantém rotas generate e by-mission para dev local', () => {
  const src = fs.readFileSync('server/dhlSupplierIntake.ts', 'utf8');
  assert.match(src, /app\.post\('\/api\/dhl\/intake\/generate', requireAuth/);
  assert.match(src, /app\.get\('\/api\/dhl\/intake\/by-mission', requireAuth/);
});

test('timeline usa URL canônica no link do fornecedor', () => {
  const src = fs.readFileSync('components/DhlIntakeTimeline.tsx', 'utf8');
  assert.match(src, /CANONICAL_PUBLIC_ORIGIN/);
  assert.doesNotMatch(src, /window\.location\.origin/);
});

test('vercel.json declara funções DHL sem vercelApp.cjs', () => {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /api\/dhl\/intake\/generate\.ts/);
  assert.match(vercel, /api\/dhl\/intake\/by-mission/);
  assert.doesNotMatch(vercel, /api\/dhl\/intake\/generate\.ts[\s\S]*includeFiles.*vercelApp\.cjs/);
});
