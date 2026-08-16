import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { handleAsaasWebhookRequest } from '../api/asaas-webhook.js';
import {
  ASAAS_PAYMENT_WEBHOOK_HEADER,
  ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV,
  verifyAsaasPaymentWebhookRequest,
} from '../lib/asaasWebhookAuth.js';
import { handleAsaasPaymentWebhook } from '../lib/asaasWebhookCore.js';

const TEST_TOKEN = 'sec03-test-token-32-characters-minimum-value';

type ResponseState = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

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

function authenticatedRequest(body: unknown, token = TEST_TOKEN) {
  return {
    method: 'POST',
    headers: { [ASAAS_PAYMENT_WEBHOOK_HEADER]: token },
    body,
  };
}

describe('SEC-03 — autenticação dedicada e fail-closed', () => {
  it('sem token configurado → 503 antes do core financeiro', async () => {
    let coreCalls = 0;
    const { res, state } = mockResponse();
    await handleAsaasWebhookRequest(
      authenticatedRequest({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }, ''),
      res,
      {
        resolveExpectedToken: () => undefined,
        handleWebhook: async () => {
          coreCalls += 1;
          return { received: true };
        },
      },
    );
    assert.equal(state.status, 503);
    assert.deepEqual(state.body, { error: 'webhook_not_configured' });
    assert.equal(coreCalls, 0);
  });

  it('token configurado fora do contrato Asaas → 503', () => {
    assert.deepEqual(
      verifyAsaasPaymentWebhookRequest(
        { headers: { [ASAAS_PAYMENT_WEBHOOK_HEADER]: 'curto' } },
        'curto',
      ),
      { ok: false, status: 503, error: 'webhook_not_configured' },
    );
  });

  it('sem header → 401 antes de qualquer escrita', async () => {
    let coreCalls = 0;
    const { res, state } = mockResponse();
    await handleAsaasWebhookRequest(
      { method: 'POST', headers: {}, body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } } },
      res,
      {
        resolveExpectedToken: () => TEST_TOKEN,
        handleWebhook: async () => {
          coreCalls += 1;
          return { received: true };
        },
      },
    );
    assert.equal(state.status, 401);
    assert.deepEqual(state.body, { error: 'unauthorized' });
    assert.equal(coreCalls, 0);
  });

  it('token incorreto → 401 antes de qualquer escrita', async () => {
    let coreCalls = 0;
    const { res, state } = mockResponse();
    await handleAsaasWebhookRequest(
      authenticatedRequest(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } },
        'token-incorreto-com-mais-de-32-caracteres',
      ),
      res,
      {
        resolveExpectedToken: () => TEST_TOKEN,
        handleWebhook: async () => {
          coreCalls += 1;
          return { received: true };
        },
      },
    );
    assert.equal(state.status, 401);
    assert.equal(coreCalls, 0);
  });

  it('token correto → core atual é alcançado com payload intacto', async () => {
    const payload = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_ok' } };
    let received: unknown;
    const { res, state } = mockResponse();
    await handleAsaasWebhookRequest(authenticatedRequest(payload), res, {
      resolveExpectedToken: () => TEST_TOKEN,
      handleWebhook: async (body) => {
        received = body;
        return { received: true };
      },
    });
    assert.equal(state.status, 200);
    assert.deepEqual(received, payload);
    assert.deepEqual(state.body, { received: true });
  });

  it('body inválido autenticado preserva contrato de erro legado', async () => {
    const { res, state } = mockResponse();
    await handleAsaasWebhookRequest(authenticatedRequest(undefined), res, {
      resolveExpectedToken: () => TEST_TOKEN,
      handleWebhook: async () => {
        throw new Error('payload inválido');
      },
    });
    assert.equal(state.status, 200);
    assert.equal((state.body as any).received, true);
    assert.match(String((state.body as any).error), /payload inválido/);
  });

  it('comparação usa hash + timingSafeEqual e não registra token', () => {
    const authSrc = fs.readFileSync('lib/asaasWebhookAuth.ts', 'utf8');
    const handlerSrc = fs.readFileSync('api/asaas-webhook.ts', 'utf8');
    assert.match(authSrc, /timingSafeEqual/);
    assert.match(authSrc, /createHash\('sha256'\)/);
    assert.doesNotMatch(authSrc + handlerSrc, /console\.(log|warn|error).*token/i);
  });

  it('Vercel e Express autenticam antes de chamar o core/Supabase', () => {
    const handlerSrc = fs.readFileSync('api/asaas-webhook.ts', 'utf8');
    const handlerAuth = handlerSrc.indexOf('verifyAsaasPaymentWebhookRequest(req');
    const handlerCore = handlerSrc.indexOf('handleWebhook(req.body)');
    assert.ok(handlerAuth >= 0 && handlerAuth < handlerCore);

    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const start = routes.indexOf('app.post("/api/asaas/webhook"');
    const block = routes.slice(start, start + 800);
    const expressAuth = block.indexOf('verifyAsaasPaymentWebhookRequest(req');
    const expressCore = block.indexOf('handleAsaasPaymentWebhook(req.body)');
    assert.ok(expressAuth >= 0 && expressAuth < expressCore);
  });
});

describe('SEC-03 — eventos e idempotência do core preservados', () => {
  function createStatefulSupabase() {
    const state = {
      invoiceStatus: 'EMITIDA',
      transactionStatus: 'PENDING',
      invoiceUpdates: 0,
      transactionUpdates: 0,
      inserts: 0,
    };

    const client = {
      from(table: string) {
        if (table === 'financial_invoices') {
          return {
            select() {
              return {
                async or() {
                  return { data: [{ id: 'inv-1', number: 'NF-1', client: 'Cliente' }] };
                },
              };
            },
            update(payload: { status?: string }) {
              return {
                async eq() {
                  state.invoiceStatus = payload.status || state.invoiceStatus;
                  state.invoiceUpdates += 1;
                  return { error: null };
                },
              };
            },
            insert() {
              state.inserts += 1;
            },
          };
        }

        if (table === 'financial_transactions') {
          return {
            update(payload: { status?: string }) {
              return {
                ilike() {
                  return {
                    async eq(field: string, expected: string) {
                      assert.equal(field, 'status');
                      if (state.transactionStatus === expected) {
                        state.transactionStatus = payload.status || state.transactionStatus;
                        state.transactionUpdates += 1;
                      }
                      return { error: null };
                    },
                  };
                },
              };
            },
            insert() {
              state.inserts += 1;
            },
          };
        }

        throw new Error(`Tabela inesperada: ${table}`);
      },
    };
    return { client, state };
  }

  it('preserva exatamente PAYMENT_RECEIVED e PAYMENT_CONFIRMED', () => {
    const core = fs.readFileSync('lib/asaasWebhookCore.ts', 'utf8');
    assert.match(core, /\['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'\]\.includes/);
  });

  for (const event of ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']) {
    it(`${event} autenticado mantém baixa existente`, async () => {
      const { client, state } = createStatefulSupabase();
      const result = await handleAsaasPaymentWebhook(
        { event, payment: { id: `pay_${event}`, status: 'RECEIVED' } },
        {
          createAdminClient: () => client as any,
          today: () => '2026-08-16',
          log: () => {},
        },
      );
      assert.deepEqual(result, { received: true });
      assert.equal(state.invoiceStatus, 'PAGA');
      assert.equal(state.transactionStatus, 'PAID');
    });
  }

  it('evento ignorado e ausência de payment não escrevem', async () => {
    for (const payload of [
      { event: 'PAYMENT_CREATED', payment: { id: 'pay_ignored' } },
      { event: 'PAYMENT_RECEIVED' },
      { payment: { id: 'pay_without_event' } },
    ]) {
      const { client, state } = createStatefulSupabase();
      assert.deepEqual(
        await handleAsaasPaymentWebhook(payload as any, {
          createAdminClient: () => client as any,
          log: () => {},
        }),
        { received: true },
      );
      assert.equal(state.invoiceUpdates, 0);
      assert.equal(state.transactionUpdates, 0);
    }
  });

  it('payment inexistente retorna received sem escrita', async () => {
    let updates = 0;
    const client = {
      from() {
        return {
          select() {
            return { async or() { return { data: [] }; } };
          },
          update() {
            updates += 1;
          },
        };
      },
    };
    assert.deepEqual(
      await handleAsaasPaymentWebhook(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_not_found' } },
        { createAdminClient: () => client as any, log: () => {} },
      ),
      { received: true },
    );
    assert.equal(updates, 0);
  });

  it('Supabase indisponível preserva erro atual após autenticação', async () => {
    await assert.rejects(
      handleAsaasPaymentWebhook(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } },
        { createAdminClient: () => null, log: () => {} },
      ),
      /Supabase admin indisponível/,
    );
  });

  it('evento duplicado mantém estado idempotente e não duplica transação', async () => {
    const { client, state } = createStatefulSupabase();
    const payload = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_duplicate' } };
    const deps = {
      createAdminClient: () => client as any,
      today: () => '2026-08-16',
      log: () => {},
    };
    await handleAsaasPaymentWebhook(payload, deps);
    await handleAsaasPaymentWebhook(payload, deps);
    assert.equal(state.invoiceStatus, 'PAGA');
    assert.equal(state.transactionStatus, 'PAID');
    assert.equal(state.transactionUpdates, 1, 'segunda entrega não encontra transação PENDING');
    assert.equal(state.inserts, 0);
  });
});

describe('SEC-03 — três contas e isolamento de escopo', () => {
  for (const company of ['TM GESTÃO', 'TM SEGURANÇA', 'TM SECURITY']) {
    it(`${company}: mesmo endpoint/secret preserva payload sem misturar emissora`, async () => {
      const payload = {
        event: 'PAYMENT_RECEIVED',
        payment: { id: `pay_${company}`, externalReference: `NF-${company}` },
        issuer_company: company,
      };
      let received: unknown;
      const { res, state } = mockResponse();
      await handleAsaasWebhookRequest(authenticatedRequest(payload), res, {
        resolveExpectedToken: () => TEST_TOKEN,
        handleWebhook: async (body) => {
          received = body;
          return { received: true };
        },
      });
      assert.equal(state.status, 200);
      assert.deepEqual(received, payload);
    });
  }

  it('secret permanece somente no backend e não altera outras rotas Asaas', () => {
    const frontend = [
      fs.readFileSync('App.tsx', 'utf8'),
      ...fs.readdirSync('components')
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => fs.readFileSync(`components/${file}`, 'utf8')),
    ].join('\n');
    assert.doesNotMatch(frontend, new RegExp(ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV));

    const changedHandler = fs.readFileSync('api/asaas-webhook.ts', 'utf8');
    assert.match(changedHandler, new RegExp(ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV));
    for (const file of ['api/asaas-payments.ts', 'api/asaas-payment.ts', 'api/asaas-sync-open-payments.ts']) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), new RegExp(ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV));
    }
  });
});
