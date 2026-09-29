import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertManualPaymentInput,
  classifyManualPaymentAmount,
  shouldKeepManualPaidStatus,
} from '../lib/invoiceManualPayment.ts';

const valid = {
  invoiceId: '11111111-1111-4111-8111-111111111111',
  paymentDate: '2026-09-28',
  evidenceUrl: 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/extrato.png',
  registeredBy: 'Thiago Moreira',
  invoiceAmount: 1000,
  receivedAmount: '1.000,00',
  reason: 'Pagamento do boleto conferido no extrato',
};

describe('baixa manual de fatura', () => {
  it('aceita evidência, data e quem registrou sem mexer no valor', () => {
    assert.doesNotThrow(() => assertManualPaymentInput(valid, '2026-09-29'));
    const sql = fs.readFileSync('migrations/2026_09_29_invoice_manual_payment.sql', 'utf8');
    assert.match(sql, /status = 'PAGA'/);
    assert.match(sql, /manual_payment_by/);
    assert.match(sql, /manual_payment_at/);
    assert.match(sql, /manual_payment_evidence_url/);
    assert.doesNotMatch(sql, /amount\s*=/);
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(ui, /Baixa/);
    assert.match(ui, /InvoiceManualPaymentDialog/);
    const dialog = fs.readFileSync('components/InvoiceManualPaymentDialog.tsx', 'utf8');
    assert.match(dialog, /from 'react'/);
    assert.match(dialog, /\/api\/nf\/manual-payment/);
    const payload = dialog.slice(dialog.indexOf('JSON.stringify'), dialog.indexOf('});', dialog.indexOf('JSON.stringify')));
    assert.match(payload, /receivedAmount/);
    assert.match(payload, /reason/);
    assert.doesNotMatch(payload, /\bamount\s*:/);
    const sync = fs.readFileSync('migrations/2026_09_29_invoice_manual_payment_sync.sql', 'utf8');
    assert.match(sync, /doc_comprovante_url/);
    assert.match(sync, /Juros/);
    assert.match(sync, /payment_date = p_payment_date/);
    assert.doesNotMatch(sync, /paid_date/);
    assert.doesNotMatch(sync, /\bamount\s*=/);
  });

  it('valor igual pede motivo e valor maior vira juros, sem alterar o principal', () => {
    const normal = classifyManualPaymentAmount(22048.96, '22.048,96');
    assert.equal(normal.kind, 'normal');
    assert.equal(normal.interest, 0);
    assert.equal(normal.principal, 22048.96);
    assert.throws(() => assertManualPaymentInput({ ...valid, reason: 'ok' }, '2026-09-29'), /motivo/);
    const juros = classifyManualPaymentAmount(1000, '1.150,00');
    assert.equal(juros.kind, 'juros');
    assert.equal(juros.interest, 150);
    assert.equal(juros.principal, 1000);
    assert.doesNotThrow(() => assertManualPaymentInput({
      ...valid,
      invoiceAmount: 1000,
      receivedAmount: '1.150,00',
      reason: '',
    }, '2026-09-29'));
    assert.throws(() => classifyManualPaymentAmount(1000, '900,00'), /menor/);
  });

  it('recusa baixa sem extrato, sem data ou com data futura', () => {
    assert.throws(() => assertManualPaymentInput({ ...valid, evidenceUrl: '' }, '2026-09-29'), /extrato/);
    assert.throws(() => assertManualPaymentInput({ ...valid, paymentDate: '' }, '2026-09-29'), /data do pagamento/);
    assert.throws(() => assertManualPaymentInput({ ...valid, paymentDate: '2026-10-02' }, '2026-09-29'), /futura/);
    assert.throws(() => assertManualPaymentInput({ ...valid, registeredBy: ' ' }, '2026-09-29'), /quem registrou/);
  });

  it('o sync do Asaas não desfaz a baixa manual enquanto o Asaas não confirmar', () => {
    assert.equal(shouldKeepManualPaidStatus('2026-09-29T18:00:00.000Z', false), true);
    assert.equal(shouldKeepManualPaidStatus('2026-09-29T18:00:00.000Z', true), false);
    assert.equal(shouldKeepManualPaidStatus(null, false), false);
    const sync = fs.readFileSync('lib/asaasSyncPaymentStatusCore.ts', 'utf8');
    assert.match(sync, /shouldKeepManualPaidStatus/);
  });
});
