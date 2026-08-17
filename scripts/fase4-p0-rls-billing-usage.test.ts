import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

function isBillingUsagePolicyStatement(statement: string): boolean {
  return /\b(create|drop)\s+policy\b/i.test(statement) && /billing_usage/i.test(statement);
}

const FORWARD = 'migrations/2026_08_17_fase4_p0_rls_billing_usage.sql';
const ROLLBACK = 'migrations/rollback/2026_08_17_fase4_p0_rls_billing_usage.sql';
const HISTORICAL = 'migrations/2026_07_12_billing_usage.sql';

const read = (file: string) => fs.readFileSync(file, 'utf8');

function walkTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsx(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('F4-P0-RLS piloto billing_usage', () => {
  it('migration forward é exclusiva de billing_usage e só remove a policy ampla', () => {
    const sql = read(FORWARD);
    assert.match(sql, /ALTER TABLE public\.billing_usage ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /DROP POLICY IF EXISTS "Allow all for billing_usage" ON public\.billing_usage/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
    assert.doesNotMatch(sql, /financial_transaction_payments|account_balance_snapshots|time_clock|rh_/);
    assert.doesNotMatch(sql, /REVOKE|GRANT|DROP TABLE|TRUNCATE|DELETE FROM/);
  });

  it('rollback restaura exatamente a policy versionada anterior', () => {
    const sql = read(ROLLBACK);
    assert.match(sql, /ALTER TABLE public\.billing_usage ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /DROP POLICY IF EXISTS "Allow all for billing_usage" ON public\.billing_usage/);
    assert.match(
      sql,
      /CREATE POLICY "Allow all for billing_usage"\s+ON public\.billing_usage\s+FOR ALL TO anon, authenticated\s+USING \(true\)\s+WITH CHECK \(true\)/,
    );
    assert.doesNotMatch(sql, /financial_transaction_payments|account_balance_snapshots|time_clock|rh_/);
  });

  it('não há consumidor frontend direto novo de billing_usage', () => {
    const billing = read('lib/billing/billingService.ts');
    assert.match(billing, /createSupabaseAdminClient/);
    assert.match(billing, /from\('billing_usage'\)/);
    const direct = walkTsx('components').filter((file) => read(file).includes("from('billing_usage')"));
    assert.deepEqual(direct, []);
  });

  it('bootstrap histórico deixa de reaplicar CREATE/DROP POLICY de billing_usage', () => {
    const historical = read(HISTORICAL);
    assert.match(historical, /CREATE POLICY "Allow all for billing_usage"/);
    const runner = read('lib/billing/usageMigrations.ts');
    assert.match(runner, /isBillingUsagePolicyStatement/);
    assert.equal(isBillingUsagePolicyStatement('CREATE POLICY "Allow all for billing_usage" ON public.billing_usage'), true);
    assert.equal(isBillingUsagePolicyStatement('CREATE INDEX IF NOT EXISTS idx_billing_usage_month ON public.billing_usage (reference_month)'), false);
  });
});
