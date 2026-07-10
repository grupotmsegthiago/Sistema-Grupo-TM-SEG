import test from 'node:test';
import assert from 'node:assert/strict';
import { getAsaasApiKeyTmSeguranca } from '../lib/asaasEnvKeys.ts';

test('getAsaasApiKeyTmSeguranca prioriza TMSEGURANCA na Vercel', () => {
  const prev = {
    TMSEGURANCA: process.env.TMSEGURANCA,
    TMSEGURANÇA: process.env.TMSEGURANÇA,
    ASAAS_API_KEY_TMSECURITY: process.env.ASAAS_API_KEY_TMSECURITY,
    ASAAS_API_KEY_TM_SEGURANCA: process.env.ASAAS_API_KEY_TM_SEGURANCA,
  };

  try {
    delete process.env.TMSEGURANCA;
    delete process.env.TMSEGURANÇA;
    delete process.env.ASAAS_API_KEY_TMSECURITY;
    delete process.env.ASAAS_API_KEY_TM_SEGURANCA;

    process.env.TMSEGURANCA = 'chave-vercel-tmseguranca';
    process.env.ASAAS_API_KEY_TMSECURITY = 'chave-legada';
    assert.equal(getAsaasApiKeyTmSeguranca(), 'chave-vercel-tmseguranca');

    delete process.env.TMSEGURANCA;
    process.env.ASAAS_API_KEY_TMSECURITY = 'chave-legada-fallback';
    assert.equal(getAsaasApiKeyTmSeguranca(), 'chave-legada-fallback');
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
      else process.env[k] = v;
    }
  }
});
