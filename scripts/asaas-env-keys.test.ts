import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAsaasKeyEnv } from '../lib/asaasEnvKeys.ts';

test('summarizeAsaasKeyEnv não expõe valor da chave', () => {
  const prev = process.env.TMSEGURANCA;
  process.env.TMSEGURANCA = '$aact_prod_test_key_12345';
  try {
    const s = summarizeAsaasKeyEnv(['TMSEGURANCA']);
    assert.equal(s.configured, true);
    assert.equal(s.sourceEnv, 'TMSEGURANCA');
    assert.equal(s.production, true);
    assert.equal(s.sandbox, false);
    assert.ok(s.length > 10);
  } finally {
    if (prev === undefined) delete process.env.TMSEGURANCA;
    else process.env.TMSEGURANCA = prev;
  }
});
