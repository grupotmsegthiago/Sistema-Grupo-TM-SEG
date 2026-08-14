import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import {
  ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV,
  getConfiguredAsaasPaymentWebhookToken,
  processAsaasPaymentWebhookEvent,
  verifyAsaasPaymentWebhookRequest,
} from '../lib/asaasPaymentWebhook.js';

describe('SEC-02 — /api/supabase/* exige auth admin', () => {
  const routes = fs.readFileSync('server/routes.ts', 'utf8');

  const adminRoutes = [
    '/api/supabase/status',
    '/api/supabase/db-metrics',
    '/api/supabase/storage-usage',
    '/api/supabase/billing-links',
    '/api/supabase/health-check',
  ];

  for (const route of adminRoutes) {
    it(`${route} usa requireAuth + requireRole diretoria/admin/ceo`, () => {
      const getPat = route.includes('billing-links')
        ? new RegExp(`app\\.get\\("${route.replace(/\//g, '\\/')}", requireAuth, requireRole\\('diretoria', 'administrador', 'ceo'\\)`)
        : new RegExp(`app\\.get\\("${route.replace(/\//g, '\\/')}", requireAuth, requireRole\\('diretoria', 'administrador', 'ceo'\\), async`);
      assert.match(routes, getPat);
    });
  }

  it('POST /api/supabase/init-invoices exige financeiro+', () => {
    assert.match(
      routes,
      /app\.post\("\/api\/supabase\/init-invoices", requireAuth, requireRole\('diretoria', 'administrador', 'ceo', 'financeiro', 'controller'\)/,
    );
  });
});

describe('SEC-01 — investment/* exige assertAsaasApiAccess', () => {
  const routes = fs.readFileSync('server/routes.ts', 'utf8');
  const securedHandlers = [
    'api/investment-init.ts',
    'api/investment-snapshots.ts',
    'api/investment-snapshots-all.ts',
    'api/investment-snapshot-delete.ts',
  ];

  for (const file of securedHandlers) {
    it(`${file} chama denyInvestmentApiUnlessAuthorized`, () => {
      const src = fs.readFileSync(file, 'utf8');
      assert.match(src, /denyInvestmentApiUnlessAuthorized/);
    });
  }

  it('investment-accounts já protegido (preservado)', () => {
    const src = fs.readFileSync('api/investment-accounts.ts', 'utf8');
    assert.match(src, /assertAsaasApiAccess/);
  });

  const expressRoutes = [
    'app.post("/api/investment/init", requireAuth, requireInvestmentApiAccess()',
    'app.get("/api/investment/snapshots/:accountId", requireAuth, requireInvestmentApiAccess()',
    'app.get("/api/investment/snapshots-all", requireAuth, requireInvestmentApiAccess()',
    'app.post("/api/investment/snapshots", requireAuth, requireInvestmentApiAccess()',
    'app.delete("/api/investment/snapshots/:id", requireAuth, requireInvestmentApiAccess()',
    'app.post("/api/investment/accounts", requireAuth, requireInvestmentApiAccess()',
    'app.patch("/api/investment/accounts/:id", requireAuth, requireInvestmentApiAccess()',
    'app.delete("/api/investment/accounts/:id", requireAuth, requireInvestmentApiAccess()',
  ];

  for (const snippet of expressRoutes) {
    it(`Express ${snippet.slice(0, 45)}…`, () => {
      assert.match(routes, new RegExp(snippet.replace(/[()]/g, '\\$&')));
    });
  }
});

describe('SEC-03 — asaas payment webhook', () => {
  it('verifyAsaasPaymentWebhookRequest bloqueia sem env configurada', () => {
    const prev = process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
    delete process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
    try {
      const result = verifyAsaasPaymentWebhookRequest({
        headers: { 'asaas-access-token': 'qualquer' },
      });
      assert.equal(result.ok, false);
      assert.equal(result.configured, false);
      assert.equal(result.reason, 'webhook_not_configured');
    } finally {
      if (prev === undefined) delete process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
      else process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = prev;
    }
  });

  it('token ausente → token_missing', () => {
    const prev = process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
    process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = 'segredo-teste-sec03';
    try {
      const result = verifyAsaasPaymentWebhookRequest({ headers: {} });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'token_missing');
    } finally {
      if (prev === undefined) delete process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
      else process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = prev;
    }
  });

  it('token incorreto → token_invalid', () => {
    const prev = process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
    process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = 'segredo-teste-sec03';
    try {
      const result = verifyAsaasPaymentWebhookRequest({
        headers: { 'asaas-access-token': 'errado' },
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'token_invalid');
    } finally {
      if (prev === undefined) delete process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
      else process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = prev;
    }
  });

  it('token correto → ok', () => {
    const prev = process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
    process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = 'segredo-teste-sec03';
    try {
      const result = verifyAsaasPaymentWebhookRequest({
        headers: { 'asaas-access-token': 'segredo-teste-sec03' },
      });
      assert.equal(result.ok, true);
    } finally {
      if (prev === undefined) delete process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
      else process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = prev;
    }
  });

  it('handler dedicado api/asaas-payment-webhook.ts existe', () => {
    const src = fs.readFileSync('api/asaas-payment-webhook.ts', 'utf8');
    assert.match(src, /verifyAsaasPaymentWebhookRequest/);
    assert.match(src, /processAsaasPaymentWebhookEvent/);
    assert.doesNotMatch(src, /requireAuth/);
  });

  it('vercel.json reescreve /api/asaas/webhook para handler leve', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /"source": "\/api\/asaas\/webhook"/);
    assert.match(vercel, /"destination": "\/api\/asaas-payment-webhook"/);
  });

  it('processAsaasPaymentWebhookEvent ignora evento sem payment (mock, sem DB)', async () => {
    const fakeSb = {
      from: () => ({
        select: () => ({ or: async () => ({ data: [] }) }),
        update: () => ({ eq: async () => ({}) }),
      }),
    };
    const result = await processAsaasPaymentWebhookEvent(
      { event: 'PAYMENT_CREATED', payment: { id: 'pay_mock' } },
      fakeSb as any,
    );
    assert.equal(result.received, true);
    assert.equal(result.processed, false);
  });

  it('getConfiguredAsaasPaymentWebhookToken lê ASAAS_PAYMENT_WEBHOOK_TOKEN', () => {
    const prev = process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
    process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = '  tok  ';
    try {
      assert.equal(getConfiguredAsaasPaymentWebhookToken(), 'tok');
    } finally {
      if (prev === undefined) delete process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV];
      else process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV] = prev;
    }
  });
});
