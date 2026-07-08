import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('lib/investment/accountBalanceSnapshots.ts', 'utf8');
const apiSrc = fs.readFileSync('api/investment-snapshots.ts', 'utf8');
const migrationSrc = fs.readFileSync('migrations/2026_07_08_account_balance_snapshots.sql', 'utf8');

test('accountBalanceSnapshots usa Supabase (sem pg no bundle Vercel)', () => {
  assert.match(src, /getSupabaseAdmin/);
  assert.match(src, /from\('account_balance_snapshots'\)/);
  assert.match(src, /\.insert\(payload\)/);
  assert.doesNotMatch(src, /from 'pg'/);
  assert.doesNotMatch(apiSrc, /DATABASE_URL indisponível/);
});

test('insertSnapshot grava via supabase', () => {
  assert.match(src, /insert falhou/);
});
