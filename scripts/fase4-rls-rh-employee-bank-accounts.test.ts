import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { authorizeRhApiRequest } from '../lib/rh/rhApiAccess';

const root = process.cwd();
const TABLE = 'rh_employee_bank_accounts';
const POLICY = 'Allow all for rh_employee_bank_accounts';
const FORWARD =
  'migrations/2026_08_26_fase4_rls_rh_employee_bank_accounts.sql';
const ROLLBACK =
  'migrations/rollback/2026_08_26_fase4_rls_rh_employee_bank_accounts.sql';
const HISTORICAL = 'migrations/2026_07_07_rh_rls_policies.sql';

const read = (file: string) => readFileSync(join(root, file), 'utf8');

function walkRuntimeFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) return walkRuntimeFiles(relative);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [relative] : [];
  });
}

function referencedPublicTables(sql: string): string[] {
  return [...sql.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\b/gi)]
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index);
}

const principal = {
  id: 'user-rh-1',
  name: 'Pessoa RH',
  email: 'rh@grupotmseg.com.br',
  role: 'rh',
  clientId: null,
  permissions: [],
};

const request = {
  headers: { authorization: 'Bearer tmseg-token-user-rh-1-123456' },
};

describe('Fase 4 RH RLS — preparação rh_employee_bank_accounts', () => {
  it('mantém zero consumidor frontend runtime direto', () => {
    const direct = [
      ...walkRuntimeFiles('components'),
      ...walkRuntimeFiles('lib'),
    ].filter((file) =>
      /from\(['"]rh_employee_bank_accounts['"]\)/.test(read(file)),
    );

    assert.deepEqual(
      direct.map((file) => file.replaceAll('\\', '/')),
      ['lib/rh/employeeBankAccountsApiCore.ts'],
    );

    const form = read('components/rh/RhEmployeeForm.tsx');
    const client = read('lib/rh/employeeBankAccountsClient.ts');
    assert.match(form, /employeeBankAccountsClient\.get/);
    assert.match(form, /await saveEmployeeBankAccount/);
    assert.doesNotMatch(form, /from\(['"]rh_employee_bank_accounts['"]\)/);
    assert.match(client, /authFetch/);
    assert.doesNotMatch(client, /from\(['"]rh_employee_bank_accounts['"]\)/);
  });

  it('preserva API autenticada e service_role backend fail-closed', () => {
    const handler = read('api/rh-employee-bank-account.ts');
    const access = read('lib/rh/rhApiAccess.ts');
    const core = read('lib/rh/employeeBankAccountsApiCore.ts');

    assert.match(handler, /authorizeRhApiRequest/);
    assert.match(handler, /createRhServiceRoleClient/);
    assert.match(handler, /\['GET', 'POST', 'PATCH'\]/);
    assert.doesNotMatch(handler, /'DELETE'/);
    assert.match(access, /if \(!key\) return null/);
    assert.match(access, /if \(!hasServiceRole\(\)\)/);
    assert.match(core, /from\(['"]rh_employee_bank_accounts['"]\)/);
  });

  it('mantém RH e Diretoria autorizados e demais roles bloqueados', async () => {
    for (const role of ['rh', 'diretoria']) {
      const result = await authorizeRhApiRequest(request, {
        hasServiceRole: () => true,
        resolvePrincipal: async () => ({ ...principal, role }),
      });
      assert.equal(result.ok, true, role);
    }

    for (const role of ['administrador', 'ceo', 'gestor', 'financeiro', 'operador']) {
      const result = await authorizeRhApiRequest(request, {
        hasServiceRole: () => true,
        resolvePrincipal: async () => ({ ...principal, role }),
      });
      assert.deepEqual(result, {
        ok: false,
        status: 403,
        error: 'Permissão negada — apenas Diretoria e RH',
      });
    }
  });

  it('migration é exclusiva, idempotente e sem policy substituta', () => {
    const sql = read(FORWARD);
    assert.deepEqual(referencedPublicTables(sql), [TABLE]);
    assert.match(
      sql,
      /ALTER TABLE public\.rh_employee_bank_accounts ENABLE ROW LEVEL SECURITY/,
    );
    assert.match(sql, /IF policy_total = 0 THEN\s+RETURN;/);
    assert.match(
      sql,
      /DROP POLICY IF EXISTS "Allow all for rh_employee_bank_accounts"\s+ON public\.rh_employee_bank_accounts/,
    );
    assert.doesNotMatch(sql, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('migration aborta em qualquer drift antes do DROP', () => {
    const sql = read(FORWARD);
    const driftGuard = sql.indexOf(
      'policy_total <> 1 OR expected_policy_total <> 1',
    );
    const drop = sql.indexOf(`DROP POLICY IF EXISTS "${POLICY}"`);

    assert.ok(driftGuard >= 0 && drop > driftGuard);
    assert.match(sql, /policyname = 'Allow all for rh_employee_bank_accounts'/);
    assert.match(sql, /permissive = 'PERMISSIVE'/);
    assert.match(sql, /cmd = 'ALL'/);
    assert.match(sql, /roles @> ARRAY\['anon', 'authenticated'\]::name\[\]/);
    assert.match(sql, /roles <@ ARRAY\['anon', 'authenticated'\]::name\[\]/);
    assert.match(sql, /qual = 'true'/);
    assert.match(sql, /with_check = 'true'/);
  });

  it('rollback é exclusivo, idempotente e restaura exatamente a policy anterior', () => {
    const sql = read(ROLLBACK);
    assert.deepEqual(referencedPublicTables(sql), [TABLE]);
    assert.match(sql, /IF policy_total = 0 THEN/);
    assert.match(sql, /CREATE POLICY "Allow all for rh_employee_bank_accounts"/);
    assert.match(sql, /FOR ALL TO anon, authenticated/);
    assert.match(sql, /USING \(true\) WITH CHECK \(true\)/);
    assert.match(
      sql,
      /policy_total <> 1 OR expected_policy_total <> 1/,
    );
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('modelo esperado bloqueia acesso direto e preserva service_role', () => {
    const visibleRows = (
      role: 'anon' | 'authenticated' | 'service_role',
      permissivePolicyExists: boolean,
    ) => role === 'service_role' || permissivePolicyExists ? 1 : 0;

    assert.equal(visibleRows('anon', true), 1);
    assert.equal(visibleRows('authenticated', true), 1);
    assert.equal(visibleRows('anon', false), 0);
    assert.equal(visibleRows('authenticated', false), 0);
    assert.equal(visibleRows('service_role', false), 1);
  });

  it('bootstrap atual não recria policy e histórico permanece imutável', () => {
    const operational = read('scripts/rh-rls-policies.sql');
    const bootstrap = read('scripts/rh-bootstrap-full.sql');
    const historical = read(HISTORICAL);

    assert.doesNotMatch(operational, /\b(?:CREATE|DROP|ALTER)\s+POLICY\b/i);
    assert.doesNotMatch(bootstrap, /\bCREATE\s+POLICY\b/i);
    assert.match(historical, /'rh_employee_bank_accounts'/);
    assert.match(historical, /FOR ALL TO anon, authenticated USING \(true\) WITH CHECK \(true\)/);
  });

  it('Realtime não é dependência funcional do formulário bancário', () => {
    const realtime = read('lib/RealtimeProvider.tsx');
    const form = read('components/rh/RhEmployeeForm.tsx');
    const runtime = [
      ...walkRuntimeFiles('components'),
      ...walkRuntimeFiles('lib'),
    ];
    const listeners = runtime.filter((file) =>
      /supabase:rh_employee_bank_accounts(?::realtime)?/.test(read(file)),
    );

    assert.match(realtime, /'rh_employee_bank_accounts'/);
    assert.match(realtime, /rh_employee_bank_accounts:\s*\[\]/);
    assert.deepEqual(listeners, []);
    assert.doesNotMatch(form, /useRealtimeRefresh|supabase:rh_employee_bank_accounts/);
    assert.match(form, /employeeBankAccountsClient\.get/);
  });
});
