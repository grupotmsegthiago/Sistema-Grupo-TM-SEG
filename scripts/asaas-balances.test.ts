import test from 'node:test';
import assert from 'node:assert/strict';

test('getAllBalances consulta empresas em paralelo', async () => {
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
      json: async () => ({ balance: 100, totalPending: 0 }),
    } as Response;
  }) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'key-gestao';
    process.env.ASAAS_API_KEY_TMSECURITY = 'key-seg';
    process.env.ASAAS_API_KEY_TMSECURITY_60 = 'key-security';

    const { getAllBalances } = await import('../server/asaasService.ts');
    const balances = await getAllBalances();
    assert.equal(balances.length, 3);
    assert.ok(maxConcurrent >= 2, `esperado paralelismo, maxConcurrent=${maxConcurrent}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
