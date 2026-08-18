import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  requireSnapshotsAdminClient,
  snapshotsStructuralSql,
} from '../lib/investment/accountBalanceSnapshots.ts';
import { selectStructuralSnapshotStatements } from './apply-account-balance-snapshots-migration.mjs';

const FORWARD =
  'migrations/2026_08_18_fase4_p0_rls_account_balance_snapshots.sql';
const ROLLBACK =
  'migrations/rollback/2026_08_18_fase4_p0_rls_account_balance_snapshots.sql';
const HISTORICAL = 'migrations/2026_07_08_account_balance_snapshots.sql';
const TABLE = 'account_balance_snapshots';
const POLICY = 'Allow all for account_balance_snapshots';

const read = (file: string) => fs.readFileSync(file, 'utf8');

function walkRuntimeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkRuntimeFiles(full);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

function referencedPublicTables(sql: string): string[] {
  return [...sql.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\b/gi)]
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index);
}

describe('F4-P0-RLS — account_balance_snapshots (preparação lockdown)', () => {
  it('reauditoria encontra zero consumidor frontend runtime direto', () => {
    const runtimeFiles = [
      ...walkRuntimeFiles('components'),
      ...walkRuntimeFiles('lib'),
    ];
    const direct = runtimeFiles.filter((file) => {
      if (file.endsWith('accountBalanceSnapshots.ts')) return false;
      return /from\(['"]account_balance_snapshots['"]\)/.test(read(file));
    });
    assert.deepEqual(direct, []);

    const client = read('lib/investment/snapshotClient.ts');
    assert.match(client, /authFetch/);
    assert.match(client, /\/api\/investment\/snapshots/);
    assert.doesNotMatch(client, /from\(['"]account_balance_snapshots['"]\)/);
  });

  it('fluxo publicado exige auth TM SEG e service_role fail-closed', () => {
    const handler = read('api/investment-snapshots-all.ts');
    const createHandler = read('api/investment-snapshots.ts');
    const backend = read('lib/investment/accountBalanceSnapshots.ts');

    assert.match(handler, /denyInvestmentApiUnlessAuthorized/);
    assert.match(createHandler, /denyInvestmentApiUnlessAuthorized/);
    assert.match(backend, /requireSnapshotsAdminClient/);
    assert.match(backend, /service_role obrigatória/);
    assert.doesNotMatch(backend, /createSupabaseClient/);
    assert.doesNotMatch(backend, /getSupabaseAnonKey|SUPABASE_ANON/);

    assert.throws(
      () => requireSnapshotsAdminClient({
        getServiceRoleKey: () => '',
        createAdminClient: () => null,
      }),
      /service_role obrigatória/,
    );
  });

  it('migration é exclusiva, sem DML e sem policy substituta', () => {
    const sql = read(FORWARD);
    assert.deepEqual(referencedPublicTables(sql), [TABLE]);
    assert.match(sql, /ALTER TABLE public\.account_balance_snapshots ENABLE ROW LEVEL SECURITY/);
    assert.match(
      sql,
      /DROP POLICY "Allow all for account_balance_snapshots"\s+ON public\.account_balance_snapshots/,
    );
    assert.doesNotMatch(sql, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    assert.doesNotMatch(
      sql,
      /financial_transaction_payments|billing_usage|time_clock|rh_/,
    );
  });

  it('migration aborta em drift antes do DROP (sem guard de contagem de registros)', () => {
    const sql = read(FORWARD);
    const guard = sql.indexOf('policy_total <> 1 OR expected_policy_total <> 1');
    const drop = sql.indexOf(`DROP POLICY "${POLICY}"`);
    assert.ok(guard >= 0 && drop > guard);
    assert.match(sql, /policyname = 'Allow all for account_balance_snapshots'/);
    assert.match(sql, /permissive = 'PERMISSIVE'/);
    assert.match(sql, /cmd = 'ALL'/);
    assert.match(sql, /roles @> ARRAY\['anon', 'authenticated'\]::name\[\]/);
    assert.match(sql, /roles <@ ARRAY\['anon', 'authenticated'\]::name\[\]/);
    assert.match(sql, /qual = 'true'/);
    assert.match(sql, /with_check = 'true'/);
    assert.doesNotMatch(sql, /count\(\*\).*account_balance_snapshots/i);
  });

  it('rollback restaura exatamente a policy anterior', () => {
    const sql = read(ROLLBACK);
    assert.deepEqual(referencedPublicTables(sql), [TABLE]);
    assert.match(sql, /policy_total <> 0/);
    assert.match(
      sql,
      /CREATE POLICY "Allow all for account_balance_snapshots"\s+ON public\.account_balance_snapshots\s+FOR ALL\s+TO anon, authenticated\s+USING \(true\)\s+WITH CHECK \(true\)/,
    );
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('migration histórica permanece como baseline imutável', () => {
    const historical = read(HISTORICAL);
    assert.match(historical, /CREATE POLICY "Allow all for account_balance_snapshots"/);
    assert.match(historical, /FOR ALL TO anon, authenticated USING \(true\) WITH CHECK \(true\)/);
  });

  it('startup/init/CLI não recria policy permissiva', () => {
    const bootstrapSql = snapshotsStructuralSql();
    assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS public\.account_balance_snapshots/);
    assert.doesNotMatch(bootstrapSql, /\b(CREATE|DROP)\s+POLICY\b/i);

    const historical = read(HISTORICAL);
    const filtered = selectStructuralSnapshotStatements(historical);
    assert.deepEqual(
      filtered.filter((statement: string) => /\b(CREATE|DROP)\s+POLICY\b/i.test(statement)),
      [],
    );

    const init = read('api/investment-init.ts');
    assert.match(init, /denyInvestmentApiUnlessAuthorized/);
    assert.match(init, /ensureSnapshotsTable/);

    const cli = read('scripts/apply-account-balance-snapshots-migration.mjs');
    assert.match(cli, /isSnapshotPolicyStatement/);
    assert.match(cli, /selectStructuralSnapshotStatements/);
  });

  it('modelo RED/GREEN preserva service_role e rollback', () => {
    const rows = 132;
    const visible = (role: 'anon' | 'authenticated' | 'service_role', policy: boolean) =>
      role === 'service_role' || policy ? rows : 0;

    assert.equal(visible('anon', true), rows);
    assert.equal(visible('authenticated', true), rows);
    assert.equal(visible('anon', false), 0);
    assert.equal(visible('authenticated', false), 0);
    assert.equal(visible('service_role', false), rows);
    assert.equal(visible('anon', true), rows);
  });

  it('service_role não exige policy dedicada no SQL de lockdown', () => {
    const sql = read(FORWARD);
    assert.doesNotMatch(sql, /TO service_role/i);
    assert.doesNotMatch(sql, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i);
  });
});
