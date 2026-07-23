import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('create-charge — resposta HTTP imediata (só servidor)', () => {
  it('single path: timeouts por etapa + logs + return após persist', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /\[CREATE-CHARGE\]/);
    assert.match(routes, /stepTimeout/);
    assert.match(routes, /asaas_cliente/);
    assert.match(routes, /asaas_cobranca/);
    assert.match(routes, /supabase_persist/);
    assert.match(routes, /Resposta enviada ao frontend/);
    assert.match(routes, /nfIsolated:\s*true/);
    assert.match(routes, /message: 'Cobrança gerada com sucesso'/);

    const marker = routes.indexOf('Criando/buscando cliente Asaas');
    assert.ok(marker > 0);
    const next = routes.indexOf('app.post("/api/asaas/send-billing-email"', marker);
    const block = routes.slice(marker, next);
    // Após resposta final do single path, não agenda NF/PIX.
    assert.doesNotMatch(block, /void \(async/);
    assert.doesNotMatch(block, /issueNfWithRouter/);
    assert.doesNotMatch(block, /getPaymentPixQrCode/);
    assert.doesNotMatch(block, /scheduleInvoice\(/);
  });
});
