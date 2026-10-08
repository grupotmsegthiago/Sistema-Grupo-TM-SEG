import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildManualBilledInvoicePayloads,
  parseManualInvoiceAmount,
} from '../lib/financial/manualBilledInvoice.ts';
import { extractFaturaNumeroFromNotes } from '../lib/comissao/comissaoCore.ts';

test('Incluir Faturamento cria NF autorizada e o mesmo título em Contas a Receber', () => {
  const payloads = buildManualBilledInvoicePayloads({
    invoiceId: '11111111-1111-4111-8111-111111111111',
    clientId: 'client-1',
    clientName: 'Cliente Exemplo',
    number: 'NF-987',
    description: 'Serviços de escolta setembro/2026',
    amountText: '12.345,67',
    issueDate: '2026-10-01',
    dueDate: '2026-10-31',
    issuerCompany: 'TM GESTÃO',
    nfUrl: 'https://storage.test/nf-987.pdf',
    createdBy: 'Financeiro',
    nowIso: '2026-10-08T21:00:00.000Z',
  });

  assert.equal(payloads.invoice.number, 'NF-987');
  assert.equal(payloads.invoice.amount, 12345.67);
  assert.equal(payloads.invoice.nf_status, 'AUTHORIZED');
  assert.equal(payloads.invoice.nf_provider, 'MANUAL');
  assert.equal(payloads.invoice.nf_image_url, 'https://storage.test/nf-987.pdf');
  assert.equal(payloads.invoice.status, 'EMITIDA');

  assert.equal(payloads.receivable.amount, 12345.67);
  assert.equal(payloads.receivable.status, 'PENDING');
  assert.equal(payloads.receivable.amount_open, 12345.67);
  assert.equal(payloads.receivable.entity_id, 'client-1');
  assert.equal(
    extractFaturaNumeroFromNotes(String(payloads.receivable.notes), String(payloads.receivable.description)),
    'NF-987',
  );
});

test('valida valor, campos obrigatórios e datas do faturamento manual', () => {
  assert.equal(parseManualInvoiceAmount('R$ 1.234,56'), 1234.56);
  assert.equal(parseManualInvoiceAmount('1234.56'), 1234.56);
  assert.throws(() => parseManualInvoiceAmount('0'), /valor de faturamento válido/);
  assert.throws(() => buildManualBilledInvoicePayloads({
    invoiceId: 'id',
    clientName: 'Cliente',
    number: '',
    description: 'Serviço',
    amountText: '100',
    issueDate: '2026-10-08',
    dueDate: '2026-10-08',
    issuerCompany: 'TM GESTÃO',
    nfUrl: 'https://storage.test/nf.pdf',
    createdBy: 'Financeiro',
  }), /número da NF/);
  assert.throws(() => buildManualBilledInvoicePayloads({
    invoiceId: 'id',
    clientName: 'Cliente',
    number: '10',
    description: 'Serviço',
    amountText: '100',
    issueDate: '2026-10-08',
    dueDate: '2026-10-07',
    issuerCompany: 'TM GESTÃO',
    nfUrl: 'https://storage.test/nf.pdf',
    createdBy: 'Financeiro',
  }), /vencimento não pode ser anterior/);
});

test('Controle de NF possui inclusão separada, upload e rollback', () => {
  const control = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
  const dialog = fs.readFileSync('components/ManualBilledInvoiceDialog.tsx', 'utf8');
  assert.match(control, /Incluir Faturamento/);
  assert.match(control, /ManualBilledInvoiceDialog/);
  assert.match(dialog, /financial-invoices\/manual/);
  assert.match(dialog, /mission-evidence/);
  assert.match(dialog, /financial_invoices/);
  assert.match(dialog, /financial_transactions/);
  assert.match(dialog, /Esta NF já está cadastrada/);
  assert.match(dialog, /financial_invoices'\)\.delete/);
  assert.match(dialog, /storage\.from\('mission-evidence'\)\.remove/);
  assert.doesNotMatch(dialog, /asaas-create-charge|schedule-invoice|create-charge/);
  assert.match(dialog, /import React/);
  assert.match(control, /import React/);
});
