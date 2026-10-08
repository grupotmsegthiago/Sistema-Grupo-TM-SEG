import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  extractAsaasReceiptDetails,
  normalizeAsaasReceipt,
  syncAsaasReceiptToReceivables,
  upsertAsaasReceiptNote,
} from '../lib/asaasReceiptDetails.ts';
import {
  findInvoiceForReceivable,
  invoiceNfUrl,
} from '../lib/financial/receivableInvoiceLink.ts';

test('normaliza valor pago, data, juros/multa, líquido, tarifa e desconto do Asaas', () => {
  const late = normalizeAsaasReceipt({
    id: 'pay_late',
    status: 'RECEIVED',
    originalValue: 100,
    value: 112,
    interestValue: 12,
    netValue: 109,
    paymentDate: '2026-10-08',
    customerPaymentDate: '2026-10-07',
  });
  assert.deepEqual(late, {
    paymentId: 'pay_late',
    paidAmount: 112,
    paymentDate: '2026-10-07',
    originalAmount: 100,
    interestAndFineAmount: 12,
    discountAmount: 0,
    netAmount: 109,
    feeAmount: 3,
    status: 'RECEIVED',
  });

  const discounted = normalizeAsaasReceipt({
    id: 'pay_discount',
    status: 'CONFIRMED',
    originalValue: 100,
    value: 95,
    interestValue: 0,
    netValue: 93,
    confirmedDate: '2026-10-06',
  });
  assert.equal(discounted.discountAmount, 5);
  assert.equal(discounted.feeAmount, 2);
  assert.equal(discounted.paymentDate, '2026-10-06');
});

test('não inventa valor ou data quando o Asaas não os enviou', () => {
  assert.throws(
    () => normalizeAsaasReceipt({ id: 'pay_no_value', status: 'RECEIVED', paymentDate: '2026-10-08' }),
    /sem valor recebido/,
  );
  assert.throws(
    () => normalizeAsaasReceipt({ id: 'pay_no_date', status: 'RECEIVED', value: 100 }),
    /sem data de pagamento/,
  );
});

test('marcador é idempotente e preserva histórico de pagamentos parciais', () => {
  const details = normalizeAsaasReceipt({
    id: 'pay_1',
    status: 'RECEIVED',
    value: 105,
    originalValue: 100,
    interestValue: 5,
    netValue: 102,
    paymentDate: '2026-10-08',
  });
  const partial = '<!--TMSEG_PAYMENTS-->[{"id":"partial-1","amount":20}]';
  const first = upsertAsaasReceiptNote(`Fatura 10\n\n${partial}`, details);
  const second = upsertAsaasReceiptNote(first, details);
  assert.equal(second, first);
  assert.match(first, /Fatura 10/);
  assert.match(first, /TMSEG_PAYMENTS/);
  assert.deepEqual(extractAsaasReceiptDetails(first), details);
});

test('baixa atualiza Contas a Receber com valor e data oficiais sem alterar amount', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; id: string }> = [];
  const client = {
    from(table: string) {
      if (table !== 'financial_transactions') throw new Error(`Tabela inesperada: ${table}`);
      return {
        select() {
          const chain = {
            eq() { return chain; },
            async or() {
              return {
                data: [{ id: 'tx-1', amount: 100, notes: 'Fatura 10' }],
                error: null,
              };
            },
          };
          return chain;
        },
        update(payload: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              updates.push({ table, payload, id });
              return { error: null };
            },
          };
        },
      };
    },
  };
  const result = await syncAsaasReceiptToReceivables(
    client,
    { id: 'inv-1', number: '10', notes: '' },
    {
      id: 'pay_10',
      status: 'RECEIVED',
      value: 112,
      originalValue: 100,
      interestValue: 12,
      netValue: 109,
      customerPaymentDate: '2026-10-07',
    },
  );
  assert.equal(result.transactions, 1);
  assert.equal(updates[0].payload.status, 'PAID');
  assert.equal(updates[0].payload.payment_date, '2026-10-07');
  assert.equal(updates[0].payload.amount_paid, 112);
  assert.equal(updates[0].payload.amount_open, 0);
  assert.equal('amount' in updates[0].payload, false);
  assert.equal(extractAsaasReceiptDetails(String(updates[0].payload.notes))?.interestAndFineAmount, 12);
});

test('Contas a Receber encontra a mesma nota fiscal do Controle de NF', () => {
  const invoices = [
    {
      id: 'inv-10',
      number: 'NF-10',
      asaas_payment_id: 'pay_10',
      nf_status: 'AUTHORIZED',
      nf_image_url: 'https://storage.test/nf-10.pdf',
      asaas_invoice_url: 'https://asaas.test/invoice-10',
    },
    {
      id: 'inv-11',
      number: 'NF-11',
      asaas_payment_id: 'pay_11',
      nf_status: 'AUTHORIZED',
      asaas_invoice_url: 'https://asaas.test/invoice-11',
    },
  ];
  const byNumber = findInvoiceForReceivable('nf-10', '', invoices);
  assert.equal(byNumber?.id, 'inv-10');
  assert.equal(invoiceNfUrl(byNumber), 'https://storage.test/nf-10.pdf');

  const byPayment = findInvoiceForReceivable(null, 'Cobrança Asaas pay_11', invoices);
  assert.equal(byPayment?.id, 'inv-11');
  assert.equal(invoiceNfUrl(byPayment), 'https://asaas.test/invoice-11');

  assert.equal(invoiceNfUrl({ id: 'pending', nf_status: 'PROCESSING' }), null);
});

test('webhook, sincronizações e tela usam a mesma fonte de detalhes', () => {
  for (const path of [
    'lib/asaasWebhookCore.ts',
    'lib/asaasSyncPaymentStatusCore.ts',
    'lib/asaasSyncOpenPaymentsCore.ts',
  ]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /syncAsaasReceiptToReceivables/);
    assert.match(source, /upsertAsaasReceiptNote/);
  }
  const ui = fs.readFileSync('components/FinancialTransactionList.tsx', 'utf8');
  assert.match(ui, /extractAsaasReceiptDetails/);
  assert.match(ui, /Juros\/multa/);
  assert.match(ui, /Tarifa Asaas/);
  assert.match(ui, /Abrir nota fiscal/);
  assert.match(ui, /findInvoiceForReceivable/);
  assert.match(ui, /import React/);
});
