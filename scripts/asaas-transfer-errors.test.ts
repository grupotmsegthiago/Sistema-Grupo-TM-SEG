import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAsaasTransferError } from '../lib/asaasTransferErrors.ts';
import { ASAAS_PIX_FINANCEIRO_EMAIL } from '../lib/asaasPixTransfer.ts';

test('formatAsaasTransferError orienta liberação de saque via API no painel Asaas', () => {
  const msg = formatAsaasTransferError(
    'Asaas: A chave de API fornecida não possui permissão para realizar operações de saque via API.',
  );
  assert.match(msg, /Mecanismos de segurança/i);
  assert.match(msg, /gerente de contas Asaas/i);
  assert.match(msg, /regenere a chave API/i);
  assert.doesNotMatch(msg, /webhook de aprovação recusou/i);
});

test('formatAsaasTransferError prioriza permissão de saque sobre webhook no erro combinado', () => {
  const msg = formatAsaasTransferError(
    'Repasse interno: Asaas: webhook recusou. Pix: A chave de API não possui permissão para saque via API.',
  );
  assert.match(msg, /liberação de saque/i);
  assert.doesNotMatch(msg, /webhook de aprovação recusou/i);
});

test('formatAsaasTransferError orienta cadastro da chave Pix de destino', () => {
  const msg = formatAsaasTransferError(
    'Pix: Asaas: Informe uma conta cadastrada para realizar a transferência.',
  );
  assert.match(msg, /Cadastrar nova conta/i);
  assert.match(msg, new RegExp(ASAAS_PIX_FINANCEIRO_EMAIL.replace('.', '\\.')));
});

test('formatAsaasTransferError mantém mensagem de webhook quando é o único problema', () => {
  const msg = formatAsaasTransferError('Asaas: Transferência cancelada pelo webhook de aprovação');
  assert.match(msg, /webhook de aprovação recusou/i);
});

test('formatAsaasTransferError preserva mensagem genérica', () => {
  assert.equal(formatAsaasTransferError('saldo insuficiente'), 'Asaas: saldo insuficiente');
});
