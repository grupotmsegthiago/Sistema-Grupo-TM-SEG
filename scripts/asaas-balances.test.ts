import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('api asaas-balances importa core de lib/ (Vercel serverless)', () => {
  const src = fs.readFileSync('api/asaas-balances.ts', 'utf8');
  assert.match(src, /lib\/asaasBalancesCore/);
  assert.doesNotMatch(src, /server\/asaasBalancesCore/);
});

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
    process.env.ASAAS_TMGESTAO_API = 'key-gestao';
    process.env.ASAAS_API_KEY = 'key-gestao-legado';
    process.env.ASAAS_API_KEY_TMSECURITY = 'key-seg';
    process.env.ASAAS_API_KEY_TMSECURITY_60 = 'key-security';

    const { getAllBalancesCore, invalidateAsaasBalancesCoreCache } = await import('../lib/asaasBalancesCore.ts');
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
  const prev = {
    ASAAS_TMGESTAO_API: process.env.ASAAS_TMGESTAO_API,
    ASAAS_API_KEY: process.env.ASAAS_API_KEY,
    TMSEGURANCA: process.env.TMSEGURANCA,
    ASAAS_TMSEGURANCA_API: process.env.ASAAS_TMSEGURANCA_API,
    ASAAS_API_KEY_TMSECURITY: process.env.ASAAS_API_KEY_TMSECURITY,
    ASAAS_API_KEY_TMSECURITY_60: process.env.ASAAS_API_KEY_TMSECURITY_60,
    ASAAS_API_KEY_TM_SECURITY: process.env.ASAAS_API_KEY_TM_SECURITY,
  };
  globalThis.fetch = (async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ errors: [{ description: 'invalid access token' }] }),
  })) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'bad-key';
    delete process.env.ASAAS_TMGESTAO_API;
    delete process.env.TMSEGURANCA;
    delete process.env.ASAAS_TMSEGURANCA_API;
    delete process.env.ASAAS_API_KEY_TMSECURITY;
    delete process.env.ASAAS_API_KEY_TMSECURITY_60;
    delete process.env.ASAAS_API_KEY_TM_SECURITY;

    const { getAllBalancesCore, invalidateAsaasBalancesCoreCache } = await import('../lib/asaasBalancesCore.ts');
    invalidateAsaasBalancesCoreCache();
    const balances = await getAllBalancesCore();
    assert.equal(balances.length, 3);
    assert.match(balances[0].error || '', /Asaas|inválida|expirada/i);
    assert.match(balances[1].error || '', /Chave API não configurada|API Key/i);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
