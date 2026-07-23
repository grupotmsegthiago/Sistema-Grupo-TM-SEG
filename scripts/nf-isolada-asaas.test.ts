import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('NF isolada do create-charge (sem Abort na Vercel)', () => {
  it('create-charge core responde e NÃO agenda NF/PIX na mesma request', () => {
    const core = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(core, /nfIsolated:\s*true/);
    assert.match(core, /\[ASAAS-EMISSAO\]/);
    assert.match(core, /Sucesso! HTTP 200/);
    assert.doesNotMatch(core, /void \(async \(\) =>/);
    assert.doesNotMatch(core, /getPaymentPixQrCode/);
    assert.doesNotMatch(core, /issueNfWithRouter/);
    assert.doesNotMatch(core, /scheduleInvoice\(/);
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
