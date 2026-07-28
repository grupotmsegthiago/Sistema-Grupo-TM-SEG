import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatNfLastError,
  isHardNfEmissionError,
  isSoftNfPendingMessage,
  nfBucketDetail,
  nfStatusBucket,
} from '../lib/invoiceDisplay.ts';

describe('invoiceDisplay NF errors', () => {
  it('trata mensagem soft como processamento, não falha', () => {
    const soft =
      'NF isolada — agendada pelo Controle/worker. Obs.: saldo Asaas OK não garante NF';
    assert.equal(isSoftNfPendingMessage(soft), true);
    assert.equal(isHardNfEmissionError(soft, 'PROCESSING'), false);
    assert.equal(nfStatusBucket('PROCESSING', { lastError: soft }), 'aguardando');
    assert.equal(formatNfLastError(soft), null);
  });

  it('exibe erro real do Asaas (401 chave inválida) como Falha', () => {
    const err = 'Asaas API Error (401): A chave de API fornecida é inválida';
    assert.equal(isHardNfEmissionError(err, 'PROCESSING'), true);
    assert.equal(nfStatusBucket('PROCESSING', { lastError: err }), 'falha');
    assert.match(nfBucketDetail('PROCESSING', { lastError: err }) || '', /chave de API/i);
  });

  it('ERROR status vira Falha mesmo sem mensagem', () => {
    assert.equal(nfStatusBucket('ERROR', {}), 'falha');
  });

  it('SYNCHRONIZED sem erro continua Processando / fila prefeitura', () => {
    assert.equal(nfStatusBucket('SYNCHRONIZED', {}), 'aguardando');
    assert.equal(nfBucketDetail('SYNCHRONIZED', {}), 'Em fila Prefeitura');
  });
});
