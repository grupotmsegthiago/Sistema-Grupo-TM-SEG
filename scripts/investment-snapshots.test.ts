import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('lib/investment/accountBalanceSnapshots.ts', 'utf8');
const apiSrc = fs.readFileSync('api/investment-snapshots.ts', 'utf8');
const migrationSrc = fs.readFileSync('migrations/2026_07_08_account_balance_snapshots.sql', 'utf8');

test('accountBalanceSnapshots tem fallback Supabase quando DATABASE_URL ausente', () => {
  assert.match(src, /getSupabaseAdmin/);
  assert.match(src, /from\('account_balance_snapshots'\)/);
  assert.match(src, /\.insert\(payload\)/);
  assert.doesNotMatch(apiSrc, /DATABASE_URL indisponível/);
});

test('migration account_balance_snapshots cria tabela com RLS', () => {
  assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS public\.account_balance_snapshots/);
  assert.match(migrationSrc, /Allow all for account_balance_snapshots/);
});

test('insertSnapshot tenta pg e depois supabase', () => {
  assert.match(src, /insert pg falhou, tentando Supabase/);
  assert.match(src, /insert supabase falhou/);
  assert.match(src, /import\('pg'\)/);
});
