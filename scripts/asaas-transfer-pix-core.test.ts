import test from 'node:test';
import assert from 'node:assert/strict';

function clearTransferEnv() {
  delete process.env.ASAAS_TRANSFER_PIX_FIRST;
  delete process.env.ASAAS_SKIP_INTERNAL_TRANSFER;
}

test('resolveAsaasTransferCompany aceita aliases com e sem acento', async () => {
  const { resolveAsaasTransferCompany, isKnownAsaasCompany } = await import(
    '../lib/asaasTransferPixCore.ts'
  );
  assert.equal(resolveAsaasTransferCompany('TM GESTAO')?.key, 'TM GESTÃO');
  assert.equal(resolveAsaasTransferCompany('tm gestão')?.key, 'TM GESTÃO');
  assert.equal(resolveAsaasTransferCompany('TM SEGURANÇA')?.key, 'TM SEGURANCA');
  assert.equal(resolveAsaasTransferCompany('TMSEGURANCA')?.key, 'TM SEGURANCA');
  assert.equal(isKnownAsaasCompany('GESTAO'), true);
  assert.equal(isKnownAsaasCompany('outra'), false);
});

test('shouldPreferPixTransfer: Gestão e Segurança usam Pix primeiro por padrão', async () => {
  clearTransferEnv();
  const { shouldPreferPixTransfer } = await import('../lib/asaasTransferPixCore.ts');
  assert.equal(shouldPreferPixTransfer('TM GESTÃO'), true);
  assert.equal(shouldPreferPixTransfer('TM SEGURANCA'), true);
  assert.equal(shouldPreferPixTransfer('TM SECURITY'), false);

  process.env.ASAAS_TRANSFER_PIX_FIRST = 'false';
  assert.equal(shouldPreferPixTransfer('TM GESTÃO'), false);
  delete process.env.ASAAS_TRANSFER_PIX_FIRST;

  process.env.ASAAS_TRANSFER_PIX_FIRST = 'true';
  assert.equal(shouldPreferPixTransfer('TM SECURITY'), true);
  clearTransferEnv();
});

test('transferPixFromCompanyCore (Gestão) tenta Pix antes do interno', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body || '');
    calls.push({ url, body });
    if (url.includes('/finance/balance')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ balance: 500, totalPending: 0 }),
      } as Response;
    }
    if (url.includes('/transfers')) {
      const parsed = JSON.parse(body);
      if (parsed.operationType === 'PIX') {
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'tr_pix', operationType: 'PIX', status: 'PENDING' }),
        } as Response;
      }
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: [{ description: 'Contas sem vínculo' }] }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    clearTransferEnv();
    process.env.ASAAS_TMGESTAO_API = 'key-gestao';
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    const result = await transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 50 });
    assert.equal(result.transferMode, 'PIX');
    const transferCalls = calls.filter((c) => c.url.includes('/transfers'));
    assert.equal(transferCalls.length, 1);
    const body = JSON.parse(transferCalls[0].body);
    assert.equal(body.operationType, 'PIX');
    assert.equal(body.pixAddressKey, 'financeiro@grupotmseg.com.br');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASAAS_TMGESTAO_API;
    clearTransferEnv();
  }
});

test('transferPixFromCompanyCore faz fallback interno se Pix falhar (Gestão)', async () => {
  const originalFetch = globalThis.fetch;
  let transferAttempt = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/finance/balance')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ balance: 500 }),
      } as Response;
    }
    if (url.includes('/transfers')) {
      transferAttempt += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.operationType === 'PIX') {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({ errors: [{ description: 'Informe uma conta cadastrada' }] }),
        } as Response;
      }
      if (body.walletId) {
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'tr_int', type: 'INTERNAL' }),
        } as Response;
      }
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    clearTransferEnv();
    process.env.ASAAS_TMGESTAO_API = 'key-gestao';
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    const result = await transferPixFromCompanyCore({ company: 'TM GESTAO', value: 50 });
    assert.equal(result.transferMode, 'INTERNAL');
    assert.equal(transferAttempt, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASAAS_TMGESTAO_API;
    clearTransferEnv();
  }
});

test('transferPixFromCompanyCore (Security) ainda prioriza interno quando env não força Pix', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body || '');
    calls.push({ url, body });
    if (url.includes('/finance/balance')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ balance: 500 }),
      } as Response;
    }
    if (url.includes('/transfers')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ id: 'tr_int', type: 'INTERNAL', status: 'PENDING' }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    clearTransferEnv();
    process.env.ASAAS_API_KEY_TMSECURITY_60 = 'key-security';
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    const result = await transferPixFromCompanyCore({ company: 'TM SECURITY', value: 50 });
    assert.equal(result.transferMode, 'INTERNAL');
    const body = JSON.parse(calls.find((c) => c.url.includes('/transfers'))!.body);
    assert.equal(body.walletId, '6641fec4-8476-48e3-90a8-3db6b14f538c');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASAAS_API_KEY_TMSECURITY_60;
    clearTransferEnv();
  }
});

test('transferPixFromCompanyCore erro claro se chave Gestão vazia', async () => {
  const prev = process.env.ASAAS_TMGESTAO_API;
  const prevTm = process.env.TMGESTAO;
  const prevApi = process.env.ASAAS_API_KEY;
  delete process.env.ASAAS_TMGESTAO_API;
  delete process.env.TMGESTAO;
  delete process.env.ASAAS_API_KEY;
  try {
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    await assert.rejects(
      () => transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 50 }),
      /ASAAS_TMGESTAO_API|TMGESTAO/,
    );
  } finally {
    if (prev === undefined) delete process.env.ASAAS_TMGESTAO_API;
    else process.env.ASAAS_TMGESTAO_API = prev;
    if (prevTm === undefined) delete process.env.TMGESTAO;
    else process.env.TMGESTAO = prevTm;
    if (prevApi === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = prevApi;
  }
});
