import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Emissão Asaas — aguarda NF sem travar (55s)', () => {
  it('ClientBillingReport não aborta create-charge em 55s', () => {
    const src = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.doesNotMatch(src, /55_000/);
    assert.match(src, /180_000/);
    assert.match(src, /startSilentNfFollowUp/);
    assert.match(src, /\/api\/asaas\/sync-payment-status/);
    assert.match(src, /\/api\/nf\/retry\//);
    assert.match(src, /NF_TIMEOUT/);
    assert.match(src, /nf_status = 'PROCESSING'/);
    assert.match(src, /onNavigate\('fin-invoices'\)/);
    assert.match(src, /setShowInvoiceModal\(false\)/);

    assert.match(src, /from 'react'/);
    assert.match(src, /import React,/);
    assert.match(src, /nfAwaiting/);
    // Não limpa comprovante ao setar número ASAAS-*
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
    assert.doesNotMatch(src, /!hasNf \? 'NF não disponível/);
  });
});
