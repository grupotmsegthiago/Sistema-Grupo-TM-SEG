import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  handleSupabaseAdminRequest,
} from '../api/supabase-admin.js';
import {
  authorizeSupabaseAdminRequest,
  type SupabaseAdminAuthResult,
} from '../lib/supabaseAdminApiAuth.js';
import type { ResolvedPrincipal } from '../lib/auth/resolvePrincipal.js';

type OperationCase = {
  path: string;
  op: string;
  method: 'GET' | 'POST';
  allowedRole: string;
};

const ROUTES: OperationCase[] = [
  { path: '/api/supabase/init-invoices', op: 'init-invoices', method: 'POST', allowedRole: 'financeiro' },
  { path: '/api/supabase/status', op: 'status', method: 'GET', allowedRole: 'diretoria' },
  { path: '/api/supabase/db-metrics', op: 'db-metrics', method: 'GET', allowedRole: 'administrador' },
  { path: '/api/supabase/storage-usage', op: 'storage-usage', method: 'GET', allowedRole: 'ceo' },
  { path: '/api/supabase/billing-links', op: 'billing-links', method: 'GET', allowedRole: 'diretoria' },
  { path: '/api/supabase/health-check', op: 'health-check', method: 'GET', allowedRole: 'administrador' },
];

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

function mockResponse() {
  const state: {
    status: number;
    body: any;
    headers: Record<string, string>;
  } = { status: 200, body: null, headers: {} };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: any) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
}

async function invoke(
  route: OperationCase,
  options: {
    method?: string;
    token?: string;
    resolvedPrincipal?: ResolvedPrincipal | null;
  } = {},
) {
  const startedAt = Date.now();
  const { res, state } = mockResponse();
  let executed = false;
  const resolver = async () => options.resolvedPrincipal ?? null;
  const authorize = (req: any, roles: readonly string[]): Promise<SupabaseAdminAuthResult> =>
    authorizeSupabaseAdminRequest(req, roles, resolver);

  await handleSupabaseAdminRequest(
    {
      method: options.method || route.method,
      query: { op: route.op },
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    },
    res,
    {
      authorize,
      createAdmin: () => ({}) as any,
      execute: async (op) => {
        executed = true;
        return { ok: true, op };
      },
    },
  );

  return { ...state, executed, elapsedMs: Date.now() - startedAt };
}

describe('NB-07 — seis rotas /api/supabase/* em handler Vercel leve', () => {
  for (const route of ROUTES) {
    describe(`${route.method} ${route.path}`, () => {
      it('sem auth → 401 rápido, sem executar operação', async () => {
        const result = await invoke(route);
        assert.equal(result.status, 401);
        assert.equal(result.executed, false);
        assert.ok(result.elapsedMs < 250, `fail-closed demorou ${result.elapsedMs}ms`);
      });

      it('token inválido → 403, sem executar operação', async () => {
        const result = await invoke(route, {
          token: 'token-invalido',
          resolvedPrincipal: null,
        });
        assert.equal(result.status, 403);
        assert.equal(result.executed, false);
      });

      it('role incorreta → 403, sem executar operação', async () => {
        const result = await invoke(route, {
          token: 'tmseg-token-user-test-1',
          resolvedPrincipal: principal('operacional'),
        });
        assert.equal(result.status, 403);
        assert.equal(result.executed, false);
      });

      it('role permitida → chega à operação mock', async () => {
        const result = await invoke(route, {
          token: 'tmseg-token-user-test-1',
          resolvedPrincipal: principal(route.allowedRole),
        });
        assert.equal(result.status, 200);
        if (route.op !== 'billing-links') {
          assert.equal(result.executed, true);
          assert.equal(result.body.op, route.op);
        } else {
          assert.equal(result.executed, false);
          assert.equal(typeof result.body.billing, 'string');
        }
      });

      it('método incorreto → 405 antes da autenticação', async () => {
        const result = await invoke(route, {
          method: route.method === 'GET' ? 'POST' : 'GET',
        });
        assert.equal(result.status, 405);
        assert.equal(result.headers.Allow, route.method);
        assert.equal(result.executed, false);
      });
    });
  }
});

describe('NB-07 — rewrites e preservação', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites: Array<{ source: string; destination: string }> = vercel.rewrites;

  for (const route of ROUTES) {
    it(`${route.path} resolve antes do catch-all`, () => {
      const routeIndex = rewrites.findIndex((item) => item.source === route.path);
      const catchAllIndex = rewrites.findIndex((item) => item.source === '/api/(.*)');
      assert.ok(routeIndex >= 0, 'rewrite específico ausente');
      assert.ok(catchAllIndex < 0 || routeIndex < catchAllIndex, 'rewrite deve preceder catch-all');
      assert.equal(rewrites[routeIndex].destination, `/api/supabase-admin?op=${route.op}`);
    });
  }

  it('NF, investment, health e version mantêm rewrites existentes', () => {
    const expected = new Map([
      ['/api/nf/invoices', '/api/nf-control?op=list'],
      ['/api/investment/init', '/api/investment-init'],
      ['/api/health', '/api/health'],
      ['/api/version', '/api/version'],
    ]);
    for (const [source, destination] of expected) {
      assert.equal(
        rewrites.find((item) => item.source === source)?.destination,
        destination,
      );
    }
  });

  it('Express e Vercel reutilizam a mesma SSOT de operações', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const handler = fs.readFileSync('api/supabase-admin.ts', 'utf8');
    assert.match(routes, /from "\.\.\/lib\/supabaseAdminOperations"/);
    assert.match(handler, /from '\.\.\/lib\/supabaseAdminOperations\.js'/);
  });

  it('consumidores continuam usando authFetch', () => {
    const serverStats = fs.readFileSync('components/ServerStats.tsx', 'utf8');
    const invoices = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const transactions = fs.readFileSync('components/FinancialTransactionList.tsx', 'utf8');
    for (const route of ROUTES.filter((item) => item.op !== 'init-invoices')) {
      assert.match(serverStats, new RegExp(`authFetch\\('${route.path.replace(/\//g, '\\/')}'\\)`));
    }
    assert.match(invoices, /authFetch\('\/api\/supabase\/init-invoices'/);
    assert.match(transactions, /authFetch\('\/api\/supabase\/init-invoices'/);
  });

  it('service role não aparece no frontend nem em resposta do handler', () => {
    const frontend = [
      fs.readFileSync('components/ServerStats.tsx', 'utf8'),
      fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8'),
      fs.readFileSync('components/FinancialTransactionList.tsx', 'utf8'),
    ].join('\n');
    const handler = fs.readFileSync('api/supabase-admin.ts', 'utf8');
    assert.doesNotMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
    assert.doesNotMatch(handler, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  });
});
