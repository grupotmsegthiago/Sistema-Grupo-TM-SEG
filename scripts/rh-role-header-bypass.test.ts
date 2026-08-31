import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRhInitRequest } from '../api/rh-init.ts';
import { handleRhEmployeeListRequest } from '../api/rh-employee-list.ts';
import { handleRhEmployeeCostsRequest } from '../api/rh-employee-costs.ts';

const principal = {
  id: 'user-common',
  name: 'Pessoa Interna',
  email: 'pessoa@grupotmseg.com.br',
  role: 'operacional',
  clientId: null,
  permissions: [],
};

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

function request(
  method: 'GET' | 'POST',
  token = 'tmseg-token-user-common-123456',
  forgedRole = 'rh',
) {
  return {
    method,
    query: { month: '2026-08' },
    headers: {
      authorization: `Bearer ${token}`,
      'x-tmseg-user-id': 'user-common',
      'x-tmseg-role': forgedRole,
    },
  };
}

function accessDeps(role: string | null) {
  return {
    hasServiceRole: () => true,
    resolvePrincipal: async () => (
      role ? { ...principal, role } : null
    ),
  };
}

type EndpointHarness = {
  name: string;
  run: (
    role: string | null,
    token?: string,
    forgedRole?: string,
  ) => Promise<{ statusCode: number; body: unknown; operationCalls: number }>;
};

function endpointHarnesses(): EndpointHarness[] {
  return [
    {
      name: '/api/rh/init',
      async run(role, token, forgedRole) {
        let operationCalls = 0;
        const res = responseMock();
        await handleRhInitRequest(
          request('POST', token, forgedRole),
          res,
          {
            accessDeps: accessDeps(role),
            ensure: async () => {
              operationCalls += 1;
              return { method: 'exec_sql', tables: ['rh_employees'] };
            },
          },
        );
        return { statusCode: res.statusCode, body: res.body, operationCalls };
      },
    },
    {
      name: '/api/rh/employees',
      async run(role, token, forgedRole) {
        let operationCalls = 0;
        const res = responseMock();
        await handleRhEmployeeListRequest(
          request('GET', token, forgedRole),
          res,
          {
            accessDeps: accessDeps(role),
            list: async () => {
              operationCalls += 1;
              return [{ id: 'employee-sensitive' }];
            },
          },
        );
        return { statusCode: res.statusCode, body: res.body, operationCalls };
      },
    },
    {
      name: '/api/rh/employees/cost-summary',
      async run(role, token, forgedRole) {
        let operationCalls = 0;
        const res = responseMock();
        await handleRhEmployeeCostsRequest(
          request('GET', token, forgedRole),
          res,
          {
            accessDeps: accessDeps(role),
            load: async () => {
              operationCalls += 1;
              return { ok: true, totalCompanyCost: 123_456 };
            },
          },
        );
        return { statusCode: res.statusCode, body: res.body, operationCalls };
      },
    },
  ];
}

describe('P0 — bypass x-tmseg-role com RH API Foundation', () => {
  for (const endpoint of endpointHarnesses()) {
    it(`${endpoint.name}: token inválido + role forjada retorna 401`, async () => {
      const result = await endpoint.run('rh', 'token-inválido', 'diretoria');
      assert.equal(result.statusCode, 401);
      assert.equal(result.operationCalls, 0);
    });

    for (const forgedRole of ['rh', 'diretoria']) {
      it(`${endpoint.name}: usuário comum + ${forgedRole} forjado retorna 403`, async () => {
        const result = await endpoint.run('operacional', undefined, forgedRole);
        assert.equal(result.statusCode, 403);
        assert.equal(result.operationCalls, 0);
        assert.doesNotMatch(JSON.stringify(result.body), /employee-sensitive|123456/);
      });
    }

    for (const trustedRole of ['rh', 'diretoria']) {
      it(`${endpoint.name}: role real ${trustedRole} permanece autorizada`, async () => {
        const result = await endpoint.run(trustedRole, undefined, 'operacional');
        assert.equal(result.statusCode, 200);
        assert.equal(result.operationCalls, 1);
      });
    }
  }
});
