import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('lib/investment/accountBalanceSnapshots.ts', 'utf8');
const apiSrc = fs.readFileSync('api/investment-snapshots.ts', 'utf8');
const migrationSrc = fs.readFileSync('migrations/2026_07_08_account_balance_snapshots.sql', 'utf8');

test('accountBalanceSnapshots usa REST Supabase (sem pg nem supabase-js)', () => {
  assert.match(src, /rest\/v1\/account_balance_snapshots/);
  assert.match(src, /fetch\(/);
  assert.doesNotMatch(src, /from 'pg'/);
  assert.doesNotMatch(src, /@supabase\/supabase-js/);
  assert.doesNotMatch(apiSrc, /DATABASE_URL indisponível/);
});

test('insertSnapshot propaga erro detalhado do Supabase', () => {
  assert.match(src, /throw new Error\(`insert \$\{res\.status\}/);
  assert.match(apiSrc, /e\?\.message \|\| 'Falha ao gravar snapshot de saldo'/);
});

test('força URL do projeto TM SEG (evita env de outro projeto na Vercel)', () => {
  assert.match(src, /isTmSegUrl/);
  assert.match(src, /DEFAULT_SUPABASE_URL/);
  assert.match(src, /ajhmmjuewdsukecaimik/);
});

const managerSrc = fs.readFileSync('components/FinancialAccountManager.tsx', 'utf8');
const clientSrc = fs.readFileSync('lib/investment/snapshotClient.ts', 'utf8');

test('Painel recarrega snapshots com fallback Supabase e atualiza lista na hora', () => {
  assert.match(managerSrc, /listBalanceSnapshotsDirect/);
  assert.match(managerSrc, /current_calculated_balance: newBal/);
  assert.match(managerSrc, /Ajuste via edição de conta/);
  assert.match(managerSrc, /from 'react'/);
  assert.match(clientSrc, /export async function listBalanceSnapshotsDirect/);
});
