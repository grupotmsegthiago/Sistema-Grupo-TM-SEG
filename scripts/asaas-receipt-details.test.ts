import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  extractAsaasReceiptDetails,
  normalizeAsaasReceipt,
  syncAsaasReceiptToReceivables,
  upsertAsaasReceiptNote,
} from '../lib/asaasReceiptDetails.ts';
import { comprovanteAsaasDaFatura, comprovantesJaGravados, decidirComprovante, faturaCitadaNoTexto } from '../lib/financial/avisoComprovante.ts';
import { caminhoComprovanteTorres, resolverComprovantesAoVivo } from '../lib/comissao/comprovantesComissao.ts';
import {
  findInvoiceForReceivable,
  invoiceNfUrl,
} from '../lib/financial/receivableInvoiceLink.ts';
import {
  getGrossReceivedAmount,
  getNetCreditedAmount,
  getScheduledNetCreditAmount,
} from '../lib/financial/transactionAmounts.ts';
import {
  buildDailyCashFlow,
  computeCashKpis,
} from '../lib/dashboardDiretoria/aggregations.ts';
import { getCashMovementDate } from '../lib/dashboardDiretoria/periodUtils.ts';

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
    creditDate: null,
    availability: 'AVAILABLE',
    receiptUrl: null,
  });

  const discounted = normalizeAsaasReceipt({
    id: 'pay_discount',
    status: 'CONFIRMED',
    originalValue: 100,
    value: 95,
    interestValue: 0,
    netValue: 93,
    confirmedDate: '2026-10-06',
    creditDate: '2026-10-07',
  });
  assert.equal(discounted.discountAmount, 5);
  assert.equal(discounted.feeAmount, 2);
  assert.equal(discounted.paymentDate, '2026-10-06');
  assert.equal(discounted.availability, 'SCHEDULED');
  assert.equal(discounted.creditDate, '2026-10-07');
  assert.equal(discounted.receiptUrl, null);
});

test('guarda o comprovante https da integração e descarta texto solto', () => {
  const withUrl = normalizeAsaasReceipt({
    id: 'pay_url',
    status: 'RECEIVED',
    value: 100,
    paymentDate: '2026-10-08',
    transactionReceiptUrl: 'https://www.asaas.com/comprovantes/pay_url',
  });
  assert.equal(withUrl.receiptUrl, 'https://www.asaas.com/comprovantes/pay_url');
  const junk = normalizeAsaasReceipt({
    id: 'pay_junk',
    status: 'RECEIVED',
    value: 100,
    paymentDate: '2026-10-08',
    transactionReceiptUrl: 'sem-link',
  });
  assert.equal(junk.receiptUrl, null);
  const notes = upsertAsaasReceiptNote('', withUrl);
  assert.equal(extractAsaasReceiptDetails(notes)?.receiptUrl, withUrl.receiptUrl);
});

test('aviso de comprovante só para o financeiro e some quando a integração trouxe o link', () => {
  const sem = decidirComprovante({
    exige: true,
    urls: [null, ''],
    perfilFinanceiro: true,
  });
  assert.equal(sem.link, null);
  assert.equal(sem.avisarFalta, true);
  const outroPerfil = decidirComprovante({
    exige: true,
    urls: [],
    perfilFinanceiro: false,
  });
  assert.equal(outroPerfil.avisarFalta, false);
  const comLink = decidirComprovante({
    exige: true,
    urls: ['https://www.asaas.com/comprovantes/p'],
    perfilFinanceiro: true,
  });
  assert.equal(comLink.link, 'https://www.asaas.com/comprovantes/p');
  assert.equal(comLink.avisarFalta, false);
  const aberto = decidirComprovante({ exige: false, urls: [], perfilFinanceiro: true });
  assert.equal(aberto.avisarFalta, false);
  const notes = upsertAsaasReceiptNote('NF TMSEG-1', normalizeAsaasReceipt({
    id: 'pay_nf',
    status: 'RECEIVED',
    value: 50,
    paymentDate: '2026-10-08',
    transactionReceiptUrl: 'https://www.asaas.com/comprovantes/pay_nf',
  }));
  assert.equal(
    comprovanteAsaasDaFatura(notes, 'Recebimento TMSEG-1', 'TMSEG-1'),
    'https://www.asaas.com/comprovantes/pay_nf',
  );
  const lista = fs.readFileSync('components/FinancialTransactionList.tsx', 'utf8');
  const comissao = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
  assert.match(lista, /Falta anexar o comprovante/);
  assert.match(lista, /isFinanceProfileRole/);
  assert.match(comissao, /Falta anexar o comprovante/);
  assert.match(comissao, /isFinanceProfileRole/);
  assert.match(comissao, /\/api\/comissoes\/comprovantes/);
  assert.match(fs.readFileSync('lib/comissao/comissaoService.ts', 'utf8'), /doc_comprovante_url: comprovanteUrl/);
  assert.equal(faturaCitadaNoTexto('saldo 200.000 e nf 1200', '200'), false);
  assert.equal(faturaCitadaNoTexto('NF 200 recebida', '200'), true);
  const gravados = comprovantesJaGravados({
    comissoes: [
      { id: 'c-200', empresa_origem: 'TORRES', fatura_numero: '200', origem_fatura_id: '200' },
      { id: 'c-tm', empresa_origem: 'TM_SEG', fatura_numero: 'TMSEG-INV-1', fatura_id: 'fat-1' },
    ],
    faturas: [{
      id: 'fat-1',
      number: 'TMSEG-INV-1',
      notes: '',
      manual_payment_evidence_url: 'https://arquivos.exemplo/manual.pdf',
      asaas_payment_id: 'pay_abc',
    }],
    titulos: [{ description: 'saldo 200.000', notes: '', doc_comprovante_url: 'https://arquivos.exemplo/errado.pdf' }],
  });
  assert.equal(gravados.urls['c-200'], undefined);
  assert.equal(gravados.urls['c-tm'], 'https://arquivos.exemplo/manual.pdf');
  assert.equal(gravados.pendentes.find((item) => item.id === 'c-200')?.torresOrigemId, '200');
});

test('comprovante ao vivo usa o arquivo da TORRES ou a URL do Asaas', async () => {
  assert.equal(caminhoComprovanteTorres('200', 'invoices/200/recibo.pdf'), 'invoices/200/recibo.pdf');
  assert.equal(caminhoComprovanteTorres('200', 'invoices/201/recibo.pdf'), null);
  assert.equal(caminhoComprovanteTorres('200', '../segredo.pdf'), null);
  const torres = await resolverComprovantesAoVivo(
    [{ id: 'c-200', torresOrigemId: '200' }],
    {
      lerTorres: async () => ({ rows: [{ id: '200', comprovante_url: 'invoices/200/recibo.pdf' }], ok: true }),
      assinarTorres: async (path) => `https://arquivos.exemplo/${path}?token=1`,
      reciboAsaas: async () => { throw new Error('não deveria chamar o Asaas'); },
    },
  );
  assert.equal(torres.urls['c-200'], 'https://arquivos.exemplo/invoices/200/recibo.pdf?token=1');
  assert.equal(torres.completo, true);
  const asaas = await resolverComprovantesAoVivo(
    [{ id: 'c-tm', paymentId: 'pay_abc', company: 'TM GESTÃO' }],
    {
      lerTorres: async () => ({ rows: [], ok: true }),
      assinarTorres: async () => null,
      reciboAsaas: async (paymentId) => ({ url: `https://www.asaas.com/comprovantes/${paymentId}`, ok: true }),
    },
  );
  assert.equal(asaas.urls['c-tm'], 'https://www.asaas.com/comprovantes/pay_abc');
  const semChave = await resolverComprovantesAoVivo(
    [{ id: 'c-200', torresOrigemId: '200' }],
    {
      lerTorres: async () => ({ rows: [], ok: false }),
      assinarTorres: async () => null,
      reciboAsaas: async () => ({ url: null, ok: true }),
    },
  );
  assert.equal(semChave.urls['c-200'], undefined);
  assert.equal(semChave.completo, false);
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

test('fluxo separa recebido bruto, crédito líquido e crédito previsto', () => {
  const available = upsertAsaasReceiptNote('', normalizeAsaasReceipt({
    id: 'pay_available',
    status: 'RECEIVED',
    originalValue: 100,
    value: 112,
    interestValue: 12,
    netValue: 109,
    paymentDate: '2026-10-08',
    creditDate: '2026-10-08',
  }));
  assert.equal(getGrossReceivedAmount({ amount: 100, status: 'PAID', notes: available }), 112);
  assert.equal(getNetCreditedAmount({ amount: 100, status: 'PAID', notes: available }), 109);
  assert.equal(getScheduledNetCreditAmount({ amount: 100, status: 'PAID', notes: available }), 0);

  const scheduled = upsertAsaasReceiptNote('', normalizeAsaasReceipt({
    id: 'pay_scheduled',
    status: 'CONFIRMED',
    value: 100,
    netValue: 98,
    confirmedDate: '2026-10-08',
    creditDate: '2026-10-09',
  }));
  assert.equal(getGrossReceivedAmount({ amount: 100, status: 'PAID', notes: scheduled }), 100);
  assert.equal(getNetCreditedAmount({ amount: 100, status: 'PAID', notes: scheduled }), 0);
  assert.equal(getScheduledNetCreditAmount({ amount: 100, status: 'PAID', notes: scheduled }), 98);
});

test('caixa realizado usa crédito líquido e a data em que entrou no Asaas', () => {
  const receivedNotes = upsertAsaasReceiptNote('', normalizeAsaasReceipt({
    id: 'pay_received',
    status: 'RECEIVED',
    originalValue: 100,
    value: 112,
    interestValue: 12,
    netValue: 109,
    paymentDate: '2026-10-08',
    creditDate: '2026-10-09',
  }));
  const confirmedNotes = upsertAsaasReceiptNote('', normalizeAsaasReceipt({
    id: 'pay_confirmed',
    status: 'CONFIRMED',
    value: 100,
    netValue: 98,
    confirmedDate: '2026-10-08',
    creditDate: '2026-10-09',
  }));
  const transactions: any[] = [
    {
      id: 'tx-received', amount: 100, amount_paid: 112, type: 'INCOME', status: 'PAID',
      due_date: '2026-10-01', payment_date: '2026-10-08', notes: receivedNotes,
      category_id: 'receita', category_name: 'Receita',
    },
    {
      id: 'tx-confirmed', amount: 100, amount_paid: 100, type: 'INCOME', status: 'PAID',
      due_date: '2026-10-01', payment_date: '2026-10-08', notes: confirmedNotes,
      category_id: 'receita', category_name: 'Receita',
    },
  ];
  const period = { mode: 'month' as const, year: 2026, month: 9 };
  const cash = computeCashKpis([], transactions, [], [], period, new Date('2026-10-10T12:00:00-03:00'));
  assert.equal(cash.incomePaid, 109);
  assert.equal(getCashMovementDate(transactions[0]), '2026-10-09');
  const daily = buildDailyCashFlow(transactions, period, new Date('2026-10-10T12:00:00-03:00'));
  assert.deepEqual(daily, [{ day: '09/10', inflow: 109, outflow: 0 }]);
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
  assert.match(ui, /Tarifa/);
  assert.match(ui, /Data de Pagamento/);
  assert.match(ui, /Crédito Asaas/);
  assert.match(ui, /Cai em/);
  assert.match(ui, /asaas-value-breakdown/);
  assert.match(ui, /getGrossReceivedAmount/);
  assert.match(ui, /Abrir nota fiscal/);
  assert.match(ui, /findInvoiceForReceivable/);
  assert.match(ui, />NF \/ Fatura<\/th>/);
  assert.match(ui, /link-nf-receivable/);
  assert.match(ui, /import React/);
});

test('paginação retroativa percorre faturas pagas por cursor sem limite silencioso', () => {
  const core = fs.readFileSync('lib/asaasSyncOpenPaymentsCore.ts', 'utf8');
  const handler = fs.readFileSync('api/asaas-sync-open-payments.ts', 'utf8');
  const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
  assert.match(core, /retroactivePaid \? \['PAGA'\]/);
  assert.match(core, /\.gt\('id', cursor\)/);
  assert.match(core, /nextCursor/);
  assert.match(core, /checkedIds/);
  assert.match(handler, /queryRetroactivePaid/);
  assert.match(handler, /queryCursor/);
  assert.match(ui, /Sincronizar pagos antigos/);
  assert.match(ui, /seen\.has\(id\)/);
  assert.match(ui, /Paginação retroativa não avançou/);
});
