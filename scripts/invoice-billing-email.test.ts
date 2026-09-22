import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { takeFirstEmailRecipients } from '../lib/email/recipientList';
import {
  INVOICE_BILLING_EMAIL_AUTO_FROM,
  INVOICE_BILLING_EMAIL_RESEND_FROM,
  INVOICE_BILLING_EMAIL_RESEND_TO,
  brtDayEndExclusiveUtc,
  brtDayStartUtc,
  invoiceReadyForBillingEmail,
  pickMedicaoRecipients,
} from '../lib/billing/invoiceBillingEmailPolicy';

describe('E-mail automático da fatura', () => {
  it('fica só com os dois primeiros e-mails do responsável financeiro', () => {
    assert.deepEqual(
      takeFirstEmailRecipients(' a@cliente.com ; B@cliente.com, c@cliente.com ', 2),
      ['a@cliente.com', 'b@cliente.com'],
    );
    assert.deepEqual(
      pickMedicaoRecipients('ILGJ LOGISTICA E TRANSPORTE LTDA', [
        {
          name: 'ILGJ LOGISTICA E TRANSPORTE LTDA.',
          trading_name: 'ILGJ LOGISTICA E TRANSPORTE LTDA.',
          status: 'Ativo',
          medicao_email: 'um@ilgj.com, dois@ilgj.com, tres@ilgj.com',
        },
      ]),
      ['um@ilgj.com', 'dois@ilgj.com'],
    );
  });

  it('não envia fatura cancelada e exige NF; boleto só quando não é transferência', () => {
    assert.equal(invoiceReadyForBillingEmail({
      status: 'CANCELADA',
      asaas_payment_id: 'pay_1',
      nf_image_url: 'https://nf',
      asaas_bankslip_url: 'https://boleto',
      client: 'CLIENTE',
    }).ok, false);
    assert.equal(invoiceReadyForBillingEmail({
      status: 'EMITIDA',
      asaas_payment_id: 'pay_1',
      nf_image_url: 'https://nf',
      client: 'CEVA LOGISTICS',
    }).ok, true);
    assert.equal(invoiceReadyForBillingEmail({
      status: 'EMITIDA',
      asaas_payment_id: 'pay_1',
      nf_image_url: 'https://nf',
      client: 'RONDOLOG',
    }).ok, false);
  });

  it('recorta 01/09 a 15/09 em horário de Brasília e deixa o automático a partir de 22/09', () => {
    assert.equal(brtDayStartUtc(INVOICE_BILLING_EMAIL_RESEND_FROM), '2026-09-01T03:00:00.000Z');
    assert.equal(brtDayEndExclusiveUtc(INVOICE_BILLING_EMAIL_RESEND_TO), '2026-09-16T03:00:00.000Z');
    assert.equal(INVOICE_BILLING_EMAIL_AUTO_FROM, '2026-09-22');
    const cron = fs.readFileSync('server/registerCronRoutes.ts', 'utf8');
    assert.match(cron, /runPendingInvoiceBillingEmails/);
    assert.match(cron, /INVOICE_BILLING_EMAIL_RESEND_FROM/);
    assert.match(cron, /INVOICE_BILLING_EMAIL_RESEND_TO/);
    const worker = fs.readFileSync('server/nfRetryWorker.ts', 'utf8');
    assert.match(worker, /sendInvoiceBillingEmail/);
  });
});
