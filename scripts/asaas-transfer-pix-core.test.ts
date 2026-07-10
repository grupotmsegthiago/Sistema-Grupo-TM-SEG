import test from 'node:test';
import assert from 'node:assert/strict';

test('transferPixFromCompanyCore valida empresa e chama Asaas', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/finance/balance')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ balance: 500, totalPending: 0 }),
      } as Response;
    }
    if (url.includes('/transfers')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ id: 'tr_1', status: 'PENDING' }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'key-gestao';
    const { transferPixFromCompanyCore, isKnownAsaasCompany } = await import(
      '../server/asaasTransferPixCore.ts'
    );
    assert.equal(isKnownAsaasCompany('TM GESTÃO'), true);
    const result = await transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 50 });
    assert.equal(result.id, 'tr_1');
    assert.equal(calls.length, 2);
    const transferBody = JSON.parse(String(calls[1].init?.body || '{}'));
    assert.equal(transferBody.value, 50);
    assert.equal(transferBody.pixAddressKey, 'financeiro@grupotmseg.com.br');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transferPixFromCompanyCore rejeita valor acima do disponível', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    text: async () => JSON.stringify({ balance: 500 }),
  })) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'key-gestao';
    const { transferPixFromCompanyCore } = await import('../server/asaasTransferPixCore.ts');
    await assert.rejects(
      () => transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 401 }),
      /máximo/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
