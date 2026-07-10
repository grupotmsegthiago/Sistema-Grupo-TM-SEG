import test from 'node:test';
import assert from 'node:assert/strict';

test('getAllBalancesCore consulta empresas em paralelo', async () => {
  const originalFetch = globalThis.fetch;
  let concurrent = 0;
  let maxConcurrent = 0;

  globalThis.fetch = (async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 30));
    concurrent -= 1;
    return {
      ok: true,
      text: async () => JSON.stringify({ balance: 100, totalPending: 0 }),
    } as Response;
  }) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'key-gestao';
    process.env.ASAAS_API_KEY_TMSECURITY = 'key-seg';
    process.env.ASAAS_API_KEY_TMSECURITY_60 = 'key-security';

    const { getAllBalancesCore, invalidateAsaasBalancesCoreCache } = await import('../server/asaasBalancesCore.ts');
    invalidateAsaasBalancesCoreCache();
    const balances = await getAllBalancesCore();
    assert.equal(balances.length, 3);
    assert.ok(maxConcurrent >= 2, `esperado paralelismo, maxConcurrent=${maxConcurrent}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getAllBalancesCore retorna erro por empresa sem derrubar as demais', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ errors: [{ description: 'invalid access token' }] }),
  })) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'bad-key';
    delete process.env.ASAAS_API_KEY_TMSECURITY;
    delete process.env.ASAAS_API_KEY_TMSECURITY_60;

    const { getAllBalancesCore, invalidateAsaasBalancesCoreCache } = await import('../server/asaasBalancesCore.ts');
    invalidateAsaasBalancesCoreCache();
    const balances = await getAllBalancesCore();
    assert.equal(balances.length, 3);
    assert.match(balances[0].error || '', /Asaas/i);
    assert.match(balances[1].error || '', /API Key/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
