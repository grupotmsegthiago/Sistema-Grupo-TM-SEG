/**
 * Garante que a service_role do projeto TM SEG não é descartada por engano
 * (bug: comparar ref do JWT com decodeJwtProjectRef(URL) → sempre rejeita).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TMSEG_SUPABASE_PROJECT_REF } from '../lib/supabaseDefaults.js';
import { isTmSegServiceRoleKey } from '../lib/supabaseAdmin.js';
import { decodeJwtProjectRef, extractSupabaseProjectRef } from '../lib/supabasePublicEnv.js';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.testsig`;
}

describe('isTmSegServiceRoleKey', () => {
  it('aceita service_role do projeto TM SEG', () => {
    const key = makeJwt({ role: 'service_role', ref: TMSEG_SUPABASE_PROJECT_REF });
    assert.deepEqual(isTmSegServiceRoleKey(key), { ok: true });
  });

  it('rejeita service_role de outro projeto', () => {
    const key = makeJwt({ role: 'service_role', ref: 'outroprojetoxxxx' });
    assert.deepEqual(isTmSegServiceRoleKey(key), { ok: false, reason: 'foreign_project' });
  });

  it('rejeita chave ANON mesmo com ref TM SEG', () => {
    const key = makeJwt({ role: 'anon', ref: TMSEG_SUPABASE_PROJECT_REF });
    assert.deepEqual(isTmSegServiceRoleKey(key), { ok: false, reason: 'anon_role' });
  });
});

describe('comparação de project ref (regressão do bug)', () => {
  it('extractSupabaseProjectRef na URL bate com o ref do JWT TM SEG', () => {
    const url = `https://${TMSEG_SUPABASE_PROJECT_REF}.supabase.co`;
    const key = makeJwt({ role: 'service_role', ref: TMSEG_SUPABASE_PROJECT_REF });
    assert.equal(extractSupabaseProjectRef(url), TMSEG_SUPABASE_PROJECT_REF);
    assert.equal(decodeJwtProjectRef(key), TMSEG_SUPABASE_PROJECT_REF);
    // O bug antigo usava decodeJwtProjectRef(url), que sempre falha:
    assert.equal(decodeJwtProjectRef(url), null);
    assert.notEqual(decodeJwtProjectRef(key), decodeJwtProjectRef(url));
  });
});
