import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { handleFinancialTransactionPaymentsRequest } from '../api/financial-transaction-payments.ts';
import { handleFinancialPaymentsInitRequest } from '../api/financial-payments-init.ts';
import {
  financialPaymentsMigrationSql,
  isFinancialPaymentsPolicyStatement,
  selectFinancialPaymentsBootstrapStatements,
} from '../lib/financial/ensurePaymentTables.ts';
import { createReceivablePaymentsOps } from '../lib/financial/receivablePaymentsApiCore.ts';
import { financialPaymentsApiDeniedStatus } from '../lib/financial/financialPaymentsApiAuth.ts';

const read = (file: string) => fs.readFileSync(file, 'utf8');

function walkFiles(dir: string, ext: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(full, ext);
    return entry.name.endsWith(ext) ? [full] : [];
  });
}

type ResponseState = {
  status: number;
  body: any;
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

function createMockStore(seed: any[] = []) {
  const payments = [...seed];
  const calls = { select: 0, insert: 0, delete: 0, update: 0 };
  const client = {
    from(table: string) {
      if (table === 'financial_transaction_payments') {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({ error: null });
              },
              eq(_col: string, transactionId: string) {
                return {
                  order() {
                    return {
                      order() {
                        calls.select += 1;
                        return Promise.resolve({
                          data: payments.filter((p) => p.transaction_id === transactionId),
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
          insert(rows: any[]) {
            calls.insert += 1;
            const row = { id: 'pay-1', created_at: '2026-08-17T00:00:00.000Z', ...rows[0] };
            payments.unshift(row);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: row, error: null });
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq(_col: string, id: string) {
                calls.delete += 1;
                const idx = payments.findIndex((p) => p.id === id);
                if (idx >= 0) payments.splice(idx, 1);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      return {
        update() {
          return {
            eq() {
              calls.update += 1;
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client, payments, calls };
}

describe('F4-P0-RLS — consumidores financial_transaction_payments migrados', () => {
  it('receivablePaymentsClient não usa Supabase direto na tabela de pagamentos', () => {
    const src = read('lib/financial/receivablePaymentsClient.ts');
    assert.match(src, /authFetch/);
    assert.match(src, /\/api\/financial-transaction-payments/);
    assert.doesNotMatch(src, /from\(['"]financial_transaction_payments['"]\)/);
    assert.doesNotMatch(src, /from '\.\.\/supabase'/);
  });

  it('confirmReceivablePayClient faz um único INSERT lógico via addPaymentToTransaction', () => {
    const src = read('lib/financial/confirmReceivablePayClient.ts');
    assert.match(src, /addPaymentToTransaction/);
    assert.equal((src.match(/addPaymentToTransaction\(/g) || []).length, 1);
    assert.doesNotMatch(src, /from\(['"]financial_transaction_payments['"]\)/);
  });

  it('financial-payments-init é fail-closed (auth obrigatória)', () => {
    const src = read('api/financial-payments-init.ts');
    assert.match(src, /denyFinancialPaymentsApiUnlessAuthorized/);
    assert.match(src, /financialPaymentsApiDeniedStatus/);
  });

  it('ensurePaymentTables não recria policy Allow all', () => {
    const sql = financialPaymentsMigrationSql();
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.financial_transaction_payments/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
    assert.doesNotMatch(sql, /DROP POLICY/);
    assert.doesNotMatch(sql, /Allow all for financial_transaction_payments/);
    const historical = `
CREATE POLICY "Allow all for financial_transaction_payments" ON public.financial_transaction_payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.financial_transaction_payments (id uuid);
`;
    assert.equal(isFinancialPaymentsPolicyStatement(historical.split(';')[0]), true);
    const filtered = selectFinancialPaymentsBootstrapStatements(historical);
    assert.equal(filtered.some((s) => /create\s+policy/i.test(s)), false);
    assert.equal(filtered.some((s) => /CREATE TABLE/i.test(s)), true);
    const runner = read('lib/financial/ensurePaymentTables.ts');
    assert.match(runner, /selectFinancialPaymentsBootstrapStatements/);
  });

  it('nenhum frontend de runtime usa supabase.from na tabela de pagamentos', () => {
    const hits = [
      ...walkFiles('components', '.tsx'),
      ...walkFiles('lib', '.ts'),
    ].filter((file) => {
      if (file.includes('receivablePaymentsApiCore.ts')) return false;
      if (file.includes('ensurePaymentTables.ts')) return false;
      const src = read(file);
      return /from\(['"]financial_transaction_payments['"]\)/.test(src);
    });
    assert.deepEqual(hits, []);
  });

  it('modais e lista preservam a interface pública', () => {
    const modal = read('components/ReceivablePaymentsModal.tsx');
    const confirm = read('components/ReceivablePayConfirmModal.tsx');
    const list = read('components/FinancialTransactionList.tsx');
    assert.match(modal, /listPaymentsForTransaction/);
    assert.match(modal, /addPaymentToTransaction/);
    assert.match(modal, /deletePaymentFromTransaction/);
    assert.match(confirm, /confirmReceivablePayment/);
    assert.match(list, /ReceivablePaymentsModal/);
    assert.match(list, /ReceivablePayConfirmModal/);
    assert.match(list, /\/api\/financial-payments-init/);
  });
});

describe('API financial-transaction-payments', () => {
  it('GET/POST/DELETE sem auth → 401', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const { res, state } = mockResponse();
      await handleFinancialTransactionPaymentsRequest(
        { method, query: { transactionId: 'tx-1' }, headers: {} },
        res,
        { authorize: async () => 'Não autorizado' },
      );
      assert.equal(state.status, 401, method);
      assert.deepEqual(state.body, { error: 'Não autorizado' });
    }
  });

  it('token inválido → 401 e role errada → 403', async () => {
    const invalid = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      { method: 'GET', query: { transactionId: 'tx-1' } },
      invalid.res,
      { authorize: async () => 'Não autorizado' },
    );
    assert.equal(invalid.state.status, 401);

    const forbidden = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      { method: 'GET', query: { transactionId: 'tx-1' } },
      forbidden.res,
      { authorize: async () => 'Permissão negada' },
    );
    assert.equal(forbidden.state.status, 403);
    assert.equal(financialPaymentsApiDeniedStatus('Permissão negada'), 403);
  });

  it('método inválido → 405 + Allow', async () => {
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest({ method: 'PUT' }, res, {
      authorize: async () => null,
    });
    assert.equal(state.status, 405);
    assert.equal(state.headers.Allow, 'GET, POST, DELETE');
    assert.deepEqual(state.body, { error: 'method_not_allowed' });
  });

  it('payload inválido → 400', async () => {
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      { method: 'POST', body: { transactionId: '', amount: 0 } },
      res,
      { authorize: async () => null, createOps: () => createReceivablePaymentsOps({ from() {} }) },
    );
    assert.equal(state.status, 400);
  });

  it('GET sem transactionId → 400', async () => {
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest({ method: 'GET', query: {} }, res, {
      authorize: async () => null,
      createOps: () => createReceivablePaymentsOps({ from() {} }),
    });
    assert.equal(state.status, 400);
  });

  it('list legítimo → SELECT uma vez', async () => {
    const store = createMockStore([
      { id: 'p1', transaction_id: 'tx-1', amount: 10, payment_date: '2026-08-17' },
    ]);
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      { method: 'GET', query: { transactionId: 'tx-1' } },
      res,
      { authorize: async () => null, createOps: () => createReceivablePaymentsOps(store.client) },
    );
    assert.equal(state.status, 200);
    assert.equal(state.body.payments.length, 1);
    assert.equal(store.calls.select, 1);
    assert.equal(store.calls.insert, 0);
  });

  it('add legítimo → INSERT uma vez', async () => {
    const store = createMockStore();
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      {
        method: 'POST',
        body: {
          transactionId: 'tx-1',
          titleAmount: 100,
          amount: 40,
          paymentDate: '2026-08-17',
        },
      },
      res,
      { authorize: async () => null, createOps: () => createReceivablePaymentsOps(store.client) },
    );
    assert.equal(state.status, 200);
    assert.equal(store.calls.insert, 1);
    assert.equal(state.body.paid, 40);
    assert.equal(state.body.open, 60);
    assert.equal(state.body.status, 'PARTIALLY_PAID');
  });

  it('delete legítimo → DELETE uma vez', async () => {
    const store = createMockStore([
      { id: 'p1', transaction_id: 'tx-1', amount: 40, payment_date: '2026-08-17' },
    ]);
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      {
        method: 'DELETE',
        query: { id: 'p1', transactionId: 'tx-1' },
        body: { titleAmount: 100 },
      },
      res,
      { authorize: async () => null, createOps: () => createReceivablePaymentsOps(store.client) },
    );
    assert.equal(state.status, 200);
    assert.equal(store.calls.delete, 1);
    assert.equal(state.body.paid, 0);
    assert.equal(state.body.open, 100);
  });

  it('erro backend → contrato coerente', async () => {
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      { method: 'GET', query: { transactionId: 'tx-1' } },
      res,
      {
        authorize: async () => null,
        createOps: () => ({
          listPaymentsForTransaction: async () => {
            throw new Error('boom');
          },
          addPaymentToTransaction: async () => {
            throw new Error('boom');
          },
          deletePaymentFromTransaction: async () => {
            throw new Error('boom');
          },
        }),
      },
    );
    assert.equal(state.status, 500);
    assert.deepEqual(state.body, { error: 'boom' });
  });

  it('transação inexistente (FK) preserva erro do backend', async () => {
    const { res, state } = mockResponse();
    await handleFinancialTransactionPaymentsRequest(
      {
        method: 'POST',
        body: { transactionId: 'missing', titleAmount: 10, amount: 5, paymentDate: '2026-08-17' },
      },
      res,
      {
        authorize: async () => null,
        createOps: () => ({
          listPaymentsForTransaction: async () => [],
          addPaymentToTransaction: async () => {
            throw new Error('insert or update on table violates foreign key constraint');
          },
          deletePaymentFromTransaction: async () => {
            throw new Error('unused');
          },
        }),
      },
    );
    assert.equal(state.status, 404);
    assert.match(String(state.body.error), /foreign key/);
  });
});

describe('API financial-payments-init', () => {
  it('GET/POST sem auth → 401 e não executa init', async () => {
    let ran = false;
    for (const method of ['GET', 'POST']) {
      ran = false;
      const { res, state } = mockResponse();
      await handleFinancialPaymentsInitRequest({ method, headers: {} }, res, {
        authorize: async () => 'Não autorizado',
        ensure: async () => {
          ran = true;
          return { ok: true, exists: true };
        },
      });
      assert.equal(state.status, 401, method);
      assert.equal(ran, false, method);
    }
  });

  it('role errada → 403 e não executa init', async () => {
    let ran = false;
    const { res, state } = mockResponse();
    await handleFinancialPaymentsInitRequest({ method: 'POST' }, res, {
      authorize: async () => 'Permissão negada',
      ensure: async () => {
        ran = true;
        return { ok: true, exists: true };
      },
    });
    assert.equal(state.status, 403);
    assert.equal(ran, false);
  });
});

describe('Vercel — handler leve sem nova function', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites: Array<{ source: string; destination: string }> = vercel.rewrites || [];
  const catchAllIndex = rewrites.findIndex((rewrite) => rewrite.source === '/api/(.*)');

  it('não adiciona entrada em functions{}', () => {
    assert.equal(Object.keys(vercel.functions || {}).length, 50);
    assert.equal(Object.hasOwn(vercel.functions || {}, 'api/financial-transaction-payments.ts'), false);
    assert.equal(Object.hasOwn(vercel.functions || {}, 'api/financial-payments-init.ts'), false);
  });

  it('rewrites dedicados ficam antes do catch-all', () => {
    for (const source of [
      '/api/financial-transaction-payments',
      '/api/financial-transaction-payments/:id',
      '/api/financial-payments-init',
    ]) {
      const index = rewrites.findIndex((rewrite) => rewrite.source === source);
      assert.ok(index >= 0, `rewrite ausente: ${source}`);
      assert.ok(index < catchAllIndex, `${source} cai no catch-all`);
    }
  });
});
