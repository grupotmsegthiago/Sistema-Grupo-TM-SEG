import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('generate DHL usa proxy do Express completo (não handler duplicado)', () => {
  const src = fs.readFileSync('api/dhl/intake/generate.ts', 'utf8');
  assert.match(src, /proxyToExpress/);
  assert.doesNotMatch(src, /dhl_supplier_intakes/);
});

test('by-mission DHL usa proxy do Express', () => {
  const byMission = fs.readFileSync('api/dhl/intake/by-mission.ts', 'utf8');
  assert.match(byMission, /proxyToExpress/);
});

test('Express expõe by-mission com query missionId', () => {
  const src = fs.readFileSync('server/dhlSupplierIntake.ts', 'utf8');
  assert.match(src, /app\.get\('\/api\/dhl\/intake\/by-mission', requireAuth/);
});

test('timeline usa URL canônica no link do fornecedor', () => {
  const src = fs.readFileSync('components/DhlIntakeTimeline.tsx', 'utf8');
  assert.match(src, /CANONICAL_PUBLIC_ORIGIN/);
  assert.doesNotMatch(src, /window\.location\.origin/);
});

test('vercel inclui vercelApp.cjs no generate DHL', () => {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /api\/dhl\/intake\/generate\.ts[\s\S]*includeFiles.*vercelApp\.cjs/);
});
