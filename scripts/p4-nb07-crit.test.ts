import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { handleAsaasPaymentItemRequest } from '../api/asaas-payment.js';
import { handleAsaasPaymentsListRequest } from '../api/asaas-payments.js';
import { handleAsaasSyncOpenPaymentsRequest } from '../api/asaas-sync-open-payments.js';
import { handleAsaasWebhookRequest } from '../api/asaas-webhook.js';
import {
  authorizeSupabaseAdminRequest,
  type SupabaseAdminAuthResult,
} from '../lib/supabaseAdminApiAuth.js';
import { runAsaasSyncOpenPayments } from '../lib/asaasSyncOpenPaymentsCore.js';
import { handleAsaasPaymentWebhook } from '../lib/asaasWebhookCore.js';
import type { ResolvedPrincipal } from '../lib/auth/resolvePrincipal.js';

const ASAAS_FINANCE_ROLES = ['administrador', 'diretoria', 'financeiro'] as const;

const AUTH_ROUTES = [
  {
    path: '/api/asaas/sync-open-payments',
    method: 'POST' as const,
    destination: '/api/asaas-sync-open-payments',
    allowedRole: 'financeiro',
    invoke: handleAsaasSyncOpenPaymentsRequest,
    buildReq: (token?: string) => ({
      method: 'POST',
      query: { limit: '5' },
      body: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  },
  {
    path: '/api/asaas/payments',
    method: 'GET' as const,
    destination: '/api/asaas-payments',
    allowedRole: 'financeiro',
    invoke: handleAsaasPaymentsListRequest,
    buildReq: (token?: string) => ({
      method: 'GET',
      query: { limit: '10', offset: '0' },
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  },
  {
    path: '/api/asaas/payment/:id',
    method: 'GET' as const,
    destination: '/api/asaas-payment?id=:id',
    allowedRole: 'administrador',
    invoke: handleAsaasPaymentItemRequest,
    buildReq: (token?: string) => ({
      method: 'GET',
      query: { id: 'pay_test_123', company: 'tmGestao' },
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  },
];

const WEBHOOK_ROUTE = {
  path: '/api/asaas/webhook',
  destination: '/api/asaas-webhook',
};

type ResponseState = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  elapsedMs?: number;
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

function buildAuthorize(resolvedPrincipal: ResolvedPrincipal | null) {
  return (req: any, roles: readonly string[]): Promise<SupabaseAdminAuthResult> =>
    authorizeSupabaseAdminRequest(req, roles, async () => resolvedPrincipal);
}

async function simulateExpressSyncOpenPayments(
  execute: () => Promise<unknown>,
): Promise<ResponseState> {
  const { res, state } = mockResponse();
  try {
    res.json(await execute());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
  return state;
}

async function simulateExpressWebhook(body: unknown): Promise<ResponseState> {
  const { res, state } = mockResponse();
  try {
    res.json(await handleAsaasPaymentWebhook(body as any));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.json({ received: true, error: message });
  }
  return state;
}

async function simulateVercelWebhook(body: unknown): Promise<ResponseState> {
  const { res, state } = mockResponse();
  await handleAsaasWebhookRequest({ method: 'POST', body }, res);
  return state;
}

function assertWebhookParity(express: ResponseState, vercel: ResponseState) {
  assert.equal(express.status, vercel.status, 'status HTTP divergente');
  assert.deepEqual(express.body, vercel.body, 'payload divergente');
}

describe('P4-NB07-CRIT — rotas Asaas críticas fora do catch-all', () => {
  for (const route of AUTH_ROUTES) {
    describe(`${route.method} ${route.path}`, () => {
      it('sem auth → 401 rápido', async () => {
        const startedAt = Date.now();
        const { res, state } = mockResponse();
        await route.invoke(route.buildReq(), res);
        assert.equal(state.status, 401);
        assert.ok(Date.now() - startedAt < 250, 'fail-closed demorou demais');
      });

      it('token inválido → 403', async () => {
        const { res, state } = mockResponse();
        await route.invoke(route.buildReq('token-invalido'), res, {
          authorize: buildAuthorize(null),
        });
        assert.equal(state.status, 403);
      });

      it('role incorreta → 403', async () => {
        const { res, state } = mockResponse();
        await route.invoke(route.buildReq('tmseg-token-user-test-1'), res, {
          authorize: buildAuthorize(principal('operacional')),
        });
        assert.equal(state.status, 403);
      });

      it('método incorreto → 405', async () => {
        const { res, state } = mockResponse();
        const req = route.buildReq();
        req.method = route.method === 'GET' ? 'POST' : 'GET';
        await route.invoke(req, res, {
          authorize: buildAuthorize(principal(route.allowedRole)),
        });
        assert.equal(state.status, 405);
      });
    });
  }

  describe('POST /api/asaas/sync-open-payments — paridade Express × Vercel', () => {
    const mockResult = {
      success: true as const,
      checked: 2,
      markedPaid: 1,
      markedOverdue: 0,
      nfUpdated: 0,
      errors: 0,
      paidIds: ['inv-1'],
    };

    it('A — consulta NF sem limit adicional (paridade getInvoiceByPayment)', () => {
      const expressSrc = fs.readFileSync('server/asaasService.ts', 'utf8');
      const chargeSrc = fs.readFileSync('lib/asaasChargeApi.ts', 'utf8');
      assert.match(expressSrc, /getInvoiceByPayment[\s\S]*?`\/invoices\?payment=\$\{paymentId\}`/);
      const fnBlock = chargeSrc.match(/export async function getInvoicesByPayment[\s\S]*?^}/m);
      assert.ok(fnBlock, 'getInvoicesByPayment ausente');
      assert.match(fnBlock![0], /`\/invoices\?payment=\$\{encodeURIComponent\(paymentId\)\}`/);
      assert.doesNotMatch(fnBlock![0], /limit=/, 'Vercel não deve adicionar limit na consulta NF');
    });

    it('sucesso SSOT → mesmo JSON (200)', async () => {
      const express = await simulateExpressSyncOpenPayments(async () =>
        runAsaasSyncOpenPayments({ queryLimit: '5', bodyLimit: undefined }),
      );
      const { res, state } = mockResponse();
      await handleAsaasSyncOpenPaymentsRequest(
        { method: 'POST', query: { limit: '5' }, body: {}, headers: { authorization: 'Bearer x' } },
        res,
        {
          authorize: buildAuthorize(principal('financeiro')),
          runSync: async () => mockResult,
        },
      );
      assert.equal(express.status, 200);
      assert.equal(state.status, 200);
      assert.deepEqual(state.body, mockResult);
    });

    it('erro SSOT → 500 com { error }', async () => {
      const express = await simulateExpressSyncOpenPayments(async () => {
        throw new Error('Supabase admin indisponível');
      });
      const { res, state } = mockResponse();
      await handleAsaasSyncOpenPaymentsRequest(
        { method: 'POST', query: {}, body: {}, headers: { authorization: 'Bearer x' } },
        res,
        {
          authorize: buildAuthorize(principal('financeiro')),
          runSync: async () => {
            throw new Error('Supabase admin indisponível');
          },
        },
      );
      assert.equal(express.status, 500);
      assert.equal(state.status, 500);
      assert.deepEqual(express.body, state.body);
    });
  });

  describe('POST /api/asaas/webhook — contrato legado (sem SEC-03)', () => {
    it('GET → 405', async () => {
      const { res, state } = mockResponse();
      await handleAsaasWebhookRequest({ method: 'GET', headers: {} }, res);
      assert.equal(state.status, 405);
    });

    it('B — POST sem body → Express = Vercel (erro legado no payload)', async () => {
      const express = await simulateExpressWebhook(undefined);
      const vercel = await simulateVercelWebhook(undefined);
      assertWebhookParity(express, vercel);
      assert.equal((express.body as any).received, true);
      assert.match(String((express.body as any).error), /destructure|undefined|null/i);
    });

    it('C — body array (vazio, 1 evento, múltiplos) → Express = Vercel', async () => {
      const cases = [
        [],
        [{ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_arr_1' } }],
        [
          { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_a' } },
          { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_b' } },
        ],
      ];
      for (const body of cases) {
        const express = await simulateExpressWebhook(body);
        const vercel = await simulateVercelWebhook(body);
        assertWebhookParity(express, vercel);
      }
    });

    it('D — body normal objeto → Express = Vercel', async () => {
      const body = { event: 'PAYMENT_CREATED', payment: { id: 'pay_norm' } };
      const express = await simulateExpressWebhook(body);
      const vercel = await simulateVercelWebhook(body);
      assertWebhookParity(express, vercel);
    });

    it('E — evento válido PAYMENT_RECEIVED → Express = Vercel', async () => {
      const body = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_valid' } };
      const express = await simulateExpressWebhook(body);
      const vercel = await simulateVercelWebhook(body);
      assertWebhookParity(express, vercel);
    });

    it('F — evento ignorado / event ausente / payment ausente → Express = Vercel', async () => {
      const cases = [
        { event: 'PAYMENT_DELETED', payment: { id: 'pay_ign' } },
        { payment: { id: 'pay_no_event' } },
        { event: 'PAYMENT_RECEIVED' },
        { event: ['PAYMENT_RECEIVED'], payment: { id: 'pay_evt_array' } },
      ];
      for (const body of cases) {
        const express = await simulateExpressWebhook(body);
        const vercel = await simulateVercelWebhook(body);
        assertWebhookParity(express, vercel);
      }
    });

    it('G — body null → Express = Vercel (erro legado no payload)', async () => {
      const express = await simulateExpressWebhook(null);
      const vercel = await simulateVercelWebhook(null);
      assertWebhookParity(express, vercel);
      assert.equal((express.body as any).received, true);
      assert.match(String((express.body as any).error), /destructure|undefined|null/i);
    });

    it('H — handler Vercel não converte body ausente em {}', () => {
      const src = fs.readFileSync('api/asaas-webhook.ts', 'utf8');
      assert.doesNotMatch(src, /parseBody/);
      assert.doesNotMatch(src, /if \(!body\) return \{\}/);
      assert.match(src, /handleWebhook\(req\.body\)/);
    });

    it('POST sucesso mockado → 200 { received: true }', async () => {
      const { res, state } = mockResponse();
      await handleAsaasWebhookRequest(
        { method: 'POST', body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } } },
        res,
        { handleWebhook: async () => ({ received: true }) },
      );
      assert.equal(state.status, 200);
      assert.deepEqual(state.body, { received: true });
    });

    it('POST erro → 200 { received: true, error } (paridade Express)', async () => {
      const express = mockResponse();
      try {
        await handleAsaasPaymentWebhook({ event: 'X' } as any);
        express.res.json({ received: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        express.res.json({ received: true, error: message });
      }

      const vercel = mockResponse();
      await handleAsaasWebhookRequest(
        { method: 'POST', body: { event: 'X' } },
        vercel.res,
        {
          handleWebhook: async () => {
            throw new Error('Supabase admin indisponível');
          },
        },
      );

      assert.equal(express.state.status, 200);
      assert.equal(vercel.state.status, 200);
      assert.equal((express.state.body as any).received, true);
      assert.equal((vercel.state.body as any).received, true);
      assert.match(String((vercel.state.body as any).error), /Supabase admin indisponível/);
    });

    it('core webhook usa includes estrito (array ignorado)', () => {
      const core = fs.readFileSync('lib/asaasWebhookCore.ts', 'utf8');
      assert.doesNotMatch(core, /String\(event/);
      assert.match(core, /\.includes\(event/);
    });

    it('não exige ASAAS_PAYMENT_WEBHOOK_TOKEN no handler', () => {
      const src = fs.readFileSync('api/asaas-webhook.ts', 'utf8');
      const core = fs.readFileSync('lib/asaasWebhookCore.ts', 'utf8');
      assert.doesNotMatch(src, /ASAAS_PAYMENT_WEBHOOK_TOKEN/);
      assert.doesNotMatch(core, /ASAAS_PAYMENT_WEBHOOK_TOKEN/);
    });
  });
});

describe('P4-NB07-CRIT — rewrites, SSOT e preservação', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites: Array<{ source: string; destination: string }> = vercel.rewrites;
  const catchAllIndex = rewrites.findIndex((item) => item.source === '/api/(.*)');

  for (const route of [...AUTH_ROUTES, WEBHOOK_ROUTE]) {
    it(`${route.path} resolve antes do catch-all`, () => {
      const routeIndex = rewrites.findIndex((item) => item.source === route.path);
      assert.ok(routeIndex >= 0, 'rewrite específico ausente');
      assert.ok(catchAllIndex < 0 || routeIndex < catchAllIndex, 'rewrite deve preceder catch-all');
      assert.equal(rewrites[routeIndex].destination, route.destination);
    });
  }

  it('NF, Supabase, Investment, health e version mantêm rewrites existentes', () => {
    const expected = new Map([
      ['/api/nf/invoices', '/api/nf-control?op=list'],
      ['/api/supabase/status', '/api/supabase-admin?op=status'],
      ['/api/supabase/db-metrics', '/api/supabase-admin?op=db-metrics'],
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

  it('Express e Vercel reutilizam SSOT compartilhada', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /from "\.\.\/lib\/asaasSyncOpenPaymentsCore"/);
    assert.match(routes, /from "\.\.\/lib\/asaasPaymentRoutesCore"/);
    assert.match(routes, /from "\.\.\/lib\/asaasWebhookCore"/);
    assert.match(fs.readFileSync('api/asaas-sync-open-payments.ts', 'utf8'), /asaasSyncOpenPaymentsCore/);
    assert.match(fs.readFileSync('api/asaas-payments.ts', 'utf8'), /asaasPaymentRoutesCore/);
    assert.match(fs.readFileSync('api/asaas-payment.ts', 'utf8'), /asaasPaymentRoutesCore/);
    assert.match(fs.readFileSync('api/asaas-webhook.ts', 'utf8'), /asaasWebhookCore/);
  });

  it('consumidores frontend permanecem inalterados (authFetch)', () => {
    const invoices = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(invoices, /authFetch\(`\/api\/asaas\/sync-open-payments/);
    assert.match(invoices, /authFetch\(`\/api\/asaas\/payment\//);
    assert.doesNotMatch(invoices, /ASAAS_PAYMENT_WEBHOOK_TOKEN/);
  });

  it('service role e chaves Asaas não aparecem nos handlers Vercel', () => {
    const handlers = [
      'api/asaas-sync-open-payments.ts',
      'api/asaas-payments.ts',
      'api/asaas-payment.ts',
      'api/asaas-webhook.ts',
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(handlers, /ASAAS_TMGESTAO_API|ASAAS_TMSEGURANCA_API|process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('vercel.json functions permanece ≤ 50 (limite deploy Vercel)', () => {
    const fnCount = Object.keys(vercel.functions || {}).length;
    assert.ok(fnCount <= 50, `functions=${fnCount} excede limite 50`);
  });
});
