import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('NF isolada do create-charge (sem Abort na Vercel)', () => {
  it('create-charge responde e NÃO agenda NF/PIX na mesma request', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /nfIsolated:\s*true/);
    assert.match(routes, /NF isolada/);
    assert.match(routes, /zero trabalho após isto|NÃO rodar PIX\/NF nesta request/);
    // Entre a resposta NF isolada e o próximo endpoint, não pode haver enrich.
    const singleIdx = routes.indexOf('Cobrança criada+persistida (NF isolada)');
    assert.ok(singleIdx > 0);
    const nextRoute = routes.indexOf('app.post("/api/asaas/send-billing-email"', singleIdx);
    assert.ok(nextRoute > singleIdx);
    const after = routes.slice(singleIdx, nextRoute);
    assert.doesNotMatch(after, /void \(async \(\) =>/);
    assert.doesNotMatch(after, /getPaymentPixQrCode/);
    assert.doesNotMatch(after, /issueNfWithRouter/);
    assert.match(after, /return res\.status/);
  });

  it('scheduleInvoice monta payload V3 e captura erro Asaas', () => {
    const svc = fs.readFileSync('server/asaasService.ts', 'utf8');
    assert.match(svc, /payment: params\.paymentId/);
    assert.match(svc, /serviceDescription/);
    assert.match(svc, /effectiveDatePeriod/);
    assert.match(svc, /municipalServiceCode/);
    assert.match(svc, /taxes/);
    assert.match(svc, /Inscrição Municipal/);
    assert.match(svc, /POST \/invoices/);
  });

  it('frontend reconhece nfIsolated', () => {
    const ui = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(ui, /nfIsolated/);
    assert.match(ui, /import React,/);
  });
});
