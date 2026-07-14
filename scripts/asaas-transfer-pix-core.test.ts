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

test('shouldPreferPixTransfer: três contas usam Pix primeiro por padrão', async () => {
  clearTransferEnv();
  const { shouldPreferPixTransfer } = await import('../lib/asaasTransferPixCore.ts');
  assert.equal(shouldPreferPixTransfer('TM GESTÃO'), true);
  assert.equal(shouldPreferPixTransfer('TM SEGURANCA'), true);
  assert.equal(shouldPreferPixTransfer('TM SECURITY'), true);

  process.env.ASAAS_TRANSFER_PIX_FIRST = 'false';
  assert.equal(shouldPreferPixTransfer('TM GESTÃO'), false);
  assert.equal(shouldPreferPixTransfer('TM SECURITY'), false);
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

test('transferPixFromCompanyCore (Security) tenta Pix antes do interno', async () => {
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
        text: async () => JSON.stringify({ id: 'tr_pix', operationType: 'PIX', status: 'PENDING' }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    clearTransferEnv();
    process.env.ASAAS_TMSECURITY_API = 'key-security-nova';
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    const result = await transferPixFromCompanyCore({ company: 'TM SECURITY', value: 50 });
    assert.equal(result.transferMode, 'PIX');
    const body = JSON.parse(calls.find((c) => c.url.includes('/transfers'))!.body);
    assert.equal(body.operationType, 'PIX');
    assert.equal(body.pixAddressKey, 'financeiro@grupotmseg.com.br');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASAAS_TMSECURITY_API;
    clearTransferEnv();
  }
});

test('transferPixFromCompanyCore erro claro se chave Security vazia', async () => {
  const prevs = {
    ASAAS_TMSECURITY_API: process.env.ASAAS_TMSECURITY_API,
    TMSECURITY: process.env.TMSECURITY,
    ASAAS_API_KEY_TMSECURITY_60: process.env.ASAAS_API_KEY_TMSECURITY_60,
    ASAAS_API_KEY_TM_SECURITY: process.env.ASAAS_API_KEY_TM_SECURITY,
  };
  for (const k of Object.keys(prevs)) delete process.env[k];
  try {
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    await assert.rejects(
      () => transferPixFromCompanyCore({ company: 'TM SECURITY', value: 50 }),
      /ASAAS_TMSECURITY_API|TMSECURITY/,
    );
  } finally {
    for (const [k, v] of Object.entries(prevs)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('transferPixFromCompanyCore erro claro se chave Gestão vazia', async () => {
  const keys = [
    'Asaas_TMSEGESTÃO_API',
    'ASAAS_TMSEGESTÃO_API',
    'Asaas_TMSEGESTAO_API',
    'ASAAS_TMSEGESTAO_API',
    'ASAAS_TMGESTAO_API',
    'TMGESTAO',
    'ASAAS_API_KEY',
    'ASAAS_API_KEY_TMGESTAO',
  ];
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    await assert.rejects(
      () => transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 50 }),
      /Asaas_TMSEGESTÃO_API|ASAAS_TMGESTAO_API|TMGESTAO/,
    );
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
