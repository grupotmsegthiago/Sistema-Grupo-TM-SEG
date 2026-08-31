import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  handleRhEmployeeMedicalExamsRequest,
  type RhEmployeeMedicalExamsHandlerDeps,
} from '../api/rh-employee-medical-exams';
import { createRhMedicalExamsOps } from '../lib/rh/medicalExamsApiCore';
import { roleCanAccessEmployees } from '../lib/rh/apiEmployeesAuth';

const root = process.cwd();
const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const EXAM_ID = '22222222-2222-4222-8222-222222222222';

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
): RhEmployeeMedicalExamsHandlerDeps {
  return {
    authorize: async () => ({ ok: true, principal: principal(role) }),
    createOps: () => ops as any,
  };
}

const validInput = {
  employeeId: EMPLOYEE_ID,
  examType: 'Periódico',
  examDate: '2026-08-26',
  expiryDate: '2027-08-26',
  clinicName: 'Clínica TM',
  result: 'Apto',
};

describe('F4 terceiro piloto RH — autenticação e validação', () => {
  it('mantém 401 sem token, 401 token inválido e 403 role inválida', async () => {
    for (const denial of [
      { status: 401 as const, error: 'Não autorizado' },
      { status: 401 as const, error: 'Token inválido' },
      { status: 403 as const, error: 'Permissão negada — apenas Diretoria e RH' },
    ]) {
      let operations = 0;
      const res = responseMock();
      await handleRhEmployeeMedicalExamsRequest(
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
      await handleRhEmployeeMedicalExamsRequest(
        { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
        res,
        allowedDeps({ list: async () => [] }, role),
      );
      assert.equal(res.statusCode, 200);
    }
  });

  it('falha fechado sem service_role e não revela tecnologia interna', async () => {
    const res = responseMock();
    await handleRhEmployeeMedicalExamsRequest(
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

  it('valida employeeId, id e examType antes do core', async () => {
    let calls = 0;
    const ops = {
      list: async () => { calls += 1; },
      create: async () => { calls += 1; },
      update: async () => { calls += 1; },
      remove: async () => { calls += 1; },
    };
    const requests = [
      { method: 'GET', query: { employeeId: 'inválido' } },
      { method: 'POST', body: { ...validInput, employeeId: 'inválido' } },
      { method: 'POST', body: { ...validInput, examType: '' } },
      { method: 'PATCH', query: { id: 'inválido' }, body: validInput },
      { method: 'DELETE', query: { id: 'inválido' } },
    ];
    for (const req of requests) {
      const res = responseMock();
      await handleRhEmployeeMedicalExamsRequest(req, res, allowedDeps(ops));
      assert.equal(res.statusCode, 400);
    }
    assert.equal(calls, 0);
  });
});

describe('F4 terceiro piloto RH — contratos do handler', () => {
  it('GET lista exames ativos pelo funcionário', async () => {
    const res = responseMock();
    await handleRhEmployeeMedicalExamsRequest(
      { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
      res,
      allowedDeps({
        list: async (employeeId: string) => {
          assert.equal(employeeId, EMPLOYEE_ID);
          return [{ id: EXAM_ID, employee_id: employeeId }];
        },
      }),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.medicalExams[0].id, EXAM_ID);
  });

  it('POST e PATCH preservam payload sem updated_by', async () => {
    const received: any[] = [];
    const ops = {
      create: async (input: any) => {
        received.push(input);
        return { id: EXAM_ID, employee_id: input.employeeId };
      },
      update: async (id: string, input: any) => {
        received.push(input);
        return { id, employee_id: input.employeeId };
      },
    };
    const created = responseMock();
    await handleRhEmployeeMedicalExamsRequest(
      { method: 'POST', body: { ...validInput, updated_by: 'não enviar' } },
      created,
      allowedDeps(ops),
    );
    assert.equal(created.statusCode, 201);

    const updated = responseMock();
    await handleRhEmployeeMedicalExamsRequest(
      {
        method: 'PATCH',
        query: { id: EXAM_ID },
        body: { ...validInput, updated_by: 'não enviar' },
      },
      updated,
      allowedDeps(ops),
    );
    assert.equal(updated.statusCode, 200);
    assert.equal(received.length, 2);
    for (const input of received) {
      assert.equal(input.examType, validInput.examType);
      assert.equal('updated_by' in input, false);
    }
  });

  it('DELETE executa somente soft delete pelo core', async () => {
    let removed = '';
    const res = responseMock();
    await handleRhEmployeeMedicalExamsRequest(
      { method: 'DELETE', query: { id: EXAM_ID } },
      res,
      allowedDeps({
        remove: async (id: string) => {
          removed = id;
        },
      }),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(removed, EXAM_ID);
  });

  it('falhas de INSERT, UPDATE e DELETE retornam somente erro genérico', async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      for (const req of [
        { method: 'POST', body: validInput },
        { method: 'PATCH', query: { id: EXAM_ID }, body: validInput },
        { method: 'DELETE', query: { id: EXAM_ID } },
      ]) {
        const res = responseMock();
        await handleRhEmployeeMedicalExamsRequest(
          req,
          res,
          allowedDeps({
            create: async () => { throw new Error('SENSITIVE_POSTGRES_DETAIL'); },
            update: async () => { throw new Error('SENSITIVE_SUPABASE_DETAIL'); },
            remove: async () => { throw new Error('SENSITIVE_SQL_DETAIL'); },
          }),
        );
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Falha ao operar exames médicos' });
        assert.doesNotMatch(JSON.stringify(res.body), /SENSITIVE|Postgres|Supabase|SQL/i);
      }
    } finally {
      console.error = originalError;
    }
  });
});

describe('F4 terceiro piloto RH — SSOT backend', () => {
  it('SELECT preserva filtro, deleted_at e exam_date DESC', async () => {
    const calls: any[] = [];
    const client = {
      from(table: string) {
        assert.equal(table, 'rh_medical_exams');
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
    await createRhMedicalExamsOps(client).list(EMPLOYEE_ID);
    assert.deepEqual(calls, [
      ['select', '*'],
      ['eq', 'employee_id', EMPLOYEE_ID],
      ['is', 'deleted_at', null],
      ['order', 'exam_date', { ascending: false }],
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
        assert.equal(table, 'rh_medical_exams');
        return {
          insert(rows: any[]) {
            row = rows[0];
            return {
              select: () => ({
                single: async () => ({ data: { id: EXAM_ID, ...row }, error: null }),
              }),
            };
          },
        };
      },
    };
    await createRhMedicalExamsOps(client).create(validInput, principal());
    assert.equal('updated_by' in row, false);
    assert.equal(row.employee_id, EMPLOYEE_ID);
    assert.equal(audit.entity, 'rh_medical_exams');
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
        assert.equal(table, 'rh_medical_exams');
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
                      single: async () => ({ data: { id: EXAM_ID }, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    await createRhMedicalExamsOps(client).remove(EXAM_ID, principal());
    assert.deepEqual(Object.keys(updatePayload), ['deleted_at']);
    assert.match(updatePayload.deleted_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(calls, [
      ['eq', 'id', EXAM_ID],
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
              then: (resolve: any) => resolve({ error: new Error('falha') }),
            }),
          }),
        };
      },
    };
    const ops = createRhMedicalExamsOps(failingClient);
    await assert.rejects(ops.update(EXAM_ID, validInput, principal()));
    await assert.rejects(ops.remove(EXAM_ID, principal()));
    assert.equal(audits, 0);
  });
});

describe('F4 terceiro piloto RH — arquitetura e escopo', () => {
  it('remove acesso direto da UI sem alterar o CRUD genérico compartilhado', () => {
    const workspace = readFileSync(join(root, 'components/rh/RhEmployeeWorkspace.tsx'), 'utf8');
    const component = readFileSync(join(root, 'components/rh/RhMedicalExams.tsx'), 'utf8');
    const generic = readFileSync(join(root, 'components/rh/RhEmployeeScopedCrud.tsx'), 'utf8');
    assert.match(workspace, /<RhMedicalExams employeeId=\{activeId\}/);
    assert.doesNotMatch(workspace, /table=["']rh_medical_exams["']/);
    assert.doesNotMatch(component, /\.from\(['"]rh_medical_exams['"]\)/);
    assert.doesNotMatch(generic, /rh_medical_exams/);
    assert.match(component, /import React,\s*\{[^}]*useState/);
  });

  it('cliente, handler, Express e rewrite formam o caminho autenticado', () => {
    const client = readFileSync(join(root, 'lib/rh/medicalExamsClient.ts'), 'utf8');
    const core = readFileSync(join(root, 'lib/rh/medicalExamsApiCore.ts'), 'utf8');
    const handler = readFileSync(join(root, 'api/rh-employee-medical-exams.ts'), 'utf8');
    const routes = readFileSync(join(root, 'server/rhRoutes.ts'), 'utf8');
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    assert.match(client, /authFetch/);
    assert.match(core, /\.from\(['"]rh_medical_exams['"]\)/);
    assert.doesNotMatch(core, /updated_by/);
    assert.match(handler, /authorizeRhApiRequest/);
    assert.match(handler, /createRhServiceRoleClient/);
    assert.match(routes, /handleRhEmployeeMedicalExamsRequest/);
    assert.equal(vercel.functions?.['api/rh-employee-medical-exams.ts'], undefined);
    assert.ok(Object.keys(vercel.functions || {}).length <= 50);
    const specific = vercel.rewrites.findIndex(
      (rewrite: any) => rewrite.source === '/api/rh/employees/medical-exams',
    );
    const catchAll = vercel.rewrites.findIndex(
      (rewrite: any) => rewrite.source === '/api/(.*)',
    );
    assert.ok(specific >= 0 && catchAll > specific);
  });
});
