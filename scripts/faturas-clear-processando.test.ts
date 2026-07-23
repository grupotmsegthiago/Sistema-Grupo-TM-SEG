import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Controle de Faturas — limpar fila + Processando + espelhos', () => {
  it('tem endpoint clear-open e botão Limpar todas', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /\/api\/nf\/clear-open/);
    assert.match(routes, /LIMPAR_TODAS_EM_ABERTO/);
    assert.match(routes, /nfUpdated/);
    assert.match(routes, /boleto_image_url/);
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(ui, /btn-clear-all-open/);
    assert.match(ui, /handleClearAllOpen/);
    assert.match(ui, /retry-now\?limit=5&reopen=1/);
    assert.match(ui, /sync-open-payments\?limit=15/);
    assert.match(ui, /doc-nf-/);
    assert.match(ui, /doc-boleto-/);
    assert.match(ui, /asaas_bankslip_url/);
    assert.match(ui, /paused/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /import React,/);
  });

  it('PROCESSING entra no worker de retry e reopenPaused existe', () => {
    const worker = fs.readFileSync('server/nfRetryWorker.ts', 'utf8');
    assert.match(worker, /PENDING_NF_STATUSES/);
    assert.match(worker, /PROCESSING/);
    assert.match(worker, /reopenPausedNfs/);
    assert.match(worker, /runRetryCycle\(opts/);
  });
});
