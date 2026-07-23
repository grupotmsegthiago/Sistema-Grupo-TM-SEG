import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('create-charge — rastreio TMSEG + abort real (anti-hang Vercel)', () => {
  it('asaasService propaga AbortSignal nas chamadas críticas', () => {
    const svc = fs.readFileSync('server/asaasService.ts', 'utf8');
    assert.match(svc, /signal\?: AbortSignal/);
    assert.match(svc, /findCustomerByCpfCnpj\([\s\S]*signal/);
    assert.match(svc, /signal: params\.signal/);
  });

  it('core single usa stepTimeout com signal + trackingRef', () => {
    const core = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(core, /trackingRef/);
    assert.match(core, /trackingNumber: trackingRef/);
    assert.match(core, /fn: \(signal: AbortSignal\) => Promise<T>/);
    assert.match(core, /routeCtrl\.abort\(\)/);
  });

  it('persist aceita trackingNumber e abortSignal', () => {
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(persist, /trackingNumber\?:/);
    assert.match(persist, /signal\?: AbortSignal/);
    assert.match(persist, /abortSignal\(signal\)/);
    assert.match(persist, /tracking \|\| `ASAAS-\$\{paymentId\}`/);
  });

  it('frontend pré-gera TMSEG e handler leve existe', () => {
    const ui = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(ui, /function buildInternalTrackingRef/);
    assert.match(ui, /Ref\. interna \(rastreio\)/);
    assert.match(ui, /number: trackingRef/);
    assert.match(ui, /Mantém TMSEG/);
    assert.match(ui, /30_000/);
    assert.match(ui, /from 'react'/);
    assert.ok(fs.existsSync('api/asaas-create-charge.ts'));
  });
});
