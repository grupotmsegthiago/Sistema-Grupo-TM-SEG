import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('create-charge — resposta HTTP imediata (só servidor)', () => {
  it('single path: timeouts por etapa + logs + return após persist', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /\[ASAAS-EMISSAO\]/);
    assert.match(routes, /stepTimeout/);
    assert.match(routes, /asaas_cliente/);
    assert.match(routes, /asaas_cobranca/);
    assert.match(routes, /supabase_persist/);
    assert.match(routes, /Sucesso! Enviando resposta HTTP 200/);
    assert.match(routes, /nfIsolated:\s*true/);
    assert.match(routes, /message: 'Cobrança gerada com sucesso'/);

    const marker = routes.indexOf('Buscando/Criando cliente');
    assert.ok(marker > 0);
    const next = routes.indexOf('app.post("/api/asaas/send-billing-email"', marker);
    const block = routes.slice(marker, next);
    // Após resposta final do single path, não agenda NF/PIX.
    assert.doesNotMatch(block, /void \(async/);
    assert.doesNotMatch(block, /issueNfWithRouter/);
    assert.doesNotMatch(block, /getPaymentPixQrCode/);
    assert.doesNotMatch(block, /scheduleInvoice\(/);
    assert.doesNotMatch(block, /setImmediate\s*\(/);
  });

  it('asaasFetch usa AbortSignal.timeout(8000)', () => {
    const svc = fs.readFileSync('server/asaasService.ts', 'utf8');
    assert.match(svc, /ASAAS_FETCH_TIMEOUT_MS\s*=\s*8_000/);
    assert.match(svc, /buildAsaasAbortSignal/);
    assert.match(svc, /AbortSignal.*timeout|anyFactory\(ASAAS_FETCH_TIMEOUT_MS\)/);
    assert.match(svc, /Timeout ao comunicar com Asaas/);
  });
});
