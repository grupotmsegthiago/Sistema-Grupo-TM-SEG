import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNfSchedulePendingMessage,
  isNonRetryable,
  shouldEnforceAutomaticRetryLimit,
} from '../lib/nfRetryGuards';

describe('nfRetryGuards — placeholder NF isolada vs erro fiscal real', () => {
  const placeholderLegado =
    'NF isolada — agendada pelo Controle/worker. ' +
    'Obs.: saldo Asaas OK não garante NF — POST /invoices exige Inscrição Municipal / CNAE / certificado no painel da empresa emissora.';

  const placeholderNovo =
    'NF isolada — agendada pelo Controle/worker (fora desta requisição).';

  it('placeholder NF isolada NÃO é erro permanente (mesmo citando Inscrição Municipal)', () => {
    assert.equal(isNfSchedulePendingMessage(placeholderLegado), true);
    assert.equal(isNonRetryable(placeholderLegado), false);
    assert.equal(isNfSchedulePendingMessage(placeholderNovo), true);
    assert.equal(isNonRetryable(placeholderNovo), false);
  });

  it('erro real de Inscrição Municipal continua não-retentável', () => {
    const real =
      'Asaas API Error: A empresa emissora não possui Inscrição Municipal configurada no painel.';
    assert.equal(isNfSchedulePendingMessage(real), false);
    assert.equal(isNonRetryable(real), true);
  });

  it('NFe003 e erros transitórios da prefeitura', () => {
    assert.equal(isNonRetryable('NFe003: descrição do serviço inválida'), true);
    assert.equal(isNonRetryable('Prefeitura sobrecarregada, tente novamente'), false);
  });

  it('limite continua bloqueando automático, não converte retry manual em polling', () => {
    assert.equal(shouldEnforceAutomaticRetryLimit(3, 3), true);
    assert.equal(shouldEnforceAutomaticRetryLimit(3, 3, { manualRetry: true }), false);
  });
});
