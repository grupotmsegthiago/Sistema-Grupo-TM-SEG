import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertManualPaymentInput,
  shouldKeepManualPaidStatus,
} from '../lib/invoiceManualPayment.ts';

const valid = {
  invoiceId: '11111111-1111-4111-8111-111111111111',
  paymentDate: '2026-09-28',
  evidenceUrl: 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/extrato.png',
  registeredBy: 'Thiago Moreira',
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
    assert.doesNotMatch(payload, /amount/);
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
