import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildManualRetryConfirmMessage,
  canShowAsaasManualRetry,
  formatManualRetryFeedback,
  missingAsaasPaymentFeedback,
} from '../lib/nfRetryInvoiceFeedback.ts';
import {
  executeManualInvoiceRetry,
  validateManualRetryInvoice,
  type ManualRetryInvoiceRow,
} from '../lib/nfRetryInvoiceApiCore.ts';

const LOGGO_FIXTURE: ManualRetryInvoiceRow = {
  id: '94d2775d-a0ab-4dfe-a9c4-230eb3ac8346',
  number: 'TMSEG-20260902-103359-6OJ3',
  client: 'LOGGO SOLUCOES LOGISTICA',
  amount: 9912.65,
  asaas_payment_id: 'pay_0oct1zpus7q1y2kd',
  nf_status: 'ERROR',
  nf_retry_paused: true,
  nf_last_error:
    "Retorno da prefeitura de São Paulo-SP: XML não compatível com Schema.The 'Discriminacao' element is invalid",
  notes:
    'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS - Referente ao Mês Completo de Agosto/2026',
};

describe('Retry manual individual — UI e contratos', () => {
  const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  const nfControl = fs.readFileSync('api/nf-control.ts', 'utf8');
  const chargeCore = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
  const asaasSvc = fs.readFileSync('server/asaasService.ts', 'utf8');

  it('T01 — botão azul chama somente sync', () => {
    assert.match(ui, /handleSyncStatus\(inv\)/);
    assert.match(ui, /\/api\/asaas\/sync-payment-status/);
    assert.match(ui, /Sincronizar status — não reemite a NF/);
  });

  it('T02 — botão azul NÃO chama retry', () => {
    const syncBlock = ui.slice(ui.indexOf('const handleSyncStatus'), ui.indexOf('const handleCancelInvoice'));
    assert.doesNotMatch(syncBlock, /\/api\/nf\/retry\//);
  });

  it('T03 — botão Reemitir chama retry individual', () => {
    assert.match(ui, /handleRetryNf/);
    assert.match(ui, /\/api\/nf\/retry\/\$\{inv\.id\}/);
    assert.match(ui, /Reemitir NF \(Asaas\)/);
  });

  it('T04 — modal Detalhes apresenta Reemitir NF para ERROR', () => {
    assert.match(ui, /btn-retry-nf-detail-\$\{inv\.id\}/);
    assert.match(ui, /canShowAsaasManualRetry\(inv\)/);
  });

  it('T07 — sem asaas_payment_id mostra feedback explícito', () => {
    assert.match(ui, /missingAsaasPaymentFeedback/);
    assert.doesNotMatch(
      ui.slice(ui.indexOf('const handleRetryNf'), ui.indexOf('const handleSendEmail')),
      /if \(!inv\.asaas_payment_id\) return;/,
    );
  });

  it('T08 — duplo clique bloqueado enquanto processa', () => {
    assert.match(ui, /if \(retryingNfId\) return;/);
    assert.match(ui, /disabled=\{retryingNfId === inv\.id\}/);
  });

  it('T11 — /payments não é chamado no retry UI', () => {
    const retryBlock = ui.slice(ui.indexOf('const handleRetryNf'), ui.indexOf('const handleSendEmail'));
    assert.doesNotMatch(retryBlock, /\/payments/);
    assert.doesNotMatch(retryBlock, /create-charge/);
  });

  it('T12 — municipalServiceCode 07930 preservado', () => {
    assert.match(asaasSvc, /municipalServiceCode:\s*'07930'/);
    assert.doesNotMatch(chargeCore, /normalizeAsaasNfDiscrimination/);
  });

  it('T13 — normalizeAsaasNfDiscrimination continua no fluxo fiscal', () => {
    assert.match(asaasSvc, /normalizeAsaasNfDiscrimination/);
    assert.match(fs.readFileSync('api/_nf-retry-core.cjs', 'utf8'), /normalizeAsaasNfDiscrimination/);
  });

  it('T14 — bulk retry permanece intacto', () => {
    assert.match(ui, /\/api\/nf\/retry-now\?limit=10&reopen=1/);
    assert.match(vercel, /"source": "\/api\/nf\/retry-now"/);
    assert.match(nfControl, /op === 'retry-now'/);
  });

  it('T15 — autenticação/roles preservadas no handler leve', () => {
    assert.match(nfControl, /assertFinanceNfAccess/);
    assert.match(fs.readFileSync('server/routes.ts', 'utf8'), /requireRole\('administrador', 'diretoria', 'financeiro'\)/);
    assert.match(vercel, /retry-invoice&invoiceId=:invoiceId/);
  });

  it('T16 — erro backend aparece ao usuário', () => {
    assert.match(ui, /formatManualRetryFeedback/);
    assert.match(ui, /Erro ao reemitir NF:/);
  });
});

describe('Retry manual individual — core SSOT', () => {
  it('T05 — nf_retry_paused=true elegível para retry manual (LOGGO)', () => {
    assert.equal(canShowAsaasManualRetry(LOGGO_FIXTURE), true);
    assert.equal(validateManualRetryInvoice(LOGGO_FIXTURE), null);
  });

  it('T06 — retry despausa antes de retryOne', async () => {
    let unpaused = false;
    const retryOneFn = async (
      inv: ManualRetryInvoiceRow,
      opts?: { manualRetry?: boolean },
    ) => {
      assert.equal(inv.nf_retry_paused, false);
      assert.equal(inv.nf_last_error, null);
      assert.equal(opts?.manualRetry, true);
      unpaused = true;
      return { ok: true, status: 'SCHEDULED', action: 'scheduled' };
    };
    const outcome = await executeManualInvoiceRetry(LOGGO_FIXTURE.id, retryOneFn, {
      listPendingNfs: async () => [LOGGO_FIXTURE],
    });
    assert.equal(outcome.httpStatus, 200);
    assert.equal(unpaused, true);
    assert.equal(outcome.body.unpaused, true);
    assert.equal(outcome.body.success, true);
  });

  it('T09 — cancelamento NF anterior falha → nenhuma nova NF (mock)', async () => {
    const outcome = await executeManualInvoiceRetry(
      LOGGO_FIXTURE.id,
      async () => ({
        ok: false,
        status: 'ERROR',
        action: 'cancel-blocked',
        error: 'Cancelamento bloqueado: NF em processamento',
      }),
      { listPendingNfs: async () => [LOGGO_FIXTURE] },
    );
    assert.equal(outcome.body.success, false);
    assert.match(formatManualRetryFeedback(outcome.body), /bloqueada para evitar duplicidade/i);
  });

  it('T10 — retry usa payment existente (validação)', () => {
    const err = validateManualRetryInvoice({ ...LOGGO_FIXTURE, asaas_payment_id: null });
    assert.match(err || '', /sem ID Asaas/i);
    assert.equal(validateManualRetryInvoice(LOGGO_FIXTURE), null);
  });

  it('T17 — limite automático é preservado e só o contexto manual o ultrapassa', () => {
    const worker = fs.readFileSync('server/nfRetryWorker.ts', 'utf8');
    const core = fs.readFileSync('lib/nfRetryInvoiceApiCore.ts', 'utf8');
    assert.match(worker, /shouldEnforceAutomaticRetryLimit\(errorRetries, MAX_SYNC_RETRIES, opts\)/);
    assert.match(core, /retryOneFn\(ready, \{ manualRetry: true \}\)/);
    assert.match(worker, /if \(shouldPauseNonRetryableError\(asaasErr, opts\)\)/);
  });
});

describe('Retry manual individual — mensagens', () => {
  it('confirmação manual menciona Asaas e cobrança existente', () => {
    const msg = buildManualRetryConfirmMessage(LOGGO_FIXTURE.number!);
    assert.match(msg, /Reemitir somente esta NF pelo Asaas/i);
    assert.match(msg, /cobrança\/boleto existente/i);
  });

  it('feedback autorizada / pausada / erro rede', () => {
    assert.match(formatManualRetryFeedback({ success: true, status: 'AUTHORIZED', number: '123' }), /autorizada/i);
    assert.match(formatManualRetryFeedback({ success: false, paused: true, error: 'x' }), /pausada/i);
    assert.match(missingAsaasPaymentFeedback('NF-1'), /payment id\) ausente/i);
  });
});
