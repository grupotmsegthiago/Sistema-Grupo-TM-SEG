import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('NF automática após emissão (sem intervenção manual)', () => {
  it('faturamento dispara kickNfSchedule após create-charge', () => {
    const billing = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(billing, /kickNfScheduleForInvoices/);
    assert.match(billing, /from ['"]\.\.\/lib\/kickNfSchedule['"]/);
    // Chamado nos dois caminhos (single + split) após stashInvoiceWatch.
    const kicks = billing.match(/kickNfScheduleForInvoices\(/g) || [];
    assert.ok(kicks.length >= 2, 'deve chamar kick nos fluxos single e split');
  });

  it('Controle empurra retry-now enquanto Processando sem invoice Asaas', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(ui, /kickNfRetryCycle/);
    assert.match(ui, /needsSchedule/);
    assert.match(ui, /asaas_invoice_id/);
  });

  it('cron nf-retry a cada 5 minutos (rede de segurança)', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /\/api\/cron\/nf-retry/);
    assert.match(vercel, /"\*\/5 \* \* \* \*"/);
    assert.doesNotMatch(vercel, /"\*\/15 \* \* \* \*"\s*\n\s*\},\s*\n\s*\{\s*\n\s*"path": "\/api\/cron\/email-queue"/);
  });

  it('helper kickNfSchedule existe e usa rotas oficiais', () => {
    const src = fs.readFileSync('lib/kickNfSchedule.ts', 'utf8');
    assert.match(src, /\/api\/nf\/retry\//);
    assert.match(src, /\/api\/nf\/retry-now/);
    assert.match(src, /authFetch/);
  });
});
