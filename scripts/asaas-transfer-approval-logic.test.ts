import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsaasTransferExternalReference,
  extractAsaasTransferWebhookPayload,
  isTmSegRepasseExternalReference,
  normalizeAsaasWebhookToken,
  shouldApproveAsaasTransferWebhook,
} from '../lib/asaasTransferApproval.ts';

const FINANCEIRO_WALLET = '6641fec4-8476-48e3-90a8-3db6b14f538c';

test('normalizeAsaasWebhookToken remove Bearer', () => {
  assert.equal(normalizeAsaasWebhookToken('Bearer abc'), 'abc');
  assert.equal(normalizeAsaasWebhookToken('  token  '), 'token');
});

test('extractAsaasTransferWebhookPayload lê formato event+data', () => {
  const parsed = extractAsaasTransferWebhookPayload({
    event: 'TRANSFER',
    data: {
      id: 'x1',
      value: 10,
      operationType: 'PIX',
      pixAddressKey: 'Financeiro@GrupoTMSEG.com.br',
    },
  });
  assert.equal(parsed.isAuthorizationRequest, true);
  assert.equal(parsed.transfer.id, 'x1');
  assert.equal(parsed.transfer.pixAddressKey, 'Financeiro@GrupoTMSEG.com.br');
});

test('extractAsaasTransferWebhookPayload marca TRANSFER_DONE como notificação', () => {
  const parsed = extractAsaasTransferWebhookPayload({
    event: 'TRANSFER_DONE',
    transfer: { id: 'done', value: 100 },
  });
  assert.equal(parsed.isNotificationOnly, true);
  assert.equal(parsed.isAuthorizationRequest, false);
});

test('buildAsaasTransferExternalReference gera prefixo tmseg-repasse', () => {
  const ref = buildAsaasTransferExternalReference('TM SEGURANCA');
  assert.match(ref, /^tmseg-repasse-TM-SEGURANCA-\d+$/);
  assert.equal(isTmSegRepasseExternalReference(ref), true);
});

test('aprova payload oficial Asaas (BANK_ACCOUNT + PIX) com externalReference do sistema', () => {
  const transfer = {
    id: '0bed986c-737d-49bf-a1cc-beca916797c4',
    type: 'BANK_ACCOUNT',
    value: 22,
    operationType: 'PIX',
    description: null,
    externalReference: 'tmseg-repasse-TM-SEGURANCA-1720000000000',
    bankAccount: { pixAddressKey: null },
  };
  assert.equal(shouldApproveAsaasTransferWebhook(transfer, FINANCEIRO_WALLET), true);
});

test('recusa payload oficial Asaas sem externalReference nem destino identificável', () => {
  const transfer = {
    id: '0bed986c-737d-49bf-a1cc-beca916797c4',
    type: 'BANK_ACCOUNT',
    value: 22,
    operationType: 'PIX',
    description: null,
    bankAccount: { pixAddressKey: null },
  };
  assert.equal(shouldApproveAsaasTransferWebhook(transfer, FINANCEIRO_WALLET), false);
});

test('aprova PIX com type PIX e chave financeiro', () => {
  const transfer = {
    type: 'PIX',
    value: 10,
    pixAddressKey: 'financeiro@grupotmseg.com.br',
  };
  assert.equal(shouldApproveAsaasTransferWebhook(transfer, FINANCEIRO_WALLET), true);
});

test('aprova repasse interno por walletId', () => {
  const transfer = {
    type: 'INTERNAL',
    value: 50,
    walletId: FINANCEIRO_WALLET,
    description: 'Repasse TM SEG — TM GESTÃO',
  };
  assert.equal(shouldApproveAsaasTransferWebhook(transfer, FINANCEIRO_WALLET), true);
});
