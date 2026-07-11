import test from 'node:test';
import assert from 'node:assert/strict';

test('transferPixFromCompanyCore prioriza repasse interno por walletId', async () => {
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
      if (parsed.walletId) {
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'tr_int', type: 'INTERNAL', status: 'PENDING' }),
        } as Response;
      }
      return {
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            errors: [{ description: 'sem permissão saque' }],
          }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'key-gestao';
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    const result = await transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 50 });
    assert.equal(result.transferMode, 'INTERNAL');
    assert.equal(calls.filter((c) => c.url.includes('/transfers')).length, 1);
    const body = JSON.parse(calls.find((c) => c.url.includes('/transfers'))!.body);
    assert.equal(body.walletId, '6641fec4-8476-48e3-90a8-3db6b14f538c');
    assert.match(body.externalReference, /^tmseg-repasse-TM-GESTO-/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transferPixFromCompanyCore faz fallback Pix se interno falhar', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  let transferAttempt = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body || '');
    if (url.includes('/transfers')) calls.push({ url, body });
    if (url.includes('/finance/balance')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ balance: 500 }),
      } as Response;
    }
    if (url.includes('/transfers')) {
      transferAttempt += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.walletId) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({ errors: [{ description: 'Contas sem vínculo' }] }),
        } as Response;
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ id: 'tr_pix', operationType: 'PIX' }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as typeof fetch;

  try {
    process.env.ASAAS_API_KEY = 'key-gestao';
    const { transferPixFromCompanyCore } = await import('../lib/asaasTransferPixCore.ts');
    const result = await transferPixFromCompanyCore({ company: 'TM GESTÃO', value: 50 });
    assert.equal(result.transferMode, 'PIX');
    assert.equal(transferAttempt, 2);
    const pixBody = JSON.parse(
      calls.find((c) => c.url.includes('/transfers') && !JSON.parse(c.body).walletId)!.body,
    );
    assert.match(pixBody.externalReference, /^tmseg-repasse-TM-GESTO-/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
