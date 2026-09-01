import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  handleRhEmployeeWarningsRequest,
  type RhEmployeeWarningsHandlerDeps,
} from '../api/rh-employee-warnings';
import { createRhWarningsOps } from '../lib/rh/warningsApiCore';
import { roleCanAccessEmployees } from '../lib/rh/apiEmployeesAuth';

const root = process.cwd();
const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const WARNING_ID = '22222222-2222-4222-8222-222222222222';

function responseMock() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
}

function principal(role: 'rh' | 'diretoria' = 'rh') {
  return {
    id: `user-${role}`,
    name: `Pessoa ${role}`,
    email: `${role}@grupotmseg.com.br`,
    role,
    clientId: null,
    permissions: [],
  };
}

function allowedDeps(
  ops: Record<string, (...args: any[]) => Promise<any>>,
  role: 'rh' | 'diretoria' = 'rh',
): RhEmployeeWarningsHandlerDeps {
  return {
    authorize: async () => ({ ok: true, principal: principal(role) }),
    createOps: () => ops as any,
  };
}

const validInput = {
  employeeId: EMPLOYEE_ID,
  warningDate: '2026-08-26',
  warningType: 'Escrita',
  reason: 'Atraso recorrente',
  responsible: 'Gestor RH',
};

describe('F4 quarto piloto RH — autenticação e validação', () => {
  it('mantém 401 sem token, 401 token inválido e 403 role inválida', async () => {
    for (const denial of [
      { status: 401 as const, error: 'Não autorizado' },
      { status: 401 as const, error: 'Token inválido' },
      { status: 403 as const, error: 'Permissão negada — apenas Diretoria e RH' },
    ]) {
      let operations = 0;
      const res = responseMock();
      await handleRhEmployeeWarningsRequest(
        { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
        res,
        {
          authorize: async () => ({ ok: false, ...denial }),
          createOps: () => {
            operations += 1;
            return {} as any;
          },
        },
      );
      assert.equal(res.statusCode, denial.status);
      assert.equal(operations, 0);
    }
  });

  it('preserva exclusivamente roles RH e Diretoria', async () => {
    assert.equal(roleCanAccessEmployees('rh'), true);
    assert.equal(roleCanAccessEmployees('diretoria'), true);
    for (const role of ['administrador', 'financeiro', 'gestor', 'operador']) {
      assert.equal(roleCanAccessEmployees(role), false);
    }

    for (const role of ['rh', 'diretoria'] as const) {
      const res = responseMock();
      await handleRhEmployeeWarningsRequest(
        { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
        res,
        allowedDeps({ list: async () => [] }, role),
      );
      assert.equal(res.statusCode, 200);
    }
  });

  it('falha fechado sem service_role e não revela tecnologia interna', async () => {
    const res = responseMock();
    await handleRhEmployeeWarningsRequest(
      { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
      res,
      {
        authorize: async () => ({ ok: true, principal: principal() }),
        createOps: () => null,
      },
    );
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'Serviço RH indisponível' });
    assert.doesNotMatch(JSON.stringify(res.body), /Supabase|service_role|env/i);
  });

  it('valida employeeId, id, warningType e reason antes do core', async () => {
    let calls = 0;
    const ops = {
      list: async () => { calls += 1; },
      create: async () => { calls += 1; },
      update: async () => { calls += 1; },
      remove: async () => { calls += 1; },
    };
    const requests = [
      { method: 'GET', query: {} },
      { method: 'GET', query: { employeeId: 'inválido' } },
      { method: 'POST', body: { ...validInput, employeeId: 'inválido' } },
      { method: 'POST', body: { ...validInput, warningType: '' } },
      { method: 'POST', body: { ...validInput, reason: '' } },
      { method: 'PATCH', query: { id: 'inválido' }, body: validInput },
      { method: 'DELETE', query: { id: 'inválido' } },
    ];
    for (const req of requests) {
      const res = responseMock();
      await handleRhEmployeeWarningsRequest(req, res, allowedDeps(ops));
      assert.equal(res.statusCode, 400);
    }
    assert.equal(calls, 0);
  });
});

describe('F4 quarto piloto RH — contratos do handler', () => {
  it('GET lista advertências ativas pelo funcionário', async () => {
    const res = responseMock();
    await handleRhEmployeeWarningsRequest(
      { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
      res,
      allowedDeps({
        list: async (employeeId: string) => {
          assert.equal(employeeId, EMPLOYEE_ID);
          return [{ id: WARNING_ID, employee_id: employeeId }];
        },
      }),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.warnings[0].id, WARNING_ID);
  });

  it('POST e PATCH preservam payload sem mass assignment', async () => {
    const received: any[] = [];
    const ops = {
      create: async (input: any) => {
        received.push(input);
        return { id: WARNING_ID, employee_id: input.employeeId };
      },
      update: async (id: string, input: any) => {
        received.push(input);
        return { id, employee_id: input.employeeId };
      },
    };
    const created = responseMock();
    await handleRhEmployeeWarningsRequest(
      {
        method: 'POST',
        body: { ...validInput, updated_by: 'não enviar', attachment_url: 'hack' },
      },
      created,
      allowedDeps(ops),
    );
    assert.equal(created.statusCode, 201);

    const updated = responseMock();
    await handleRhEmployeeWarningsRequest(
      {
        method: 'PATCH',
        query: { id: WARNING_ID },
        body: { ...validInput, updated_by: 'não enviar', attachment_url: 'hack' },
      },
      updated,
      allowedDeps(ops),
    );
    assert.equal(updated.statusCode, 200);
    assert.equal(received.length, 2);
    for (const input of received) {
      assert.equal(input.warningType, validInput.warningType);
      assert.equal(input.reason, validInput.reason);
      assert.equal('updated_by' in input, false);
      assert.equal('attachment_url' in input, false);
    }
  });

  it('DELETE executa somente soft delete pelo core', async () => {
    let removed = '';
    const res = responseMock();
    await handleRhEmployeeWarningsRequest(
      { method: 'DELETE', query: { id: WARNING_ID } },
      res,
      allowedDeps({
        remove: async (id: string) => {
          removed = id;
        },
      }),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(removed, WARNING_ID);
  });

  it('falhas de INSERT, UPDATE e DELETE retornam somente erro genérico', async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      for (const req of [
        { method: 'POST', body: validInput },
        { method: 'PATCH', query: { id: WARNING_ID }, body: validInput },
        { method: 'DELETE', query: { id: WARNING_ID } },
      ]) {
        const res = responseMock();
        await handleRhEmployeeWarningsRequest(
          req,
          res,
          allowedDeps({
            create: async () => { throw new Error('SENSITIVE_POSTGRES_DETAIL'); },
            update: async () => { throw new Error('SENSITIVE_SUPABASE_DETAIL'); },
            remove: async () => { throw new Error('SENSITIVE_SQL_DETAIL'); },
          }),
        );
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Falha ao operar advertências' });
        assert.doesNotMatch(JSON.stringify(res.body), /SENSITIVE|Postgres|Supabase|SQL/i);
      }
    } finally {
      console.error = originalError;
    }
  });
});

describe('F4 quarto piloto RH — SSOT backend', () => {
  it('SELECT preserva filtro, deleted_at e warning_date DESC', async () => {
    const calls: any[] = [];
    const client = {
      from(table: string) {
        assert.equal(table, 'rh_warnings');
        return {
          select(value: string) { calls.push(['select', value]); return this; },
          eq(column: string, value: string) { calls.push(['eq', column, value]); return this; },
          is(column: string, value: null) { calls.push(['is', column, value]); return this; },
          order(column: string, options: any) {
            calls.push(['order', column, options]);
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    };
    await createRhWarningsOps(client).list(EMPLOYEE_ID);
    assert.deepEqual(calls, [
      ['select', '*'],
      ['eq', 'employee_id', EMPLOYEE_ID],
      ['is', 'deleted_at', null],
      ['order', 'warning_date', { ascending: false }],
    ]);
  });

  it('INSERT não envia updated_by e preserva auditoria best-effort backend', async () => {
    let row: any;
    let audit: any;
    const client = {
      from(table: string) {
        if (table === 'rh_audit_logs') {
          return {
            async insert(rows: any[]) {
              audit = rows[0];
              return { error: null };
            },
          };
        }
        assert.equal(table, 'rh_warnings');
        return {
          insert(rows: any[]) {
            row = rows[0];
            return {
              select: () => ({
                single: async () => ({ data: { id: WARNING_ID, ...row }, error: null }),
              }),
            };
          },
        };
      },
    };
    await createRhWarningsOps(client).create(validInput, principal());
    assert.equal('updated_by' in row, false);
    assert.equal('attachment_url' in row, false);
    assert.equal(row.employee_id, EMPLOYEE_ID);
    assert.equal(row.warning_type, validInput.warningType);
    assert.equal(row.reason, validInput.reason);
    assert.equal(audit.entity, 'rh_warnings');
    assert.equal(audit.action, 'create');
  });

  it('soft DELETE altera somente deleted_at e confirma a linha afetada', async () => {
    let updatePayload: any;
    const calls: any[] = [];
    const client = {
      from(table: string) {
        if (table === 'rh_audit_logs') {
          return { insert: async () => ({ error: null }) };
        }
        assert.equal(table, 'rh_warnings');
        return {
          update(payload: any) {
            updatePayload = payload;
            return {
              eq(column: string, value: string) {
                calls.push(['eq', column, value]);
                return {
                  select(columnToReturn: string) {
                    calls.push(['select', columnToReturn]);
                    return {
                      single: async () => ({ data: { id: WARNING_ID }, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    await createRhWarningsOps(client).remove(WARNING_ID, principal());
    assert.deepEqual(Object.keys(updatePayload), ['deleted_at']);
    assert.match(updatePayload.deleted_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(calls, [
      ['eq', 'id', WARNING_ID],
      ['select', 'id'],
    ]);
  });

  it('UPDATE e soft DELETE confirmam erro antes de auditar ou retornar sucesso', async () => {
    let audits = 0;
    const failingClient = {
      from(table: string) {
        if (table === 'rh_audit_logs') {
          audits += 1;
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: null, error: new Error('falha') }),
              }),
            }),
          }),
        };
      },
    };
    const ops = createRhWarningsOps(failingClient);
    await assert.rejects(ops.update(WARNING_ID, validInput, principal()));
    await assert.rejects(ops.remove(WARNING_ID, principal()));
    assert.equal(audits, 0);
  });
});

describe('F4 quarto piloto RH — arquitetura e escopo', () => {
  it('remove acesso direto da UI sem alterar o CRUD genérico compartilhado', () => {
    const workspace = readFileSync(join(root, 'components/rh/RhEmployeeWorkspace.tsx'), 'utf8');
    const component = readFileSync(join(root, 'components/rh/RhWarnings.tsx'), 'utf8');
    const generic = readFileSync(join(root, 'components/rh/RhEmployeeScopedCrud.tsx'), 'utf8');
    const dashboard = readFileSync(join(root, 'components/rh/RhDashboard.tsx'), 'utf8');
    assert.match(workspace, /<RhWarnings employeeId=\{activeId\}/);
    assert.doesNotMatch(workspace, /table=["']rh_warnings["']/);
    assert.doesNotMatch(component, /\.from\(['"]rh_warnings['"]\)/);
    assert.doesNotMatch(dashboard, /\.from\(['"]rh_warnings['"]\)/);
    assert.match(dashboard, /warningsClient\.list/);
    assert.doesNotMatch(generic, /rh_warnings/);
    assert.match(component, /import React,\s*\{[^}]*useState/);
  });

  it('RhEmployeeProfile permanece órfão e fora do roteamento ativo', () => {
    const module = readFileSync(join(root, 'components/rh/RhModule.tsx'), 'utf8');
    const profile = readFileSync(join(root, 'components/rh/RhEmployeeProfile.tsx'), 'utf8');
    assert.doesNotMatch(module, /RhEmployeeProfile/);
    assert.match(profile, /\.from\(['"]rh_warnings['"]\)/);
  });

  it('cliente, handler, Express e rewrite formam o caminho autenticado', () => {
    const client = readFileSync(join(root, 'lib/rh/warningsClient.ts'), 'utf8');
    const core = readFileSync(join(root, 'lib/rh/warningsApiCore.ts'), 'utf8');
    const handler = readFileSync(join(root, 'api/rh-employee-warnings.ts'), 'utf8');
    const routes = readFileSync(join(root, 'server/rhRoutes.ts'), 'utf8');
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    assert.match(client, /authFetch/);
    assert.match(core, /\.from\(['"]rh_warnings['"]\)/);
    assert.doesNotMatch(core, /updated_by/);
    assert.doesNotMatch(core, /attachment_url/);
    assert.match(handler, /authorizeRhApiRequest/);
    assert.match(handler, /createRhServiceRoleClient/);
    assert.match(routes, /handleRhEmployeeWarningsRequest/);
    assert.equal(vercel.functions?.['api/rh-employee-warnings.ts'], undefined);
    assert.ok(Object.keys(vercel.functions || {}).length <= 50);
    const specific = vercel.rewrites.findIndex(
      (rewrite: any) => rewrite.source === '/api/rh/employees/warnings',
    );
    const catchAll = vercel.rewrites.findIndex(
      (rewrite: any) => rewrite.source === '/api/(.*)',
    );
    assert.ok(specific >= 0 && catchAll > specific);
  });
});
