import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleSupabaseAdminRequest } from '../api/supabase-admin.js';
import {
  authorizeSupabaseAdminRequest,
  type SupabaseAdminAuthResult,
} from '../lib/supabaseAdminApiAuth.js';
import type { ResolvedPrincipal } from '../lib/auth/resolvePrincipal.js';

const INIT_ROUTE = {
  path: '/api/supabase/init-invoices',
  op: 'init-invoices',
  method: 'POST' as const,
  allowedRole: 'financeiro',
};

type ResponseState = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

function principal(role: string): ResolvedPrincipal {
  return {
    id: 'user-test',
    name: 'Teste',
    email: 'teste@tmseg.local',
    role,
    clientId: null,
    permissions: [],
  };
}

function mockResponse(): { res: any; state: ResponseState } {
  const state: ResponseState = { status: 200, body: null, headers: {} };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
}

async function simulateExpressInitInvoices(
  execute: () => Promise<unknown>,
): Promise<ResponseState> {
  const { res, state } = mockResponse();
  try {
    res.json(await execute());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.json({ ok: false, error: message });
  }
  return state;
}

async function invokeVercelInitInvoices(options: {
  method?: string;
  token?: string;
  resolvedPrincipal?: ResolvedPrincipal | null;
  execute?: () => Promise<unknown>;
} = {}): Promise<ResponseState & { executed: boolean }> {
  const { res, state } = mockResponse();
  let executed = false;
  const resolver = async () => options.resolvedPrincipal ?? null;
  const authorize = (req: any, roles: readonly string[]): Promise<SupabaseAdminAuthResult> =>
    authorizeSupabaseAdminRequest(req, roles, resolver);

  await handleSupabaseAdminRequest(
    {
      method: options.method || INIT_ROUTE.method,
      query: { op: INIT_ROUTE.op },
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    },
    res,
    {
      authorize,
      createAdmin: () => ({}) as any,
      execute: async () => {
        executed = true;
        if (options.execute) return options.execute();
        return { ok: true, op: INIT_ROUTE.op };
      },
    },
  );

  return { ...state, executed };
}

function assertParity(
  label: string,
  express: ResponseState,
  vercel: ResponseState,
) {
  assert.equal(
    vercel.status,
    express.status,
    `${label}: status HTTP divergente (Express=${express.status}, Vercel=${vercel.status})`,
  );
  assert.deepEqual(
    vercel.body,
    express.body,
    `${label}: payload divergente`,
  );
}

describe('NB-07 — paridade init-invoices Express × Vercel', () => {
  it('sucesso → HTTP 200 com resultado da operação', async () => {
    const payload = { ok: true, note: 'probe_timeout_or_skip' };
    const express = await simulateExpressInitInvoices(async () => payload);
    const vercel = await invokeVercelInitInvoices({
      token: 'tmseg-token-user-test-1',
      resolvedPrincipal: principal(INIT_ROUTE.allowedRole),
      execute: async () => payload,
    });

    assertParity('sucesso', express, vercel);
    assert.equal(vercel.executed, true);
  });

  it('erro inesperado → HTTP 200 {ok:false,error}', async () => {
    const boom = () => {
      throw new Error('mock_failure');
    };
    const express = await simulateExpressInitInvoices(async () => boom());
    const vercel = await invokeVercelInitInvoices({
      token: 'tmseg-token-user-test-1',
      resolvedPrincipal: principal(INIT_ROUTE.allowedRole),
      execute: async () => boom(),
    });

    assertParity('erro inesperado', express, vercel);
    assert.equal(express.status, 200);
    assert.deepEqual(express.body, { ok: false, error: 'mock_failure' });
    assert.equal(vercel.executed, true);
  });

  it('sem auth → HTTP 401 {error}', async () => {
    const vercel = await invokeVercelInitInvoices();
    assert.equal(vercel.status, 401);
    assert.deepEqual(vercel.body, { error: 'Não autorizado' });
    assert.equal(vercel.executed, false);
  });

  it('role inválida → HTTP 403 {error}', async () => {
    const vercel = await invokeVercelInitInvoices({
      token: 'tmseg-token-user-test-1',
      resolvedPrincipal: principal('operacional'),
    });
    assert.equal(vercel.status, 403);
    assert.match(String((vercel.body as { error?: string }).error), /Permissão negada/);
    assert.equal(vercel.executed, false);
  });

  it('método incorreto → HTTP 405 {error}', async () => {
    const vercel = await invokeVercelInitInvoices({ method: 'GET' });
    assert.equal(vercel.status, 405);
    assert.deepEqual(vercel.body, { error: 'method_not_allowed' });
    assert.equal(vercel.headers.Allow, INIT_ROUTE.method);
    assert.equal(vercel.executed, false);
  });
});

describe('NB-07 — matriz de paridade das seis rotas /api/supabase/*', () => {
  const ROUTES = [
    { op: 'init-invoices', method: 'POST' as const, expressErrorStatus: 200, expressErrorBody: { ok: false, error: 'mock_failure' } },
    { op: 'status', method: 'GET' as const, expressErrorStatus: 500, expressErrorBody: { error: 'mock_failure' } },
    { op: 'db-metrics', method: 'GET' as const, expressErrorStatus: 500, expressErrorBody: { error: 'mock_failure' } },
    { op: 'storage-usage', method: 'GET' as const, expressErrorStatus: 500, expressErrorBody: { error: 'mock_failure' } },
    { op: 'billing-links', method: 'GET' as const, expressErrorStatus: 200, expressErrorBody: null },
    { op: 'health-check', method: 'GET' as const, expressErrorStatus: 500, expressErrorBody: { error: 'mock_failure' } },
  ];

  for (const route of ROUTES) {
    it(`${route.method} /api/supabase/${route.op} — erro inesperado preserva contrato Express`, async () => {
      if (route.op === 'billing-links') {
        const { res, state } = mockResponse();
        await handleSupabaseAdminRequest(
          {
            method: route.method,
            query: { op: route.op },
            headers: { authorization: 'Bearer tmseg-token-user-test-1' },
          },
          res,
          {
            authorize: async () => ({
              ok: true,
              principal: principal('diretoria'),
            }),
            createAdmin: () => ({}) as any,
            execute: async () => {
              throw new Error('should_not_run');
            },
          },
        );
        assert.equal(state.status, 200);
        assert.equal(typeof (state.body as { billing?: string }).billing, 'string');
        return;
      }

      const { res, state } = mockResponse();
      await handleSupabaseAdminRequest(
        {
          method: route.method,
          query: { op: route.op },
          headers: { authorization: 'Bearer tmseg-token-user-test-1' },
        },
        res,
        {
          authorize: async () => ({
            ok: true,
            principal: principal('diretoria'),
          }),
          createAdmin: () => ({}) as any,
          execute: async () => {
            throw new Error('mock_failure');
          },
        },
      );

      assert.equal(state.status, route.expressErrorStatus);
      assert.deepEqual(state.body, route.expressErrorBody);
    });
  }
});
