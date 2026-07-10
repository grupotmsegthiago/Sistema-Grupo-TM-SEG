import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPendingTransferInMemory,
  rememberPendingTransferInMemory,
} from '../lib/asaasPendingTransferMemory.ts';

test('rememberPendingTransferInMemory reconhece ID por 20 minutos', () => {
  rememberPendingTransferInMemory('tr_abc123');
  assert.equal(isPendingTransferInMemory('tr_abc123'), true);
  assert.equal(isPendingTransferInMemory('tr_outro'), false);
});

test('handler aprova transferência com ID registrado em memória', async () => {
  rememberPendingTransferInMemory('tr_mem_webhook');

  const mod = await import('../api/asaas-transfer-approval.ts');
  const handler = mod.default;
  let statusCode = 0;
  let body: any = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return {
        json(payload: unknown) {
          body = payload;
        },
      };
    },
    setHeader() {},
  };

  await handler(
    {
      method: 'POST',
      headers: {},
      body: {
        type: 'TRANSFER',
        transfer: {
          id: 'tr_mem_webhook',
          type: 'BANK_ACCOUNT',
          value: 50,
          operationType: 'PIX',
          bankAccount: { pixAddressKey: null },
        },
      },
    },
    res,
  );

  assert.equal(statusCode, 200);
  assert.equal(body?.status, 'APPROVED');
});
