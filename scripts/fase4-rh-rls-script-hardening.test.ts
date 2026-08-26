import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const scriptPath = join(root, 'scripts/rh-rls-policies.sql');
const historicalMigrationPath = join(
  root,
  'migrations/2026_07_07_rh_rls_policies.sql',
);

const script = readFileSync(scriptPath, 'utf8');
const executableSql = script
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const expectedRhTables = [
  'rh_departments',
  'rh_positions',
  'rh_employees',
  'rh_employee_bank_accounts',
  'rh_employee_documents',
  'rh_employee_dependents',
  'rh_salary_configs',
  'rh_commissions',
  'rh_awards',
  'rh_bonuses',
  'rh_vacation_requests',
  'rh_leave_records',
  'rh_warnings',
  'rh_medical_exams',
  'rh_timeclock',
  'rh_payroll_runs',
  'rh_payroll_items',
  'rh_holidays',
  'rh_benefit_types',
  'rh_employee_benefits',
  'rh_tax_brackets',
  'rh_audit_logs',
  'rh_settings',
];

function listedTables(sql: string): string[] {
  const array = sql.match(
    /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\s*\[([\s\S]*?)\]/i,
  );
  assert.ok(array, 'lista de tabelas RH não encontrada');
  return Array.from(array[1].matchAll(/'([^']+)'/g), (match) => match[1]);
}

describe('F4 RH RLS — neutralização do script operacional legado', () => {
  it('preserva o inventário estrutural completo das tabelas RH', () => {
    assert.deepEqual(listedTables(executableSql), expectedRhTables);
    assert.match(executableSql, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i);
  });

  it('não cria, remove nem altera policies', () => {
    assert.doesNotMatch(executableSql, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(executableSql, /\bDROP\s+POLICY\b/i);
    assert.doesNotMatch(executableSql, /\bALTER\s+POLICY\b/i);
  });

  it('não contém concessão ampla para anon ou authenticated', () => {
    assert.doesNotMatch(executableSql, /\bFOR\s+ALL\b/i);
    assert.doesNotMatch(executableSql, /\bTO\s+anon\b/i);
    assert.doesNotMatch(executableSql, /\bauthenticated\b/i);
    assert.doesNotMatch(executableSql, /\bUSING\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(executableSql, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i);
  });

  it('não reabre os alvos protegidos ou preparados para hardening', () => {
    const protectedTables = [
      'rh_employee_bank_accounts',
      'billing_usage',
      'financial_transaction_payments',
      'account_balance_snapshots',
    ];
    const policyStatements = executableSql
      .split(';')
      .filter((statement) => /\b(?:CREATE|DROP|ALTER)\s+POLICY\b/i.test(statement));

    for (const table of protectedTables) {
      assert.equal(
        policyStatements.some((statement) => statement.includes(table)),
        false,
        table,
      );
    }
  });

  it('permanece structure-only e não executa DML ou grants', () => {
    assert.doesNotMatch(
      executableSql,
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i,
    );
    assert.doesNotMatch(executableSql, /\b(?:CREATE|DROP)\s+TABLE\b/i);
  });

  it('não modifica nem usa a migration histórica como bootstrap operacional', () => {
    const historical = readFileSync(historicalMigrationPath, 'utf8');
    assert.match(historical, /'rh_employee_bank_accounts'/);
    assert.match(historical, /\bCREATE POLICY\b/i);
    assert.doesNotMatch(script, /Espelho:\s*migrations\//i);
    assert.match(script, /migrations novas, exclusivas e revisadas/i);
  });
});
