import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const HISTORICAL = 'migrations/2026_07_08_account_balance_snapshots.sql';
const TABLE = 'account_balance_snapshots';
const POLICY = 'Allow all for account_balance_snapshots';
const FORWARD =
  'migrations/2026_08_17_fase4_p0_rls_account_balance_snapshots.sql';
const ROLLBACK =
  'migrations/rollback/2026_08_17_fase4_p0_rls_account_balance_snapshots.sql';

const read = (file: string) => fs.readFileSync(file, 'utf8');

function walkRuntimeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkRuntimeFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

function posix(file: string): string {
  return file.replaceAll('\\', '/');
}

describe('F4-P0-RLS — account_balance_snapshots (auditoria NO-GO)', () => {
  it('migration histórica cria policy permissiva ALL para anon e authenticated', () => {
    const sql = read(HISTORICAL);
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${TABLE}`));
    assert.match(sql, new RegExp(`ENABLE ROW LEVEL SECURITY`));
    assert.match(
      sql,
      new RegExp(
        `CREATE POLICY "${POLICY}" ON public\\.${TABLE}\\s+FOR ALL TO anon, authenticated USING \\(true\\) WITH CHECK \\(true\\)`,
      ),
    );
  });

  it('frontend runtime usa supabase.from direto (anon)', () => {
    const client = read('lib/investment/snapshotClient.ts');
    assert.match(client, /from '\.\.\/supabase'/);
    assert.match(client, /from\('account_balance_snapshots'\)/);
    assert.match(client, /export async function listBalanceSnapshotsDirect/);
    assert.match(client, /export async function insertBalanceSnapshotDirect/);
    assert.equal(client.includes('authFetch'), false);
  });

  it('DashboardDiretoria e Contas a Pagar leem snapshots só no cliente anon', () => {
    const diretoria = read('lib/dashboardDiretoria/useDashboardDiretoriaData.ts');
    const pagar = read('components/FinancialTransactionList.tsx');

    assert.match(diretoria, /listBalanceSnapshotsDirect\(3650\)/);
    assert.equal(diretoria.includes('/api/investment/snapshots-all'), false);

    assert.match(pagar, /listBalanceSnapshotsDirect\(3650\)/);
    assert.equal(pagar.includes('/api/investment/snapshots-all'), false);
  });

  it('Investment cai para supabase direto se a API falha ou volta vazia', () => {
    const manager = read('components/FinancialAccountManager.tsx');
    assert.match(manager, /authFetch\(`\/api\/investment\/snapshots-all/);
    assert.match(manager, /if \(Array\.isArray\(data\) && data\.length > 0\)/);
    assert.match(manager, /listBalanceSnapshotsDirect\(days\)/);
    assert.match(manager, /insertBalanceSnapshotDirect/);
    assert.match(manager, /usando fallback Supabase/);
  });

  it('inventário runtime de from\(account_balance_snapshots\) no frontend', () => {
    const runtimeFiles = [
      ...walkRuntimeFiles('components'),
      ...walkRuntimeFiles('lib'),
    ];
    const direct = runtimeFiles
      .filter((file) => /from\(['"]account_balance_snapshots['"]\)/.test(read(file)))
      .map(posix);
    assert.deepEqual(direct, ['lib/investment/snapshotClient.ts']);
  });

  it('API autenticada existe, mas o backend ainda pode degradar para chave anon', () => {
    const listAll = read('api/investment-snapshots-all.ts');
    const insert = read('api/investment-snapshots.ts');
    const backend = read('lib/investment/accountBalanceSnapshots.ts');
    const auth = read('lib/investmentApiAuth.ts');

    assert.match(listAll, /denyInvestmentApiUnlessAuthorized/);
    assert.match(insert, /denyInvestmentApiUnlessAuthorized/);
    assert.match(auth, /assertAsaasApiAccess/);
    assert.match(backend, /DEFAULT_SUPABASE_ANON_KEY/);
    assert.match(
      backend,
      /const key = serviceKey && decodeRef\(serviceKey\) === TMSEG_REF \? serviceKey : anonKey/,
    );
    assert.match(
      backend,
      /CREATE POLICY "Allow all for account_balance_snapshots"/,
    );
  });

  it('bootstrap/init recria a policy permissiva se a tabela for criada pelo ensure', () => {
    const backend = read('lib/investment/accountBalanceSnapshots.ts');
    const init = read('api/investment-init.ts');
    const cli = read('scripts/apply-account-balance-snapshots-migration.mjs');
    assert.match(backend, /export async function ensureSnapshotsTable/);
    assert.match(init, /ensureSnapshotsTable/);
    assert.match(cli, /2026_07_08_account_balance_snapshots\.sql/);
    assert.equal(backend.includes('auth.uid()'), false);
    assert.equal(init.includes('auth.uid()'), false);
  });

  it('NO-GO: não há migration de lockdown nesta execução', () => {
    assert.equal(fs.existsSync(FORWARD), false);
    assert.equal(fs.existsSync(ROLLBACK), false);
  });
});
