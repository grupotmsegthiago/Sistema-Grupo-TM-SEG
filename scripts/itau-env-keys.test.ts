import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintItauSecret,
  getItauCredentials,
  normalizePem,
  parseItauCompanyParam,
  sanitizeItauEnvValue,
  summarizeItauCompanyEnv,
} from '../lib/itauEnvKeys.ts';

test('sanitizeItauEnvValue remove aspas e espaços', () => {
  assert.equal(sanitizeItauEnvValue('  "abc-123"\n'), 'abc-123');
});

test('fingerprintItauSecret é estável e curto', () => {
  const fp = fingerprintItauSecret('00000000-1111-2222-3333-444444444444');
  assert.match(fp, /^[a-f0-9]{12}$/);
  assert.equal(fp, fingerprintItauSecret('00000000-1111-2222-3333-444444444444'));
});

test('normalizePem converte \\n escapado', () => {
  const pem = normalizePem('-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----');
  assert.ok(pem.includes('\n'));
  assert.ok(pem.includes('BEGIN CERTIFICATE'));
});

test('normalizePem aceita Base64 do PEM', () => {
  const original = '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----';
  const b64 = Buffer.from(original, 'utf8').toString('base64');
  assert.equal(normalizePem(b64), original);
});

test('parseItauCompanyParam mapeia aliases', () => {
  assert.equal(parseItauCompanyParam('tmsecurity'), 'tmsecurity');
  assert.equal(parseItauCompanyParam('TMSEG'), 'tmseguranca');
  assert.equal(parseItauCompanyParam('tmgestao'), 'tmgestao');
});

test('summarizeItauCompanyEnv TM SECURITY sem vazar secret', () => {
  const prevId = process.env.ITAU_TMSECURITY_CLIENT_ID;
  const prevSecret = process.env.ITAU_TMSECURITY_CLIENT_SECRET;
  const prevCert = process.env.ITAU_TMSECURITY_CERT_PEM;
  const prevKey = process.env.ITAU_TMSECURITY_KEY_PEM;
  try {
    process.env.ITAU_TMSECURITY_CLIENT_ID = 'client-id-teste';
    process.env.ITAU_TMSECURITY_CLIENT_SECRET = 'client-secret-teste';
    delete process.env.ITAU_TMSECURITY_CERT_PEM;
    delete process.env.ITAU_TMSECURITY_KEY_PEM;

    const s = summarizeItauCompanyEnv('tmsecurity');
    assert.equal(s.clientIdConfigured, true);
    assert.equal(s.clientSecretConfigured, true);
    assert.equal(s.certConfigured, false);
    assert.equal(s.readyForToken, false);
    assert.ok(s.hint?.includes('CERT_PEM'));
    assert.equal(s.clientIdFingerprint, fingerprintItauSecret('client-id-teste'));
    assert.equal(JSON.stringify(s).includes('client-secret-teste'), false);
  } finally {
    if (prevId === undefined) delete process.env.ITAU_TMSECURITY_CLIENT_ID;
    else process.env.ITAU_TMSECURITY_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.ITAU_TMSECURITY_CLIENT_SECRET;
    else process.env.ITAU_TMSECURITY_CLIENT_SECRET = prevSecret;
    if (prevCert === undefined) delete process.env.ITAU_TMSECURITY_CERT_PEM;
    else process.env.ITAU_TMSECURITY_CERT_PEM = prevCert;
    if (prevKey === undefined) delete process.env.ITAU_TMSECURITY_KEY_PEM;
    else process.env.ITAU_TMSECURITY_KEY_PEM = prevKey;
  }
});

test('getItauCredentials lê TM SECURITY', () => {
  const prev = process.env.ITAU_TMSECURITY_CLIENT_ID;
  process.env.ITAU_TMSECURITY_CLIENT_ID = 'id-security';
  try {
    assert.equal(getItauCredentials('tmsecurity').clientId, 'id-security');
  } finally {
    if (prev === undefined) delete process.env.ITAU_TMSECURITY_CLIENT_ID;
    else process.env.ITAU_TMSECURITY_CLIENT_ID = prev;
  }
});
