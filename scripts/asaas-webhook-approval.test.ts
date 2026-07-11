import test from 'node:test';
import assert from 'node:assert/strict';

function mockRes() {
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
  return {
    res,
    get() {
      return { statusCode, body };
    },
  };
}

test('handler GET retorna HTTP 200 para validação de URL', async () => {
  const mod = await import('../api/asaas-transfer-approval.ts');
  const handler = mod.default;
  const { res, get } = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  const { statusCode, body } = get();
  assert.equal(statusCode, 200);
  assert.equal(body?.ok, true);
});

test('handler POST token inválido retorna 200 REFUSED (não 401)', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = 'token-esperado-teste';
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    await handler(
      {
        method: 'POST',
        headers: { 'asaas-access-token': 'errado' },
        body: { type: 'TRANSFER', transfer: { value: 1 } },
      },
      res,
    );
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'REFUSED');
    assert.equal(body?.refuseReason, 'token_invalido');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});

test('handler POST tmseg-repasse aprova mesmo com token inválido no header', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = 'token-esperado-teste';
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    await handler(
      {
        method: 'POST',
        headers: { 'asaas-access-token': 'errado' },
        body: {
          type: 'TRANSFER',
          transfer: {
            id: 'repasse-tmseg',
            value: 400,
            operationType: 'PIX',
            externalReference: 'tmseg-repasse-TM-SEGURANCA-1720000000000',
          },
        },
      },
      res,
    );
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});

test('handler POST TRANSFER_DONE retorna APPROVED (não pausa fila Asaas)', async () => {
  const mod = await import('../api/asaas-transfer-approval.ts');
  const handler = mod.default;
  const { res, get } = mockRes();
  await handler(
    {
      method: 'POST',
      headers: {},
      body: { event: 'TRANSFER_DONE', transfer: { id: 'done-1', value: 400 } },
    },
    res,
  );
  const { statusCode, body } = get();
  assert.equal(statusCode, 200);
  assert.equal(body?.status, 'APPROVED');
});

test('handler POST formato event+data aprova tmseg-repasse', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = 'token-esperado-teste';
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    await handler(
      {
        method: 'POST',
        headers: { 'asaas-access-token': 'errado' },
        body: {
          event: 'TRANSFER',
          data: {
            id: 'data-format',
            value: 400,
            operationType: 'PIX',
            externalReference: 'tmseg-repasse-TM-SEGURANCA-1720000000000',
          },
        },
      },
      res,
    );
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});

test('handler POST token Bearer no header asaas-access-token', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = 'token-bearer-teste';
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    await handler(
      {
        method: 'POST',
        headers: { 'asaas-access-token': 'Bearer token-bearer-teste' },
        body: {
          type: 'TRANSFER',
          transfer: {
            id: 'bearer-min',
            value: 22,
            operationType: 'PIX',
            bankAccount: { pixAddressKey: null },
          },
        },
      },
      res,
    );
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});

test('handler POST payload oficial Asaas aprova com externalReference tmseg-repasse', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    const payload = JSON.stringify({
      type: 'TRANSFER',
      transfer: {
        id: 'doc-example',
        type: 'BANK_ACCOUNT',
        value: 22,
        operationType: 'PIX',
        description: null,
        externalReference: 'tmseg-repasse-TM-SEGURANCA-1720000000000',
        bankAccount: { pixAddressKey: null },
      },
    });
    await handler({ method: 'POST', headers: {}, body: payload }, res);
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});

test('handler POST payload oficial Asaas aprova com token válido (payload mínimo)', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = 'token-producao-teste';
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    await handler(
      {
        method: 'POST',
        headers: { 'asaas-access-token': 'token-producao-teste' },
        body: {
          type: 'TRANSFER',
          transfer: {
            id: 'doc-minimo',
            type: 'BANK_ACCOUNT',
            value: 22,
            operationType: 'PIX',
            description: null,
            bankAccount: { pixAddressKey: null },
          },
        },
      },
      res,
    );
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});

test('handler POST payload mínimo aprova sem token configurado (modo legado)', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  try {
    const mod = await import('../api/asaas-transfer-approval.ts');
    const handler = mod.default;
    const { res, get } = mockRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          type: 'TRANSFER',
          transfer: {
            id: 'doc-example',
            type: 'BANK_ACCOUNT',
            value: 22,
            operationType: 'PIX',
            description: null,
            bankAccount: { pixAddressKey: null },
          },
        },
      },
      res,
    );
    const { statusCode, body } = get();
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});
