import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildReceivableCancelFilter,
  cancelFinancialInvoice,
  isAsaasChargeReceived,
  isMissingAsaasCharge,
  nfCancelTarget,
  type InvoiceCancelDb,
  type InvoiceCancelRow,
} from '../lib/invoiceCancelCore';

type UpdateCall = { table: string; patch: Record<string, unknown>; filters: unknown[] };

function fakeDb(invoice: InvoiceCancelRow | null): { db: InvoiceCancelDb; updates: UpdateCall[] } {
  const updates: UpdateCall[] = [];
  const db: InvoiceCancelDb = {
    from(table: string) {
      const state = { action: '', patch: {} as Record<string, unknown>, filters: [] as unknown[] };
      const api = {
        select() { return api; },
        update(patch: Record<string, unknown>) {
          state.action = 'update';
          state.patch = patch;
          return api;
        },
        eq(column: string, value: unknown) {
          state.filters.push(['eq', column, value]);
          return api;
        },
        in(column: string, values: readonly string[]) {
          state.filters.push(['in', column, values]);
          return api;
        },
        or(filters: string) {
          state.filters.push(['or', filters]);
          return api;
        },
        maybeSingle: async () => ({ data: table === 'financial_invoices' ? invoice : null, error: null }),
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          if (state.action === 'update') {
            updates.push({ table, patch: state.patch, filters: state.filters.slice() });
          }
          const data = table === 'financial_transactions' && state.action === 'update' ? [{ id: 'tx-1' }] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return api;
    },
  };
  return { db, updates };
}

const emitida: InvoiceCancelRow = {
  id: 'inv-1',
  number: 'TMSEG-20261002-172535-MKAM',
  status: 'EMITIDA',
  asaas_payment_id: 'pay_oycdmhj1qssv396m',
  asaas_invoice_id: 'inv_000023333152',
  issuer_company: 'TM GESTÃO',
  nf_status: 'AUTHORIZED',
  nf_provider: 'ASAAS',
};

describe('cancelamento de fatura', () => {
  it('acha o título pela observação Fatura e pelo id do Asaas', () => {
    const filter = buildReceivableCancelFilter('TMSEG-20261002-171920-LH6K', 'pay_d2pm9bo0ccxadhum');
    assert.match(filter || '', /Fatura TMSEG-20261002-171920-LH6K/);
    assert.match(filter || '', /pay_d2pm9bo0ccxadhum/);
    assert.equal(buildReceivableCancelFilter('', ''), null);
    assert.equal(buildReceivableCancelFilter(null, 'pay_abc'), 'notes.ilike.%pay_abc%');
  });

  it('só cancela NFS-e autorizada, no emissor que gravou a nota', () => {
    assert.equal(nfCancelTarget(emitida), 'asaas');
    assert.equal(nfCancelTarget({ ...emitida, nf_status: 'CANCELED' }), 'none');
    assert.equal(nfCancelTarget({ ...emitida, nf_status: 'SCHEDULED' }), 'none');
    assert.equal(nfCancelTarget({ ...emitida, nf_provider: 'PLUGNOTAS', plugnotas_invoice_id: 'pn-1' }), 'plugnotas');
    assert.equal(nfCancelTarget({ ...emitida, asaas_invoice_id: null }), 'missing-id');
    assert.equal(isAsaasChargeReceived('RECEIVED'), true);
    assert.equal(isAsaasChargeReceived('PENDING'), false);
    assert.equal(isMissingAsaasCharge(new Error('Asaas API Error (404): não encontrado')), true);
  });

  it('fatura paga não mexe em boleto nem nota', async () => {
    const { db, updates } = fakeDb({ ...emitida, status: 'PAGA' });
    let deleted = 0;
    const result = await cancelFinancialInvoice({
      sb: db,
      invoiceId: emitida.id,
      getPayment: async () => { throw new Error('não devia consultar'); },
      deletePayment: async () => { deleted += 1; return { deleted: true }; },
      cancelAsaasNf: async () => { throw new Error('não devia cancelar nota'); },
      cancelPlugnotasNf: async () => { throw new Error('não devia cancelar plugnotas'); },
    });
    assert.equal(result.httpStatus, 409);
    assert.equal(result.ok, false);
    assert.equal(deleted, 0);
    assert.equal(updates.length, 0);
  });

  it('cancela título, boleto e nota e zera só o em aberto', async () => {
    const { db, updates } = fakeDb(emitida);
    const calls: string[] = [];
    const result = await cancelFinancialInvoice({
      sb: db,
      invoiceId: emitida.id,
      getPayment: async () => { calls.push('get'); return { status: 'PENDING' }; },
      deletePayment: async (_id, company) => {
        calls.push(`delete:${company}`);
        return { deleted: true };
      },
      cancelAsaasNf: async (id) => { calls.push(`nf:${id}`); return { status: 'CANCELED' }; },
      cancelPlugnotasNf: async () => { throw new Error('não é plugnotas'); },
    });
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.receivablesUpdated, 1);
    assert.deepEqual(calls, ['get', 'delete:TM GESTÃO', 'nf:inv_000023333152']);
    const invoice = updates.find((u) => u.table === 'financial_invoices' && u.patch.status === 'CANCELADA');
    assert.equal(invoice?.patch.nf_retry_paused, true);
    const title = updates.find((u) => u.table === 'financial_transactions');
    assert.equal(title?.patch.status, 'CANCELLED');
    assert.equal(title?.patch.amount_open, 0);
    assert.equal('amount' in (title?.patch || {}), false);
    const filtro = title?.filters.find((f) => Array.isArray(f) && f[0] === 'or') as unknown[] | undefined;
    assert.match(String(filtro?.[1] || ''), /Fatura TMSEG-20261002-172535-MKAM/);
    assert.equal(updates.some((u) => u.table === 'financial_invoices' && u.patch.nf_status === 'CANCELED'), true);
    assert.equal(updates.some((u) => u.table === 'financial_invoices' && u.patch.asaas_status === 'DELETED'), true);
  });

  it('cobrança já recebida não é apagada no Asaas', async () => {
    const { db } = fakeDb(emitida);
    let deleted = 0;
    const result = await cancelFinancialInvoice({
      sb: db,
      invoiceId: emitida.id,
      getPayment: async () => ({ status: 'RECEIVED' }),
      deletePayment: async () => { deleted += 1; return { deleted: true }; },
      cancelAsaasNf: async () => ({ ok: true }),
      cancelPlugnotasNf: async () => ({ ok: true }),
    });
    assert.equal(deleted, 0);
    assert.equal(result.ok, false);
    assert.match(result.boleto.error || '', /já recebida/);
    assert.equal(result.nf.ok, true);
  });

  it('erro do boleto volta na resposta e a nota ainda é tentada', async () => {
    const { db, updates } = fakeDb({ ...emitida, asaas_invoice_id: 'inv_nf' });
    const result = await cancelFinancialInvoice({
      sb: db,
      invoiceId: emitida.id,
      getPayment: async () => ({ status: 'PENDING' }),
      deletePayment: async () => { throw new Error('Asaas API Error (400): cobrança não pode ser removida'); },
      cancelAsaasNf: async () => ({ ok: true }),
      cancelPlugnotasNf: async () => ({ ok: true }),
    });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.ok, false);
    assert.match(result.error || '', /não pode ser removida/);
    assert.equal(result.nf.status, 'CANCELED');
    assert.equal(updates.some((u) => u.patch.status === 'CANCELADA'), true);
  });

  it('o botão do Controle de NF chama a rota e não grava o título pela descrição', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const start = ui.indexOf('const handleCancelInvoice');
    const end = ui.indexOf('const handleRetryNf');
    const block = ui.slice(start, end);
    assert.match(block, /\/api\/nf\/cancel\//);
    assert.doesNotMatch(block, /ilike\('description'/);
  });
});
