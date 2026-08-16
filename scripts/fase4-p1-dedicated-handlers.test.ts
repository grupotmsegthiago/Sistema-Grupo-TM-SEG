import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { handleF4ClientDataRequest } from '../api/f4-client-data.js';
import { handleF4DbRequest } from '../api/f4-db.js';
import { handleF4OperationalReportRequest } from '../api/f4-operational-report.js';
import { handleF4PlatformCostsRequest } from '../api/f4-platform-costs.js';
import { authorizeF4ApiRequest } from '../lib/auth/f4ApiAccess.js';
import type { ResolvedPrincipal } from '../lib/auth/resolvePrincipal.js';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites: Array<{ source: string; destination: string }> = vercel.rewrites || [];
const catchAllIndex = rewrites.findIndex((rewrite) => rewrite.source === '/api/(.*)');

const expectedRewrites = [
  ['/api/db/capacity', '/api/f4-db?op=capacity'],
  ['/api/db/vacuum', '/api/f4-db?op=vacuum'],
  ['/api/platform/costs', '/api/f4-platform-costs?op=costs'],
  ['/api/platform/costs/overrides', '/api/f4-platform-costs?op=overrides'],
  ['/api/missions/:id/operational-report', '/api/f4-operational-report?missionId=:id'],
  ['/api/client-registries/init', '/api/f4-client-data?op=registries-init'],
  ['/api/client-registries/:clientId/:type', '/api/f4-client-data?op=registries-list&clientId=:clientId&type=:type'],
  ['/api/client-registries/:id', '/api/f4-client-data?op=registries-item&id=:id'],
  ['/api/client-registries', '/api/f4-client-data?op=registries'],
  ['/api/client-mission-notes/bulk/:clientId', '/api/f4-client-data?op=notes-bulk&clientId=:clientId'],
  ['/api/client-mission-notes/:missionId', '/api/f4-client-data?op=notes-item&missionId=:missionId'],
  ['/api/client-mission-notes', '/api/f4-client-data?op=notes'],
] as const;

describe('F4-P1 — RED/GREEN de roteamento dedicado', () => {
  it('parte do baseline com 50 entradas em functions{} e não adiciona novas', () => {
    assert.equal(Object.keys(vercel.functions || {}).length, 50);
    for (const handler of [
      'api/f4-db.ts',
      'api/f4-platform-costs.ts',
      'api/f4-operational-report.ts',
      'api/f4-client-data.ts',
    ]) {
      assert.equal(Object.hasOwn(vercel.functions || {}, handler), false);
    }
  });

  it('possui os quatro handlers leves auto-discovery', () => {
    for (const handler of [
      'api/f4-db.ts',
      'api/f4-platform-costs.ts',
      'api/f4-operational-report.ts',
      'api/f4-client-data.ts',
    ]) {
      assert.equal(fs.existsSync(handler), true, `${handler} deve existir`);
    }
  });

  for (const [source, destination] of expectedRewrites) {
    it(`${source} usa rewrite dedicado antes do catch-all`, () => {
      const index = rewrites.findIndex(
        (rewrite) => rewrite.source === source && rewrite.destination === destination,
      );
      assert.ok(index >= 0, `rewrite ausente: ${source}`);
      assert.ok(index < catchAllIndex, `${source} ainda cai no catch-all`);
    });
  }

  it('preserva catch-all global e rewrites protegidos existentes', () => {
    assert.ok(catchAllIndex >= 0);
    for (const protectedSource of [
      '/api/nf/invoices',
      '/api/asaas/webhook',
      '/api/supabase/status',
      '/api/investment/snapshots-all',
    ]) {
      const index = rewrites.findIndex((rewrite) => rewrite.source === protectedSource);
      assert.ok(index >= 0 && index < catchAllIndex);
    }
  });
});

type ResponseState = {
  status: number;
  body: any;
  headers: Record<string, string>;
};

function mockResponse() {
  const state: ResponseState = { status: 0, body: undefined, headers: {} };
  const response: any = {
    status(status: number) {
      state.status = status;
      return response;
    },
    json(body: unknown) {
      state.body = body;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
  };
  return { state, response };
}

const principal = (
  role: string,
  overrides: Partial<ResolvedPrincipal> = {},
): ResolvedPrincipal => ({
  id: 'user-1',
  name: 'Usuário',
  email: 'user@example.com',
  role,
  clientId: null,
  permissions: [],
  ...overrides,
});

const resolveToken = async (token: string) => {
  if (token === 'diretoria-ok') return principal('diretoria');
  if (token === 'operador-ok') return principal('operador');
  if (token === 'cliente-10') return principal('cliente', { clientId: '10' });
  return null;
};

describe('F4-P1 — handlers leves, auth antes da operação', () => {
  it('DB: 401/401/403 e sucesso chama operação uma vez', async () => {
    let createAdminCalls = 0;
    let operationCalls = 0;
    const deps: any = {
      authorize: authorizeF4ApiRequest,
      resolvePrincipal: resolveToken,
      createAdmin: () => {
        createAdminCalls += 1;
        return {};
      },
      runOperation: async () => {
        operationCalls += 1;
        return { status: 200, body: { ok: true } };
      },
    };

    for (const [headers, expected] of [
      [{}, 401],
      [{ authorization: 'Bearer inválido' }, 401],
      [{ authorization: 'Bearer operador-ok' }, 403],
    ] as const) {
      const { state, response } = mockResponse();
      await handleF4DbRequest(
        { method: 'GET', query: { op: 'capacity' }, headers },
        response,
        deps,
      );
      assert.equal(state.status, expected);
    }
    assert.equal(createAdminCalls, 0);
    assert.equal(operationCalls, 0);

    const { state, response } = mockResponse();
    await handleF4DbRequest(
      {
        method: 'GET',
        query: { op: 'capacity' },
        headers: { authorization: 'Bearer diretoria-ok' },
      },
      response,
      deps,
    );
    assert.equal(state.status, 200);
    assert.equal(createAdminCalls, 1);
    assert.equal(operationCalls, 1);
  });

  it('DB: método incorreto → 405 + Allow sem auth/admin/operação', async () => {
    let sideEffects = 0;
    const { state, response } = mockResponse();
    await handleF4DbRequest(
      { method: 'POST', query: { op: 'capacity' }, headers: {} },
      response,
      {
        authorize: async () => {
          sideEffects += 1;
          return { ok: false, status: 401, error: 'Não autorizado' };
        },
        resolvePrincipal: resolveToken,
        createAdmin: () => {
          sideEffects += 1;
          return {} as any;
        },
        runOperation: async () => {
          sideEffects += 1;
          return { status: 200, body: {} };
        },
      },
    );
    assert.equal(state.status, 405);
    assert.equal(state.headers.Allow, 'GET');
    assert.equal(sideEffects, 0);
  });

  it('Platform overrides: sem auth não escreve; role admin preserva contrato', async () => {
    let operationCalls = 0;
    const deps: any = {
      authorize: authorizeF4ApiRequest,
      resolvePrincipal: resolveToken,
      createAdmin: () => ({}),
      runOperation: async (_op: string, body: any) => {
        operationCalls += 1;
        return { status: 200, body: { success: true, saved: Object.keys(body.overrides).length } };
      },
    };

    const denied = mockResponse();
    await handleF4PlatformCostsRequest(
      { method: 'POST', query: { op: 'overrides' }, headers: {}, body: { overrides: { x: 1 } } },
      denied.response,
      deps,
    );
    assert.equal(denied.state.status, 401);
    assert.equal(operationCalls, 0);

    const allowed = mockResponse();
    await handleF4PlatformCostsRequest(
      {
        method: 'POST',
        query: { op: 'overrides' },
        headers: { authorization: 'Bearer diretoria-ok' },
        body: { overrides: { x: 1 } },
      },
      allowed.response,
      deps,
    );
    assert.deepEqual(allowed.state, {
      status: 200,
      body: { success: true, saved: 1 },
      headers: {},
    });
    assert.equal(operationCalls, 1);
  });

  it('Relatório operacional: client scope 403; escopo correto chama GET uma vez', async () => {
    let operationCalls = 0;
    const deps: any = {
      authorize: authorizeF4ApiRequest,
      resolvePrincipal: resolveToken,
      createAdmin: () => ({}),
      canAccessMission: async (_admin: any, p: ResolvedPrincipal, missionId: string) =>
        p.clientId === '10' && missionId === 'mission-10',
      runOperation: async () => {
        operationCalls += 1;
        return { status: 200, body: { operational_report: null } };
      },
    };

    const denied = mockResponse();
    await handleF4OperationalReportRequest(
      {
        method: 'GET',
        query: { missionId: 'mission-20' },
        headers: { authorization: 'Bearer cliente-10' },
      },
      denied.response,
      deps,
    );
    assert.equal(denied.state.status, 403);
    assert.equal(operationCalls, 0);

    const allowed = mockResponse();
    await handleF4OperationalReportRequest(
      {
        method: 'GET',
        query: { missionId: 'mission-10' },
        headers: { authorization: 'Bearer cliente-10' },
      },
      allowed.response,
      deps,
    );
    assert.equal(allowed.state.status, 200);
    assert.equal(operationCalls, 1);
  });

  it('Relatório PATCH: role errada → 403; operador legítimo → operação uma vez', async () => {
    let createAdminCalls = 0;
    let operationCalls = 0;
    const deps: any = {
      authorize: authorizeF4ApiRequest,
      resolvePrincipal: resolveToken,
      createAdmin: () => {
        createAdminCalls += 1;
        return {};
      },
      canAccessMission: async () => true,
      runOperation: async () => {
        operationCalls += 1;
        return { status: 200, body: { ok: true } };
      },
    };

    const denied = mockResponse();
    await handleF4OperationalReportRequest(
      {
        method: 'PATCH',
        query: { missionId: 'm1' },
        headers: { authorization: 'Bearer cliente-10' },
        body: {},
      },
      denied.response,
      deps,
    );
    assert.equal(denied.state.status, 403);
    assert.equal(createAdminCalls, 0);

    const allowed = mockResponse();
    await handleF4OperationalReportRequest(
      {
        method: 'PATCH',
        query: { missionId: 'm1' },
        headers: { authorization: 'Bearer operador-ok' },
        body: {},
      },
      allowed.response,
      deps,
    );
    assert.equal(allowed.state.status, 200);
    assert.equal(operationCalls, 1);
  });

  it('Client data: outro cliente → 403 antes do admin; próprio cliente → operação uma vez', async () => {
    let createAdminCalls = 0;
    let operationCalls = 0;
    const deps: any = {
      authorize: authorizeF4ApiRequest,
      resolvePrincipal: resolveToken,
      createAdmin: () => {
        createAdminCalls += 1;
        return {};
      },
      canAccessClient: (p: ResolvedPrincipal, clientId: string) => p.clientId === clientId,
      canAccessMission: async () => true,
      runOperation: async () => {
        operationCalls += 1;
        return { status: 200, body: [] };
      },
    };

    const denied = mockResponse();
    await handleF4ClientDataRequest(
      {
        method: 'GET',
        query: { op: 'registries-list', clientId: '20', type: 'contrato' },
        headers: { authorization: 'Bearer cliente-10' },
      },
      denied.response,
      deps,
    );
    assert.equal(denied.state.status, 403);
    assert.equal(createAdminCalls, 0);

    const allowed = mockResponse();
    await handleF4ClientDataRequest(
      {
        method: 'GET',
        query: { op: 'registries-list', clientId: '10', type: 'contrato' },
        headers: { authorization: 'Bearer cliente-10' },
      },
      allowed.response,
      deps,
    );
    assert.equal(allowed.state.status, 200);
    assert.equal(createAdminCalls, 1);
    assert.equal(operationCalls, 1);
  });

  it('Client data preserva 400 payload, 405 método e 500 interno', async () => {
    const deps: any = {
      authorize: authorizeF4ApiRequest,
      resolvePrincipal: resolveToken,
      createAdmin: () => ({}),
      canAccessClient: () => true,
      canAccessMission: async () => true,
      runOperation: async () => ({ status: 500, body: { error: 'db_error' } }),
    };

    const invalidPayload = mockResponse();
    await handleF4ClientDataRequest(
      {
        method: 'POST',
        query: { op: 'registries' },
        headers: { authorization: 'Bearer cliente-10' },
        body: { client_id: '10' },
      },
      invalidPayload.response,
      deps,
    );
    assert.equal(invalidPayload.state.status, 400);

    const wrongMethod = mockResponse();
    await handleF4ClientDataRequest(
      { method: 'DELETE', query: { op: 'notes' }, headers: {} },
      wrongMethod.response,
      deps,
    );
    assert.equal(wrongMethod.state.status, 405);
    assert.equal(wrongMethod.state.headers.Allow, 'POST');

    const internalError = mockResponse();
    await handleF4ClientDataRequest(
      {
        method: 'GET',
        query: { op: 'registries-list', clientId: '10', type: 'contrato' },
        headers: { authorization: 'Bearer cliente-10' },
      },
      internalError.response,
      deps,
    );
    assert.equal(internalError.state.status, 500);
    assert.deepEqual(internalError.state.body, { error: 'db_error' });
  });
});

describe('F4-P1 — SSOT e paridade Express × Vercel', () => {
  const routesSource = fs.readFileSync('server/routes.ts', 'utf8');

  for (const [route, operation] of [
    ['/api/db/capacity', 'runF4DbOperation'],
    ['/api/platform/costs', 'runF4PlatformCostsOperation'],
    ['/api/missions/:id/operational-report', 'runF4OperationalReportOperation'],
    ['/api/client-registries/:clientId/:type', 'runF4ClientDataOperation'],
  ] as const) {
    it(`${route} delega à mesma operação compartilhada do handler`, () => {
      const start = routesSource.indexOf(`"${route}"`);
      assert.ok(start >= 0);
      assert.ok(routesSource.slice(start, start + 1_500).includes(operation));
    });
  }

  it('handlers não criam Supabase admin antes do resultado de auth', () => {
    for (const path of [
      'api/f4-db.ts',
      'api/f4-platform-costs.ts',
      'api/f4-operational-report.ts',
      'api/f4-client-data.ts',
    ]) {
      const source = fs.readFileSync(path, 'utf8');
      const authIndex = source.indexOf('await deps.authorize');
      const adminIndex = source.indexOf('deps.createAdmin()');
      assert.ok(authIndex >= 0 && adminIndex > authIndex, path);
    }
  });
});
