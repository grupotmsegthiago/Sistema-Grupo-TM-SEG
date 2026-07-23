import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('NF isolada do create-charge (sem Abort na Vercel)', () => {
  it('create-charge responde e NÃO agenda NF/PIX na mesma request', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /nfIsolated:\s*true/);
    assert.match(routes, /\[ASAAS-EMISSAO\]/);
    assert.match(routes, /Sucesso! Enviando resposta HTTP 200/);

    const marker = routes.indexOf('Buscando/Criando cliente');
    assert.ok(marker > 0);
    const nextRoute = routes.indexOf('app.post("/api/asaas/send-billing-email"', marker);
    assert.ok(nextRoute > marker);
    const after = routes.slice(marker, nextRoute);
    assert.doesNotMatch(after, /void \(async \(\) =>/);
    assert.doesNotMatch(after, /getPaymentPixQrCode/);
    assert.doesNotMatch(after, /issueNfWithRouter/);
    assert.doesNotMatch(after, /scheduleInvoice\(/);
    assert.match(after, /return res\.status\(200\)\.json/);
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
});
