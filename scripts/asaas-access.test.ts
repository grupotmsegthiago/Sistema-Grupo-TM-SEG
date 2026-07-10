import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAsaasApiAccess,
  principalCanAccessAsaasApi,
  roleCanAccessAsaasApi,
} from '../lib/asaasApiAuth.ts';

test('roleCanAccessAsaasApi aceita perfis financeiros', () => {
  assert.equal(roleCanAccessAsaasApi('financeiro'), true);
  assert.equal(roleCanAccessAsaasApi('Financeiro'), true);
  assert.equal(roleCanAccessAsaasApi('diretoria'), true);
  assert.equal(roleCanAccessAsaasApi('operador'), false);
});

test('principalCanAccessAsaasApi aceita permissão fin-transactions', () => {
  assert.equal(
    principalCanAccessAsaasApi({ role: 'comercial', permissions: ['fin-transactions'] }),
    true,
  );
});

test('principalCanAccessAsaasApi aceita qualquer permissão fin-*', () => {
  assert.equal(
    principalCanAccessAsaasApi({ role: 'comercial', permissions: ['fin-dashboard'] }),
    true,
  );
});

test('principalCanAccessAsaasApi aceita wildcard', () => {
  assert.equal(
    principalCanAccessAsaasApi({ role: 'rh', permissions: ['*'] }),
    true,
  );
});

test('principalCanAccessAsaasApi nega sem role nem permissão', () => {
  assert.equal(
    principalCanAccessAsaasApi({ role: 'operador', permissions: ['missions'] }),
    false,
  );
});

test('assertAsaasApiAccess aceita fallback por headers quando userId confere', async () => {
  const token = 'tmseg-token-42-1783678641263';
  const denied = await assertAsaasApiAccess(token, {
    headers: {
      'x-tmseg-user-id': '42',
      'x-tmseg-role': 'financeiro',
      'x-tmseg-permissions': '[]',
    },
  });
  assert.equal(denied, null);
});

test('assertAsaasApiAccess nega headers com userId divergente', async () => {
  const token = 'tmseg-token-42-1783678641263';
  const denied = await assertAsaasApiAccess(token, {
    headers: {
      'x-tmseg-user-id': '99',
      'x-tmseg-role': 'financeiro',
      'x-tmseg-permissions': '[]',
    },
  });
  assert.equal(denied, 'Permissão negada');
});
