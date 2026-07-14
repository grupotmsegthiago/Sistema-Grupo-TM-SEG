import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsaasTransferExternalReference,
  extractAsaasTransferWebhookPayload,
  isTmSegRepasseExternalReference,
  listConfiguredAsaasTransferWebhookTokens,
  matchAsaasTransferWebhookToken,
  normalizeAsaasWebhookToken,
  shouldApproveAsaasTransferWebhook,
} from '../lib/asaasTransferApproval.ts';

const FINANCEIRO_WALLET = '6641fec4-8476-48e3-90a8-3db6b14f538c';

test('normalizeAsaasWebhookToken remove Bearer', () => {
  assert.equal(normalizeAsaasWebhookToken('Bearer abc'), 'abc');
  assert.equal(normalizeAsaasWebhookToken('  token  '), 'token');
});

test('matchAsaasTransferWebhookToken aceita token por empresa', () => {
  const prev = {
    ASAAS_TRANSFER_WEBHOOK_TOKEN: process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN,
    ASAAS_WEBHOOK_TMGESTAO_API: process.env.ASAAS_WEBHOOK_TMGESTAO_API,
    ASAAS_WEBHOOK_TMSEGURANCA_API: process.env.ASAAS_WEBHOOK_TMSEGURANCA_API,
    ASAAS_WEBHOOK_TMSECURITY_API: process.env.ASAAS_WEBHOOK_TMSECURITY_API,
  };
  try {
    delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    process.env.ASAAS_WEBHOOK_TMGESTAO_API = 'tok-gestao';
    process.env.ASAAS_WEBHOOK_TMSEGURANCA_API = 'tok-seg';
    process.env.ASAAS_WEBHOOK_TMSECURITY_API = 'tok-security';

    const list = listConfiguredAsaasTransferWebhookTokens();
    assert.equal(list.length, 3);

    const g = matchAsaasTransferWebhookToken('tok-gestao');
    assert.equal(g.ok, true);
    assert.equal(g.matchedEnv, 'ASAAS_WEBHOOK_TMGESTAO_API');
    assert.equal(g.openMode, false);

    const s = matchAsaasTransferWebhookToken('tok-security');
    assert.equal(s.ok, true);
    assert.equal(s.matchedEnv, 'ASAAS_WEBHOOK_TMSECURITY_API');

    const bad = matchAsaasTransferWebhookToken('outro');
    assert.equal(bad.ok, false);
    assert.equal(bad.configuredCount, 3);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('matchAsaasTransferWebhookToken em modo aberto sem env preenchida', () => {
  const names = [
    'ASAAS_TRANSFER_WEBHOOK_TOKEN',
    'ASAAS_WEBHOOK_TMGESTAO',
    'ASAAS_WEBHOOK_TMGESTAO_API',
    'ASAAS_TRANSFER_WEBHOOK_TOKEN_TMGESTAO',
    'ASAAS_WEBHOOK_TMSEGURANCA',
    'ASAAS_WEBHOOK_TMSEGURANCA_API',
    'ASAAS_TRANSFER_WEBHOOK_TOKEN_TMSEGURANCA',
    'ASAAS_WEBHOOK_TMSECURITY',
    'ASAAS_WEBHOOK_TMSECURITY_API',
    'ASAAS_TRANSFER_WEBHOOK_TOKEN_TMSECURITY',
  ];
  const prev: Record<string, string | undefined> = {};
  for (const n of names) {
    prev[n] = process.env[n];
    delete process.env[n];
  }
  try {
    const m = matchAsaasTransferWebhookToken('');
    assert.equal(m.ok, true);
    assert.equal(m.openMode, true);
    assert.equal(m.configuredCount, 0);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
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
