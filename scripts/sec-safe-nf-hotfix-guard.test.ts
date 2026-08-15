import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

/**
 * Garante que SEC-01/02 safe branch não reverte hotfix NF nem introduz SEC-03.
 */
describe('SEC safe — hotfix NF preservado e SEC-03 ausente', () => {
  it('FinancialInvoiceControl usa authFetch GET /api/nf/invoices (não supabase anon)', () => {
    const src = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const fetchFn = src.slice(src.indexOf('const fetchInvoices'), src.indexOf('}, [fetchInvoices'));
    assert.match(fetchFn, /authFetch\(['"]\/api\/nf\/invoices['"]\)/);
    assert.doesNotMatch(fetchFn, /supabase\.from\(['"]financial_invoices['"]\)/);
  });

  it('lib/nfInvoiceControlApi exporta transformFinancialInvoicesForControl (main SSOT)', () => {
    const lib = fs.readFileSync('lib/nfInvoiceControlApi.ts', 'utf8');
    assert.match(lib, /export function transformFinancialInvoicesForControl/);
    assert.match(lib, /export async function listFinancialInvoicesForControl/);
    assert.match(lib, /transformFinancialInvoicesForControl\(data/);
  });

  it('vercel.json rewrite /api/nf/invoices presente', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /"source": "\/api\/nf\/invoices"/);
    assert.match(vercel, /"destination": "\/api\/nf-control\?op=list"/);
  });

  it('SEC-03 ausente — sem asaas-payment-webhook handler', () => {
    assert.equal(fs.existsSync('api/asaas-payment-webhook.ts'), false);
    assert.equal(fs.existsSync('lib/asaasPaymentWebhook.ts'), false);
  });

  it('SEC-03 ausente — vercel.json sem handler asaas-payment-webhook (SEC-03)', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.doesNotMatch(vercel, /asaas-payment-webhook/);
  });

  it('SEC-03 ausente — webhook Express usa SSOT legada (sem verifyAsaasPaymentWebhookRequest)', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const core = fs.readFileSync('lib/asaasWebhookCore.ts', 'utf8');
    const start = routes.indexOf('app.post("/api/asaas/webhook"');
    assert.ok(start >= 0);
    const webhookBlock = routes.slice(start, start + 800);
    assert.doesNotMatch(webhookBlock, /verifyAsaasPaymentWebhookRequest/);
    assert.doesNotMatch(webhookBlock, /ASAAS_PAYMENT_WEBHOOK_TOKEN/);
    assert.match(webhookBlock, /handleAsaasPaymentWebhook/);
    assert.match(core, /PAYMENT_RECEIVED/);
    assert.match(core, /received: true/);
  });

  it('diff funcional Asaas — nenhuma referência ASAAS_PAYMENT_WEBHOOK_TOKEN no repo alterado', () => {
    const files = [
      'server/routes.ts',
      'vercel.json',
      'lib/investmentApiAuth.ts',
      'api/investment-init.ts',
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /ASAAS_PAYMENT_WEBHOOK_TOKEN/);
      assert.doesNotMatch(src, /asaasPaymentWebhook/);
    }
  });
});
