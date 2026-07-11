import test from 'node:test';
import assert from 'node:assert/strict';

test('handler GET retorna HTTP 200 para validação de URL', async () => {
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
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(statusCode, 200);
  assert.equal(body?.ok, true);
});

test('handler POST token inválido retorna 200 REFUSED (não 401)', async () => {
  const prev = process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
  process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = 'token-esperado-teste';
  try {
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
        headers: { 'asaas-access-token': 'errado' },
        body: { type: 'TRANSFER', transfer: { value: 1 } },
      },
      res,
    );
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
    assert.equal(statusCode, 200);
    assert.equal(body?.status, 'APPROVED');
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN;
    else process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN = prev;
  }
});
