import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Controle de Faturas — tela limpa sem botão Limpar', () => {
  it('remove botão Limpar e dispara ensure-clean-slate na abertura', () => {
    const ui = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.doesNotMatch(ui, /btn-clear-all-open/);
    assert.doesNotMatch(ui, /handleClearAllOpen/);
    assert.doesNotMatch(ui, /Limpar todas em aberto/);
    assert.match(ui, /\/api\/nf\/ensure-clean-slate/);
    assert.match(ui, /isAfterInvoiceControlEpoch/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /import React,/);
  });

  it('backend limpa em lote via lib compartilhada', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /wipeOpenInvoicesCleanSlate/);
    assert.match(routes, /ensure-clean-slate/);
    const lib = fs.readFileSync('lib/nfInvoiceControlApi.ts', 'utf8');
    assert.match(lib, /wipeOpenInvoicesCleanSlate/);
    assert.match(lib, /invoice_clean_slate_v2/);
  });
});
