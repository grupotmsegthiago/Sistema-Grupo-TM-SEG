import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('lib/investment/accountBalanceSnapshots.ts', 'utf8');
const apiSrc = fs.readFileSync('api/investment-snapshots.ts', 'utf8');
const migrationSrc = fs.readFileSync('migrations/2026_07_08_account_balance_snapshots.sql', 'utf8');

test('accountBalanceSnapshots usa SSOT admin fail-closed (sem pg nem anon)', () => {
  assert.match(src, /requireSnapshotsAdminClient/);
  assert.match(src, /getSupabaseServiceRoleKey/);
  assert.doesNotMatch(src, /from 'pg'/);
  assert.doesNotMatch(src, /DEFAULT_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(apiSrc, /DATABASE_URL indisponível/);
});

test('insertSnapshot propaga erro detalhado do Supabase', () => {
  assert.match(src, /throw new Error\(`insert \$\{error\.message\}/);
  assert.match(apiSrc, /e\?\.message \|\| 'Falha ao gravar snapshot de saldo'/);
});

test('força URL do projeto TM SEG (evita env de outro projeto na Vercel)', () => {
  assert.match(src, /createSupabaseAdminClient/);
  assert.match(src, /service_role obrigatória/);
});

const managerSrc = fs.readFileSync('components/FinancialAccountManager.tsx', 'utf8');
const clientSrc = fs.readFileSync('lib/investment/snapshotClient.ts', 'utf8');

test('Painel recarrega snapshots pela API e atualiza lista na hora', () => {
  assert.match(managerSrc, /listBalanceSnapshots/);
  assert.match(managerSrc, /current_calculated_balance: newBal/);
  assert.match(managerSrc, /Ajuste via edição de conta/);
  assert.match(managerSrc, /from 'react'/);
  assert.match(clientSrc, /export async function listBalanceSnapshots/);
  assert.match(clientSrc, /authFetch/);
  assert.doesNotMatch(clientSrc, /from\(['"]account_balance_snapshots['"]\)/);
});
