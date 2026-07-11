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
