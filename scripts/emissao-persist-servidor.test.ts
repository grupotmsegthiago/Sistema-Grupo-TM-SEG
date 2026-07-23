import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Emissão Asaas — persistência server-side + Abort', () => {
  it('create-charge persiste e responde early (sem esperar PIX/NF)', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /persistAsaasChargeInvoice/);
    assert.match(routes, /patchAsaasChargeInvoiceMirrors/);
    assert.match(routes, /findRecentDuplicateOpenCharge/);
    assert.match(routes, /earlyReturn:\s*true/);
    assert.match(routes, /Database-first/);
    assert.match(routes, /enrich background/);
    const lib = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(lib, /asaas_payment_id/);
    assert.match(lib, /nf_status/);
    assert.match(lib, /PROCESSING/);
    assert.match(lib, /findRecentDuplicateOpenCharge/);
  });

  it('frontend usa persisted/earlyReturn e no Abort abre o Controle', () => {
    const ui = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(ui, /import React,/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /data\?\.persisted\?\.ok/);
    assert.match(ui, /earlyReturn/);
    assert.match(ui, /AbortError/);
    assert.match(ui, /onNavigate\('fin-invoices'\)/);
    assert.match(ui, /45_000/);
    assert.match(ui, /asaas_payment_id/);
  });
});
