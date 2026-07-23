import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { INVOICE_CONTROL_EPOCH, isAfterInvoiceControlEpoch } from '../lib/invoiceCleanSlate';

describe('Controle de Faturas — excluir fila antiga / epoch', () => {
  it('epoch esconde faturas antigas e aceita novas', () => {
    assert.equal(isAfterInvoiceControlEpoch('2026-07-01T12:00:00.000Z'), false);
    assert.equal(isAfterInvoiceControlEpoch('2026-07-23T20:00:00.000Z'), true);
    assert.equal(isAfterInvoiceControlEpoch(null, '2026-06-01'), false);
    assert.ok(INVOICE_CONTROL_EPOCH.startsWith('2026-07-23'));
  });

  it('UI filtra por epoch e chama handler leve clean-slate', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(ui, /isAfterInvoiceControlEpoch/);
    assert.match(ui, /\/api\/nf\/ensure-clean-slate/);
    assert.doesNotMatch(ui, /btn-clear-all-open/);
    assert.match(ui, /import React,/);
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /ensure-clean-slate/);
    assert.match(vercel, /nf-control\?op=clean-slate/);
    const api = fs.readFileSync('api/nf-control.ts', 'utf8');
    assert.match(api, /wipeOpenInvoicesCleanSlate/);
    assert.match(api, /clean-slate/);
    const lib = fs.readFileSync('lib/nfInvoiceControlApi.ts', 'utf8');
    assert.match(lib, /wipeOpenInvoicesCleanSlate/);
    assert.match(lib, /\.lt\('created_at', INVOICE_CONTROL_EPOCH\)/);
    assert.match(lib, /\.in\('id', ids\)/);
  });
});
