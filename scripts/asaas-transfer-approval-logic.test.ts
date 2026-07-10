import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsaasTransferExternalReference,
  isTmSegRepasseExternalReference,
  shouldApproveAsaasTransferWebhook,
} from '../lib/asaasTransferApproval.ts';

const FINANCEIRO_WALLET = '6641fec4-8476-48e3-90a8-3db6b14f538c';

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
