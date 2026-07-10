import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAsaasTransferError } from '../lib/asaasTransferErrors.ts';

test('formatAsaasTransferError explica permissão de saque', () => {
  const msg = formatAsaasTransferError(
    'Asaas: A chave de API fornecida não possui permissão para realizar operações de saque via API.',
  );
  assert.match(msg, /permissão de saque/i);
  assert.match(msg, /transfer-approval/i);
});

test('formatAsaasTransferError preserva mensagem genérica', () => {
  assert.equal(formatAsaasTransferError('saldo insuficiente'), 'Asaas: saldo insuficiente');
});
