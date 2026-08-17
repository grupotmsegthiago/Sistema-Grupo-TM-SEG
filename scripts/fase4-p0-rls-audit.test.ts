import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('F4-P0-RLS — auditoria determinística sem SQL', () => {
  it('documenta policies amplas nas quatro tabelas prioritárias', () => {
    const cases = [
      ['migrations/2026_07_20_financial_transaction_payments.sql', 'financial_transaction_payments'],
      ['migrations/2026_07_12_billing_usage.sql', 'billing_usage'],
      ['migrations/2026_07_08_account_balance_snapshots.sql', 'account_balance_snapshots'],
      ['migrations/2026_07_08_timeclock_fix_user_id.sql', 'time_clock'],
    ] as const;
    for (const [path, table] of cases) {
      const sql = read(path);
      assert.match(sql, new RegExp(`Allow all for ${table}`));
      assert.match(sql, /FOR ALL TO anon, authenticated USING \(true\) WITH CHECK \(true\)/);
    }
  });

  it('schema RH possui 27 tabelas reais', () => {
    const moduleSql = read('migrations/2026_07_07_rh_module.sql');
    const tables = [...moduleSql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(rh_[a-z_]+)/g)]
      .map((match) => match[1]);
    assert.equal(new Set(tables).size, 27);
  });

  it('detecta nomes legados e tabelas reais ausentes do inventário RLS', () => {
    const policySql = read('migrations/2026_07_07_rh_rls_policies.sql');
    for (const legacy of [
      'rh_timeclock',
      'rh_vacation_requests',
      'rh_leave_records',
      'rh_benefit_types',
    ]) {
      assert.match(policySql, new RegExp(`'${legacy}'`));
    }
    for (const realMissing of [
      'rh_commission_rules',
      'rh_payslips',
      'rh_employee_emergency_contacts',
      'rh_work_schedules',
      'rh_admissions',
      'rh_lgpd_consents',
    ]) {
      assert.doesNotMatch(policySql, new RegExp(`'${realMissing}'`));
    }
  });

  it('pagamentos parciais ainda fazem CRUD financeiro direto no browser', () => {
    const source = read('lib/financial/receivablePaymentsClient.ts');
    assert.match(source, /from\('financial_transaction_payments'\)[\s\S]*\.select/);
    assert.match(source, /from\('financial_transaction_payments'\)[\s\S]*\.insert/);
    assert.match(source, /from\('financial_transaction_payments'\)[\s\S]*\.delete/);
    assert.match(source, /from\('financial_transactions'\)\.update/);
  });

  it('snapshots possuem fallback frontend direto apesar das APIs protegidas', () => {
    const direct = read('lib/investment/snapshotClient.ts');
    const manager = read('components/FinancialAccountManager.tsx');
    const diretoria = read('lib/dashboardDiretoria/useDashboardDiretoriaData.ts');
    assert.match(direct, /from\('account_balance_snapshots'\)/);
    assert.match(manager, /listBalanceSnapshotsDirect/);
    assert.match(diretoria, /listBalanceSnapshotsDirect/);
  });

  it('billing_usage é backend/service_role e não possui consumidor direto em components', () => {
    const billing = read('lib/billing/billingService.ts');
    assert.match(billing, /createSupabaseAdminClient/);
    assert.match(billing, /from\('billing_usage'\)/);
    const componentFiles = fs.readdirSync('components', { recursive: true })
      .filter((path) => String(path).endsWith('.tsx'));
    const directConsumers = componentFiles.filter((path) =>
      read(`components/${String(path)}`).includes("from('billing_usage')"),
    );
    assert.deepEqual(directConsumers, []);
  });

  it('RH e ponto dependem de acesso anon direto antes do futuro lockdown', () => {
    const employeeForm = read('components/rh/RhEmployeeForm.tsx');
    const payroll = read('lib/rh/payrollClient.ts');
    const punch = read('lib/timeclock/registerPunch.ts');
    assert.match(employeeForm, /from\('rh_employee_bank_accounts'\)/);
    assert.match(employeeForm, /from\('rh_salary_configs'\)/);
    assert.match(payroll, /from\('rh_payroll_runs'\)\.insert/);
    assert.match(punch, /from\('time_clock'\)[\s\S]*\.insert/);
  });

  it('plano contém SQL e rollback explicitamente não executáveis, sem migration aplicada', () => {
    const plan = read('docs/auditoria/F4_P0_RLS_PLANO_SQL_NAO_EXECUTAR.md');
    assert.match(plan, /NÃO EXECUTAR/);
    assert.match(plan, /Rollback exato|Rollback:/);
    assert.match(plan, /billing_usage/);
    assert.match(plan, /financial_transaction_payments/);
    assert.match(plan, /account_balance_snapshots/);
    assert.match(plan, /time_clock/);
    const migrationFiles = fs.readdirSync('migrations');
    assert.equal(migrationFiles.some((name) => /fase4.*rls/i.test(name)), false);
  });
});
