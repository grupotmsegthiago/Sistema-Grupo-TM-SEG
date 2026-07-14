import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintAsaasKey,
  sanitizeAsaasEnvValue,
  summarizeAsaasKeyEnv,
} from '../lib/asaasEnvKeys.ts';

test('sanitizeAsaasEnvValue remove aspas e quebras de linha', () => {
  assert.equal(sanitizeAsaasEnvValue('  "$aact_prod_x"\n'), '$aact_prod_x');
});

test('fingerprintAsaasKey é estável e não vaza a chave', () => {
  const fp = fingerprintAsaasKey('$aact_prod_test_key_12345');
  assert.match(fp, /^[a-f0-9]{12}$/);
  assert.equal(fp, fingerprintAsaasKey('$aact_prod_test_key_12345'));
});

test('summarizeAsaasKeyEnv não expõe valor da chave', async () => {
  const prev = process.env.TMSEGURANCA;
  process.env.TMSEGURANCA = '$aact_prod_test_key_12345';
  try {
    const s = await summarizeAsaasKeyEnv(['TMSEGURANCA']);
    assert.equal(s.configured, true);
    assert.equal(s.sourceEnv, 'TMSEGURANCA');
    assert.equal(s.production, true);
    assert.equal(s.sandbox, false);
    assert.ok(s.length > 10);
    assert.equal(s.fingerprint, fingerprintAsaasKey('$aact_prod_test_key_12345'));
  } finally {
    if (prev === undefined) delete process.env.TMSEGURANCA;
    else process.env.TMSEGURANCA = prev;
  }
});

test('getAsaasApiKeyTmGestao prioriza Asaas_TMSEGESTÃO_API', async () => {
  const { getAsaasApiKeyTmGestao } = await import('../lib/asaasEnvKeys.ts');
  const keys = [
    'Asaas_TMSEGESTÃO_API',
    'ASAAS_TMSEGESTÃO_API',
    'Asaas_TMSEGESTAO_API',
    'ASAAS_TMSEGESTAO_API',
    'ASAAS_TMGESTAO_API',
    'TMGESTAO',
    'ASAAS_API_KEY',
  ];
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  try {
    process.env.ASAAS_TMGESTAO_API = '$aact_prod_gestao_legado';
    assert.equal(getAsaasApiKeyTmGestao(), '$aact_prod_gestao_legado');
    process.env['Asaas_TMSEGESTÃO_API'] = '$aact_prod_gestao_oficial';
    assert.equal(getAsaasApiKeyTmGestao(), '$aact_prod_gestao_oficial');
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getAsaasApiKeyTmSecurity prioriza ASAAS_TMSECURITY_API', async () => {
  const { getAsaasApiKeyTmSecurity } = await import('../lib/asaasEnvKeys.ts');
  const prevTm = process.env.TMSECURITY;
  const prevA = process.env.ASAAS_TMSECURITY_API;
  const prevB = process.env.ASAAS_API_KEY_TMSECURITY_60;
  delete process.env.TMSECURITY;
  process.env.ASAAS_TMSECURITY_API = '$aact_prod_security_nova';
  process.env.ASAAS_API_KEY_TMSECURITY_60 = '$aact_prod_security_legado';
  try {
    assert.equal(getAsaasApiKeyTmSecurity(), '$aact_prod_security_nova');
  } finally {
    if (prevTm === undefined) delete process.env.TMSECURITY;
    else process.env.TMSECURITY = prevTm;
    if (prevA === undefined) delete process.env.ASAAS_TMSECURITY_API;
    else process.env.ASAAS_TMSECURITY_API = prevA;
    if (prevB === undefined) delete process.env.ASAAS_API_KEY_TMSECURITY_60;
    else process.env.ASAAS_API_KEY_TMSECURITY_60 = prevB;
  }
});
