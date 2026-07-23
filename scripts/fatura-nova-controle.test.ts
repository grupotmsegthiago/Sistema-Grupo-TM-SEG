import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAfterInvoiceControlEpoch, INVOICE_CONTROL_EPOCH } from '../lib/invoiceCleanSlate';

describe('Emissão nova aparece no Controle como Processando', () => {
  it('epoch usa só created_at (não esconde por date de competência)', () => {
    assert.equal(isAfterInvoiceControlEpoch('2026-07-01T12:00:00.000Z'), false);
    assert.equal(isAfterInvoiceControlEpoch('2026-07-23T20:00:00.000Z'), true);
    // Sem created_at: fail-open (emissão incompleta não some da tela)
    assert.equal(isAfterInvoiceControlEpoch(null, '2026-06-01'), true);
    assert.ok(INVOICE_CONTROL_EPOCH.startsWith('2026-07-23'));
  });

  it('UI: lista antes do wipe, poll Processando, stash após emitir', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(ui, /import React,/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /readInvoiceWatch/);
    assert.match(ui, /invoicesRef/);
    assert.match(ui, /sync-open-payments/);
    // fetch antes do wipe
    const healIdx = ui.indexOf('const heal = async');
    const fetchIdx = ui.indexOf('await fetchInvoices({ silent: true })', healIdx);
    const wipeIdx = ui.indexOf('ensure-clean-slate', healIdx);
    assert.ok(healIdx >= 0 && fetchIdx >= 0 && wipeIdx >= 0);
    assert.ok(fetchIdx < wipeIdx, 'lista deve carregar antes do wipe');

    const billing = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(billing, /stashInvoiceWatch/);
    assert.match(billing, /created_at: new Date\(\)\.toISOString\(\)/);
    assert.match(billing, /saved\?\.ok/);
    assert.match(billing, /import React,/);
  });
});
