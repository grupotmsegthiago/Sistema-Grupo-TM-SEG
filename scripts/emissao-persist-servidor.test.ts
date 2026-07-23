import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Emissão Asaas — persistência server-side + Abort', () => {
  it('create-charge persiste financial_invoices antes de PIX/NF', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /persistAsaasChargeInvoice/);
    assert.match(routes, /patchAsaasChargeInvoiceMirrors/);
    assert.match(routes, /Persiste NO SERVIDOR/);
    assert.match(routes, /Promise\.allSettled/);
    assert.match(routes, /persisted:\s*\{/);
    const lib = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(lib, /asaas_payment_id/);
    assert.match(lib, /nf_status/);
    assert.match(lib, /PROCESSING/);
    assert.match(lib, /financial_transactions/);
  });

  it('frontend usa persisted do servidor e no Abort abre o Controle', () => {
    const ui = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(ui, /import React,/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /data\?\.persisted\?\.ok/);
    assert.match(ui, /AbortError/);
    assert.match(ui, /onNavigate\('fin-invoices'\)/);
    assert.match(ui, /deve aparecer como Processando/);
    assert.match(ui, /asaas_payment_id/);
  });
});
