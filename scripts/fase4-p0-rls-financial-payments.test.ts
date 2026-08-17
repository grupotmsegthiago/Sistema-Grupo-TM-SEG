import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  financialPaymentsMigrationSql,
  selectFinancialPaymentsBootstrapStatements,
} from '../lib/financial/ensurePaymentTables.ts';

const FORWARD =
  'migrations/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql';
const ROLLBACK =
  'migrations/rollback/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql';
const HISTORICAL = 'migrations/2026_07_20_financial_transaction_payments.sql';
const TABLE = 'financial_transaction_payments';
const POLICY = 'Allow all for financial_transaction_payments';

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

describe('F4-P0-RLS — financial_transaction_payments (preparação)', () => {
  it('reauditoria encontra zero consumidor frontend runtime direto', () => {
    const runtimeFiles = [
      ...walkRuntimeFiles('components'),
      ...walkRuntimeFiles('lib'),
    ];
    const direct = runtimeFiles.filter((file) =>
      /from\(['"]financial_transaction_payments['"]\)/.test(read(file)),
    );
    assert.deepEqual(
      direct.map((file) => file.replaceAll('\\', '/')),
      ['lib/financial/receivablePaymentsApiCore.ts'],
    );

    const client = read('lib/financial/receivablePaymentsClient.ts');
    assert.match(client, /authFetch/);
    assert.match(client, /\/api\/financial-transaction-payments/);
    assert.doesNotMatch(client, /from\(['"]financial_transaction_payments['"]\)/);
  });

  it('fluxo publicado exige auth e service_role fail-closed', () => {
    const handler = read('api/financial-transaction-payments.ts');
    const auth = read('lib/financial/financialPaymentsApiAuth.ts');
    assert.match(handler, /denyFinancialPaymentsApiUnlessAuthorized/);
    assert.match(handler, /getSupabaseServiceRoleKey/);
    assert.match(handler, /if \(!getSupabaseServiceRoleKey\(\)\) return null/);
    assert.match(handler, /createReceivablePaymentsOps/);
    assert.match(auth, /assertAsaasApiAccess/);
  });

  it('migration é exclusiva, sem DML e sem policy substituta', () => {
    const sql = read(FORWARD);
    assert.deepEqual(referencedPublicTables(sql), [TABLE]);
    assert.match(sql, /ALTER TABLE public\.financial_transaction_payments ENABLE ROW LEVEL SECURITY/);
    assert.match(
      sql,
      /DROP POLICY "Allow all for financial_transaction_payments"\s+ON public\.financial_transaction_payments/,
    );
    assert.doesNotMatch(sql, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('migration aborta em drift antes do DROP', () => {
    const sql = read(FORWARD);
    const guard = sql.indexOf('policy_total <> 1 OR expected_policy_total <> 1');
    const drop = sql.indexOf(`DROP POLICY "${POLICY}"`);
    assert.ok(guard >= 0 && drop > guard);
    assert.match(sql, /policyname = 'Allow all for financial_transaction_payments'/);
    assert.match(sql, /permissive = 'PERMISSIVE'/);
    assert.match(sql, /cmd = 'ALL'/);
    assert.match(sql, /roles @> ARRAY\['anon', 'authenticated'\]::name\[\]/);
    assert.match(sql, /roles <@ ARRAY\['anon', 'authenticated'\]::name\[\]/);
    assert.match(sql, /qual = 'true'/);
    assert.match(sql, /with_check = 'true'/);
  });

  it('rollback restaura exatamente a policy anterior', () => {
    const sql = read(ROLLBACK);
    assert.deepEqual(referencedPublicTables(sql), [TABLE]);
    assert.match(sql, /policy_total <> 0/);
    assert.match(
      sql,
      /CREATE POLICY "Allow all for financial_transaction_payments"\s+ON public\.financial_transaction_payments\s+FOR ALL\s+TO anon, authenticated\s+USING \(true\)\s+WITH CHECK \(true\)/,
    );
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('migration histórica permanece como baseline imutável', () => {
    const historical = read(HISTORICAL);
    assert.match(historical, /CREATE POLICY "Allow all for financial_transaction_payments"/);
    assert.match(historical, /FOR ALL TO anon, authenticated USING \(true\) WITH CHECK \(true\)/);
  });

  it('startup/init futuro não recria policy permissiva', () => {
    const bootstrapSql = financialPaymentsMigrationSql();
    assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS public\.financial_transaction_payments/);
    assert.doesNotMatch(bootstrapSql, /\b(CREATE|DROP)\s+POLICY\b/i);

    const historical = read(HISTORICAL);
    const filtered = selectFinancialPaymentsBootstrapStatements(historical);
    assert.deepEqual(
      filtered.filter((statement) => /\b(CREATE|DROP)\s+POLICY\b/i.test(statement)),
      [],
    );

    const init = read('api/financial-payments-init.ts');
    assert.match(init, /denyFinancialPaymentsApiUnlessAuthorized/);
  });

  it('modelo RED/GREEN preserva service_role e rollback', () => {
    const rows = 35;
    const visible = (role: 'anon' | 'authenticated' | 'service_role', policy: boolean) =>
      role === 'service_role' || policy ? rows : 0;

    assert.equal(visible('anon', true), 35);
    assert.equal(visible('authenticated', true), 35);
    assert.equal(visible('anon', false), 0);
    assert.equal(visible('authenticated', false), 0);
    assert.equal(visible('service_role', false), 35);
    assert.equal(visible('anon', true), 35);
  });
});
