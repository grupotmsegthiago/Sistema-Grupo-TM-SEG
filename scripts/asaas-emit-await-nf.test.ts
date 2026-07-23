import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Emissão Asaas — aguarda NF sem travar', () => {
  it('ClientBillingReport fecha modal e navega sem abort de 55s', () => {
    const src = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.doesNotMatch(src, /55_000/);
    assert.match(src, /75_000/);
    assert.match(src, /NF_TIMEOUT|nf_status = 'PROCESSING'/);
    assert.match(src, /nf_status = 'PROCESSING'/);
    assert.match(src, /onNavigate\('fin-invoices'\)/);
    assert.match(src, /setShowInvoiceModal\(false\)/);
    assert.match(src, /boleto_image_url/);
    assert.match(src, /from 'react'/);
    assert.match(src, /import React,/);
    assert.doesNotMatch(
      src,
      /\[invoiceForm\.amount, invoiceForm\.boleto_due_date, invoiceForm\.client, invoiceForm\.number\]/,
    );
  });

  it('create-charge trata NF_TIMEOUT como soft e consulta pós-timeout', () => {
    const src = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(src, /NF_TIMEOUT/);
    assert.match(src, /consultando se já existe no Asaas/);
    assert.match(src, /softNfPending/);
    assert.match(src, /NF_SCHEDULE_PENDING/);
    assert.match(src, /hasNfPdf/);
    assert.match(src, /nfTimeoutMs = 6_000/);
    assert.doesNotMatch(src, /!hasNf \? 'NF não disponível/);
  });
});
