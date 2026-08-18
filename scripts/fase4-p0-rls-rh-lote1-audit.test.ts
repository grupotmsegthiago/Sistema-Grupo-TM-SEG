import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const MODULE_MIGRATION = 'migrations/2026_07_07_rh_module.sql';
const POLICY_MIGRATION = 'migrations/2026_07_07_rh_rls_policies.sql';
const POLICY_SCRIPT = 'scripts/rh-rls-policies.sql';

const REAL_RH_TABLES = [
  'rh_admissions',
  'rh_audit_logs',
  'rh_awards',
  'rh_benefits',
  'rh_bonuses',
  'rh_commission_rules',
  'rh_commissions',
  'rh_departments',
  'rh_employee_bank_accounts',
  'rh_employee_benefits',
  'rh_employee_dependents',
  'rh_employee_documents',
  'rh_employee_emergency_contacts',
  'rh_employees',
  'rh_leaves',
  'rh_lgpd_consents',
  'rh_medical_exams',
  'rh_payroll_items',
  'rh_payroll_runs',
  'rh_payslips',
  'rh_positions',
  'rh_salary_configs',
  'rh_settings',
  'rh_tax_brackets',
  'rh_vacations',
  'rh_warnings',
  'rh_work_schedules',
] as const;

const LIVE_ALLOW_ALL_ANON_AUTH = [
  'rh_audit_logs',
  'rh_awards',
  'rh_bonuses',
  'rh_commissions',
  'rh_departments',
  'rh_employee_bank_accounts',
  'rh_employee_benefits',
  'rh_employee_dependents',
  'rh_employee_documents',
  'rh_employees',
  'rh_medical_exams',
  'rh_payroll_items',
  'rh_payroll_runs',
  'rh_positions',
  'rh_salary_configs',
  'rh_settings',
  'rh_tax_brackets',
  'rh_warnings',
] as const;

const LIVE_AUTHENTICATED_ONLY = [
  'rh_admissions',
  'rh_benefits',
  'rh_commission_rules',
  'rh_employee_emergency_contacts',
  'rh_leaves',
  'rh_lgpd_consents',
  'rh_payslips',
  'rh_vacations',
  'rh_work_schedules',
] as const;

const FRONTEND_DIRECT = [
  'rh_audit_logs',
  'rh_awards',
  'rh_benefits',
  'rh_bonuses',
  'rh_commission_rules',
  'rh_commissions',
  'rh_departments',
  'rh_employee_bank_accounts',
  'rh_employee_documents',
  'rh_employees',
  'rh_leaves',
  'rh_medical_exams',
  'rh_payroll_items',
  'rh_payroll_runs',
  'rh_payslips',
  'rh_positions',
  'rh_salary_configs',
  'rh_tax_brackets',
  'rh_vacations',
  'rh_warnings',
] as const;

const NO_FRONTEND_DIRECT = [
  'rh_admissions',
  'rh_employee_benefits',
  'rh_employee_dependents',
  'rh_employee_emergency_contacts',
  'rh_lgpd_consents',
  'rh_settings',
  'rh_work_schedules',
] as const;

const read = (file: string) => fs.readFileSync(file, 'utf8');
const sorted = (values: readonly string[]) => [...values].sort();

function walkRuntimeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkRuntimeFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

function extractRhTables(source: string): string[] {
  const real = new Set<string>(REAL_RH_TABLES);
  return [...source.matchAll(/\brh_[a-z_]+\b/g)]
    .map((match) => match[0])
    .filter((table, index, all) => real.has(table) && all.indexOf(table) === index);
}

function extractCreatedRhTables(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?(rh_[a-z_]+)/gi)]
    .map((match) => match[1]);
}

describe('F4-P0-RLS — auditoria RH lote 1 (sem apply)', () => {
  it('inventário versionado contém as 27 tabelas RH reais e exclui time_clock', () => {
    const created = extractCreatedRhTables(read(MODULE_MIGRATION));
    assert.deepEqual(sorted(created), sorted(REAL_RH_TABLES));
    assert.equal(created.includes('rh_timeclock'), false);
    assert.equal(created.includes('time_clock'), false);
  });

  it('captura o drift histórico de nomes sem tratar aliases antigos como tabelas reais', () => {
    const moduleSql = read(MODULE_MIGRATION);
    const policySql = `${read(POLICY_MIGRATION)}\n${read(POLICY_SCRIPT)}`;
    const drift = [
      ['rh_timeclock', 'time_clock'],
      ['rh_vacation_requests', 'rh_vacations'],
      ['rh_leave_records', 'rh_leaves'],
      ['rh_benefit_types', 'rh_benefits'],
    ] as const;

    for (const [oldName, realName] of drift) {
      assert.match(policySql, new RegExp(`['"]${oldName}['"]`));
      if (realName !== 'time_clock') {
        assert.match(moduleSql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${realName}\\b`));
      }
      assert.doesNotMatch(moduleSql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${oldName}\\b`));
    }
    assert.match(policySql, /['"]rh_holidays['"]/);
  });

  it('registra o snapshot arquitetural das policies permissivas live', () => {
    const allPolicyTables = sorted([
      ...LIVE_ALLOW_ALL_ANON_AUTH,
      ...LIVE_AUTHENTICATED_ONLY,
    ]);
    assert.deepEqual(allPolicyTables, sorted(REAL_RH_TABLES));
    assert.equal(new Set(allPolicyTables).size, REAL_RH_TABLES.length);

    const historical = `${read(POLICY_MIGRATION)}\n${read(POLICY_SCRIPT)}`;
    assert.match(
      historical,
      /CREATE POLICY "Allow all for %I".*FOR ALL TO anon, authenticated USING \(true\) WITH CHECK \(true\)/s,
    );
  });

  it('mapeia 20 tabelas com consumidor frontend Supabase direto', () => {
    const frontendFiles = [
      ...walkRuntimeFiles('components'),
      'lib/rh/audit.ts',
      'lib/rh/fetchRhEmployees.ts',
      'lib/rh/payrollClient.ts',
      'lib/dashboardDiretoria/useDashboardDiretoriaData.ts',
    ];
    const found = new Set<string>();
    for (const file of frontendFiles) {
      for (const table of extractRhTables(read(file))) found.add(table);
    }

    assert.deepEqual(sorted([...found]), sorted(FRONTEND_DIRECT));
    assert.deepEqual(
      sorted(REAL_RH_TABLES.filter((table) => !found.has(table))),
      sorted(NO_FRONTEND_DIRECT),
    );
  });

  it('rh_employees ainda possui fallback anon após tentativa de API autenticada', () => {
    const source = read('lib/rh/fetchRhEmployees.ts');
    const api = source.indexOf("authFetch('/api/rh/employees')");
    const fallback = source.indexOf(".from('rh_employees')");
    assert.ok(api >= 0 && fallback > api);
    assert.match(source, /fallback direto no Supabase/);
  });

  it('bootstrap runtime cria estrutura, mas não executa a migration histórica de policies', () => {
    const bootstrap = read('lib/rh/ensureRhTables.ts');
    assert.match(bootstrap, /2026_07_07_rh_module\.sql/);
    assert.doesNotMatch(bootstrap, /2026_07_07_rh_rls_policies|rh-rls-policies/);
    assert.doesNotMatch(bootstrap, /\bCREATE\s+POLICY\b/i);
  });

  it('define rh_work_schedules como único próximo piloto direto de risco médio', () => {
    const historical = `${read(POLICY_MIGRATION)}\n${read(POLICY_SCRIPT)}`;
    const frontend = new Set<string>(FRONTEND_DIRECT);
    const mediumSensitivity = new Set([
      'rh_benefits',
      'rh_departments',
      'rh_positions',
      'rh_settings',
      'rh_tax_brackets',
      'rh_work_schedules',
    ]);

    const eligible = REAL_RH_TABLES.filter((table) =>
      mediumSensitivity.has(table)
      && !frontend.has(table)
      && !new RegExp(`['"]${table}['"]`).test(historical),
    );

    assert.deepEqual(eligible, ['rh_work_schedules']);
    assert.equal(LIVE_AUTHENTICATED_ONLY.includes('rh_work_schedules'), true);
  });

  it('mantém fora do lote as três tabelas RLS já homologadas', () => {
    const source = read(import.meta.filename);
    assert.doesNotMatch(
      source,
      /from\(['"](?:billing_usage|financial_transaction_payments|account_balance_snapshots|time_clock)['"]\)/,
    );
  });
});
