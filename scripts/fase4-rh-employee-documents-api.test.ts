import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  handleRhEmployeeDocumentsRequest,
  type RhEmployeeDocumentsHandlerDeps,
} from '../api/rh-employee-documents';
import { authorizeRhApiRequest } from '../lib/rh/rhApiAccess';

const root = process.cwd();

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

const principal = {
  id: 'user-rh-1',
  name: 'Pessoa RH',
  email: 'rh@grupotmseg.com.br',
  role: 'rh',
  clientId: null,
  permissions: [],
};

describe('F4-RH-API-FOUNDATION — auth RH real', () => {
  it('nega ausência e formato inválido de token sem consultar principal', async () => {
    let resolutions = 0;
    const deps = {
      hasServiceRole: () => true,
      resolvePrincipal: async () => {
        resolutions += 1;
        return principal;
      },
    };
    const missing = await authorizeRhApiRequest({ headers: {} }, deps);
    const invalid = await authorizeRhApiRequest({
      headers: { authorization: 'Bearer inválido' },
    }, deps);
    assert.deepEqual(missing, { ok: false, status: 401, error: 'Não autorizado' });
    assert.deepEqual(invalid, { ok: false, status: 401, error: 'Não autorizado' });
    assert.equal(resolutions, 0);
  });

  it('falha fechado sem service_role', async () => {
    const result = await authorizeRhApiRequest({
      headers: { authorization: 'Bearer tmseg-token-user-rh-1-123456' },
    }, {
      hasServiceRole: () => false,
      resolvePrincipal: async () => principal,
    });
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      error: 'Supabase admin indisponível',
    });
  });

  it('preserva roles atuais: RH/Diretoria sim, demais não', async () => {
    const req = {
      headers: { authorization: 'Bearer tmseg-token-user-rh-1-123456' },
    };
    for (const role of ['rh', 'diretoria']) {
      const result = await authorizeRhApiRequest(req, {
        hasServiceRole: () => true,
        resolvePrincipal: async () => ({ ...principal, role }),
      });
      assert.equal(result.ok, true, role);
    }
    for (const role of ['administrador', 'ceo', 'gestor', 'financeiro']) {
      const result = await authorizeRhApiRequest(req, {
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
});

function allowedDeps(ops: Record<string, (...args: any[]) => Promise<any>>): RhEmployeeDocumentsHandlerDeps {
  return {
    authorize: async () => ({ ok: true, principal }),
    createOps: () => ops as any,
  };
}

describe('F4-RH-API-FOUNDATION — handler do piloto documentos', () => {
  it('sem auth retorna 401 antes da operação', async () => {
    let operations = 0;
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'GET', headers: {}, query: { employeeId: 'emp-1' } },
      res,
      {
        authorize: async () => ({ ok: false, status: 401, error: 'Não autorizado' }),
        createOps: () => {
          operations += 1;
          return {} as any;
        },
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(operations, 0);
  });

  it('token inválido retorna 401', async () => {
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'GET', headers: { authorization: 'Bearer inválido' }, query: { employeeId: 'emp-1' } },
      res,
      { authorize: async () => ({ ok: false, status: 401, error: 'Não autorizado' }) },
    );
    assert.equal(res.statusCode, 401);
  });

  it('role inválida retorna 403', async () => {
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'GET', headers: { authorization: 'Bearer token' }, query: { employeeId: 'emp-1' } },
      res,
      { authorize: async () => ({ ok: false, status: 403, error: 'Permissão negada — apenas Diretoria e RH' }) },
    );
    assert.equal(res.statusCode, 403);
  });

  it('payload inválido retorna 400 sem chamar create', async () => {
    let creates = 0;
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'POST', body: { employeeId: 'emp-1' } },
      res,
      allowedDeps({
        create: async () => {
          creates += 1;
        },
      }),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(creates, 0);
  });

  it('GET legítimo executa exatamente uma listagem', async () => {
    let calls = 0;
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'GET', query: { employeeId: 'emp-1' } },
      res,
      allowedDeps({
        list: async (employeeId: string) => {
          calls += 1;
          assert.equal(employeeId, 'emp-1');
          return [{ id: 'doc-1' }];
        },
      }),
    );
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.documents, [{ id: 'doc-1' }]);
  });

  it('POST preserva payload e usa identidade autenticada', async () => {
    let received: any;
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      {
        method: 'POST',
        body: {
          employeeId: 'emp-1',
          docType: 'Contrato',
          fileName: 'contrato.pdf',
          fileUrl: 'https://files/contrato.pdf',
          mimeType: 'application/pdf',
          notes: 'Assinado',
          uploadedBy: 'Nome não confiável do browser',
        },
      },
      res,
      allowedDeps({
        create: async (payload: any, actor: any) => {
          received = { payload, actor };
          return { id: 'doc-1', ...payload, uploaded_by: actor.name };
        },
      }),
    );
    assert.equal(res.statusCode, 201);
    assert.equal(received.actor.name, 'Pessoa RH');
    assert.deepEqual(received.payload, {
      employeeId: 'emp-1',
      docType: 'Contrato',
      fileName: 'contrato.pdf',
      fileUrl: 'https://files/contrato.pdf',
      mimeType: 'application/pdf',
      notes: 'Assinado',
    });
  });

  it('DELETE legítimo executa exatamente uma exclusão lógica', async () => {
    let calls = 0;
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'DELETE', query: { id: 'doc-1' } },
      res,
      allowedDeps({
        remove: async (id: string, actor: any) => {
          calls += 1;
          assert.equal(id, 'doc-1');
          assert.equal(actor.id, 'user-rh-1');
        },
      }),
    );
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
  });

  it('service_role ausente falha fechado', async () => {
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest(
      { method: 'GET', query: { employeeId: 'emp-1' } },
      res,
      {
        authorize: async () => ({ ok: true, principal }),
        createOps: () => null,
      },
    );
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /admin indisponível/i);
  });

  it('método inválido retorna 405 e Allow', async () => {
    const res = responseMock();
    await handleRhEmployeeDocumentsRequest({ method: 'PATCH' }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'GET, POST, DELETE');
  });
});

describe('F4-RH-API-FOUNDATION — arquitetura e reauditoria', () => {
  it('frontend runtime não acessa rh_employee_documents diretamente', () => {
    const component = readFileSync(join(root, 'components/rh/RhEmployeeDocuments.tsx'), 'utf8');
    const client = readFileSync(join(root, 'lib/rh/employeeDocumentsClient.ts'), 'utf8');
    assert.doesNotMatch(component, /\.from\(['"]rh_employee_documents['"]\)/);
    assert.doesNotMatch(client, /\.from\(['"]rh_employee_documents['"]\)/);
    assert.match(component, /employeeDocumentsClient/);
    assert.match(client, /authFetch/);
  });

  it('auth RH é fail-closed e não aceita headers de role como fallback', () => {
    const auth = readFileSync(join(root, 'lib/rh/rhApiAccess.ts'), 'utf8');
    const handler = readFileSync(join(root, 'api/rh-employee-documents.ts'), 'utf8');
    assert.match(auth, /getSupabaseServiceRoleKey/);
    assert.match(auth, /resolvePrincipalFromToken/);
    assert.match(handler, /createRhServiceRoleClient/);
    assert.doesNotMatch(handler, /createRhAdminClient/);
    assert.doesNotMatch(auth, /x-tmseg-role|x-tmseg-permissions/i);
    assert.doesNotMatch(auth, /auth\.uid\(\)/);
  });

  it('SSOT backend é o único runtime que consulta a tabela piloto', () => {
    const core = readFileSync(join(root, 'lib/rh/employeeDocumentsApiCore.ts'), 'utf8');
    assert.match(core, /\.from\(['"]rh_employee_documents['"]\)/);
    assert.match(core, /deleted_at/);
    assert.doesNotMatch(core, /updated_by/);
  });

  it('handler permanece fora de functions{} e rewrite antecede catch-all', () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    assert.equal(vercel.functions?.['api/rh-employee-documents.ts'], undefined);
    assert.ok(Object.keys(vercel.functions || {}).length <= 50);
    const specific = vercel.rewrites.findIndex((r: any) => r.source === '/api/rh/employees/documents');
    const catchAll = vercel.rewrites.findIndex((r: any) => r.source === '/api/(.*)');
    assert.ok(specific >= 0 && catchAll > specific);
  });
});
