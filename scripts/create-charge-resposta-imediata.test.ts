import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('create-charge — resposta HTTP imediata (só servidor)', () => {
  it('core: timeouts por etapa + logs + return após persist', () => {
    const core = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(core, /\[ASAAS-EMISSAO\]/);
    assert.match(core, /stepTimeout/);
    assert.match(core, /asaas_cliente/);
    assert.match(core, /asaas_cobranca/);
    assert.match(core, /supabase_persist/);
    assert.match(core, /Sucesso! HTTP 200/);
    assert.match(core, /nfIsolated:\s*true/);
    assert.match(core, /message: 'Cobrança gerada com sucesso'/);
    assert.doesNotMatch(core, /void \(async/);
    assert.doesNotMatch(core, /issueNfWithRouter/);
    assert.doesNotMatch(core, /getPaymentPixQrCode/);
    assert.doesNotMatch(core, /scheduleInvoice\(/);
    assert.doesNotMatch(core, /setImmediate\s*\(/);
  });

  it('asaasFetch usa AbortSignal.timeout(8000)', () => {
    const svc = fs.readFileSync('server/asaasService.ts', 'utf8');
    assert.match(svc, /ASAAS_FETCH_TIMEOUT_MS\s*=\s*8_000/);
    assert.match(svc, /buildAsaasAbortSignal/);
    assert.match(svc, /AbortSignal.*timeout|anyFactory\(ASAAS_FETCH_TIMEOUT_MS\)/);
    assert.match(svc, /Timeout ao comunicar com Asaas/);
  });

  it('Vercel: rewrite para handler leve (fora do Express)', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /\/api\/asaas\/create-charge/);
    assert.match(vercel, /asaas-create-charge/);
    assert.ok(fs.existsSync('api/asaas-create-charge.ts'));
    const lite = fs.readFileSync('api/asaas-create-charge.ts', 'utf8');
    assert.match(lite, /runAsaasCreateCharge/);
    assert.match(lite, /handler leve|cold start/i);
  });
});
