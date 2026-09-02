import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  nfStatusBucket,
  nfStatusTooltip,
  shouldShowCurrentNfError,
} from '../lib/invoiceDisplay.ts';

const PREF_ERROR =
  "Retorno da prefeitura de São Paulo-SP: XML não compatível com Schema.The 'Discriminacao' element is invalid";

describe('NF status tooltip — erro atual vs histórico', () => {
  it('T01 ERROR + erro atual (falha) → tooltip mostra erro', () => {
    const bucket = nfStatusBucket('ERROR', { paused: true });
    assert.equal(bucket, 'falha');
    const tip = nfStatusTooltip({
      bucket,
      lastError: PREF_ERROR,
      detail: 'Erro na emissão',
      guidance: { shortLabel: 'Erro', howToFix: 'Clique em Reemitir NF.' },
    });
    assert.match(tip, /Discriminacao/);
    assert.match(tip, /Reemitir NF/);
    assert.doesNotMatch(tip, /tentativa anterior/i);
  });

  it('T02 PROCESSING + erro antigo persistido → não apresenta como rejeição atual', () => {
    const bucket = nfStatusBucket('PROCESSING', { paused: false });
    assert.equal(bucket, 'aguardando');
    const tip = nfStatusTooltip({
      bucket,
      lastError: PREF_ERROR,
      detail: 'Aguardando autorização',
    });
    assert.match(tip, /Aguardando autorização/i);
    assert.match(tip, /Erro da tentativa anterior/i);
    assert.match(tip, /Discriminacao/);
    const [firstLine] = tip.split('\n');
    assert.doesNotMatch(firstLine || '', /Discriminacao/);
  });

  it('T03 PROCESSING sem erro → mensagem coerente de aguardando', () => {
    const tip = nfStatusTooltip({
      bucket: 'aguardando',
      detail: 'Aguardando autorização',
    });
    assert.equal(tip, 'Aguardando autorização');
  });

  it('T04 nova rejeição real (falha) → status ERROR pausado mostra erro atual', () => {
    const bucket = nfStatusBucket('ERROR', { paused: true });
    const tip = nfStatusTooltip({ bucket, lastError: 'NFe003: descrição inválida' });
    assert.match(tip, /NFe003/);
    assert.equal(shouldShowCurrentNfError(bucket, 'NFe003'), true);
  });

  it('T05 AUTHORIZED → erro anterior não aparece como erro atual', () => {
    const bucket = nfStatusBucket('AUTHORIZED');
    assert.equal(shouldShowCurrentNfError(bucket, PREF_ERROR), false);
    const tip = nfStatusTooltip({ bucket, lastError: PREF_ERROR });
    assert.doesNotMatch(tip, /Discriminacao/);
  });

  it('T06 retry manual despausa limpa nf_last_error corrente', () => {
    const core = fs.readFileSync('lib/nfRetryInvoiceApiCore.ts', 'utf8');
    assert.match(core, /nf_last_error: null/);
    assert.match(core, /nf_retry_paused: false, nf_last_error: null/);
  });

  it('T07 Sync UI não chama retry', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const syncBlock = ui.slice(ui.indexOf('const handleSyncStatus'), ui.indexOf('const handleCancelInvoice'));
    assert.doesNotMatch(syncBlock, /\/api\/nf\/retry\//);
  });

  it('T08 Reemitir NF UI não chama /payments', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const retryBlock = ui.slice(ui.indexOf('const handleRetryNf'), ui.indexOf('const handleSendEmail'));
    assert.doesNotMatch(retryBlock, /\/payments/);
  });

  it('T09 UI usa nfStatusTooltip em vez de nf_last_error direto no title', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(ui, /nfStatusTooltip/);
    assert.match(ui, /title=\{nfTooltip\}/);
    assert.doesNotMatch(ui, /title=\{\[inv\.nf_last_error/);
  });

  it('T10 regressão PR #302 — retry individual preservado', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /retry-invoice&invoiceId=:invoiceId/);
    assert.match(fs.readFileSync('api/nf-control.ts', 'utf8'), /executeManualInvoiceRetry/);
  });
});
