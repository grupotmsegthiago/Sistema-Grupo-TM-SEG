import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

/**
 * Garante que SEC-03 isolado não reverte hotfix NF nem reaproveita o handler
 * antigo do PR #262.
 */
describe('SEC-03 isolado — hotfix NF preservado', () => {
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

  it('não reutiliza arquivos legados do PR #262', () => {
    assert.equal(fs.existsSync('api/asaas-payment-webhook.ts'), false);
    assert.equal(fs.existsSync('lib/asaasPaymentWebhook.ts'), false);
  });

  it('preserva rewrite atual para handler P4-NB07-CRIT', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.doesNotMatch(vercel, /asaas-payment-webhook/);
    assert.match(vercel, /"source": "\/api\/asaas\/webhook"[\s\S]*"destination": "\/api\/asaas-webhook"/);
  });

  it('webhook Express autentica antes de chamar a SSOT financeira', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const core = fs.readFileSync('lib/asaasWebhookCore.ts', 'utf8');
    const start = routes.indexOf('app.post("/api/asaas/webhook"');
    assert.ok(start >= 0);
    const webhookBlock = routes.slice(start, start + 800);
    const authIndex = webhookBlock.indexOf('verifyAsaasPaymentWebhookRequest');
    const coreIndex = webhookBlock.indexOf('handleAsaasPaymentWebhook');
    assert.ok(authIndex >= 0 && authIndex < coreIndex);
    assert.match(webhookBlock, /handleAsaasPaymentWebhook/);
    assert.match(core, /PAYMENT_RECEIVED/);
    assert.match(core, /received: true/);
  });

  it('token SEC-03 não contamina outras integrações', () => {
    const files = [
      'vercel.json',
      'lib/investmentApiAuth.ts',
      'api/investment-init.ts',
      'api/asaas-payments.ts',
      'api/asaas-payment.ts',
      'api/asaas-sync-open-payments.ts',
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /ASAAS_PAYMENT_WEBHOOK_TOKEN/);
      assert.doesNotMatch(src, /asaasPaymentWebhook/);
    }
  });
});
