import test from 'node:test';
import assert from 'node:assert/strict';
import {
  principalCanAccessAsaasApi,
  roleCanAccessAsaasApi,
} from '../lib/services/asaasAccess.ts';

test('roleCanAccessAsaasApi aceita perfis financeiros', () => {
  assert.equal(roleCanAccessAsaasApi('financeiro'), true);
  assert.equal(roleCanAccessAsaasApi('Financeiro'), true);
  assert.equal(roleCanAccessAsaasApi('diretoria'), true);
  assert.equal(roleCanAccessAsaasApi('operador'), false);
});

test('principalCanAccessAsaasApi aceita permissão fin-transactions', () => {
  const principal = {
    id: 'u1',
    name: 'Teste',
    email: 't@x.com',
    role: 'comercial',
    clientId: null,
    permissions: ['fin-transactions'],
  };
  assert.equal(principalCanAccessAsaasApi(principal), true);
});

test('principalCanAccessAsaasApi aceita wildcard', () => {
  const principal = {
    id: 'u1',
    name: 'Admin',
    email: 'a@x.com',
    role: 'rh',
    clientId: null,
    permissions: ['*'],
  };
  assert.equal(principalCanAccessAsaasApi(principal), true);
});

test('principalCanAccessAsaasApi nega sem role nem permissão', () => {
  const principal = {
    id: 'u1',
    name: 'Operador',
    email: 'o@x.com',
    role: 'operador',
    clientId: null,
    permissions: ['missions'],
  };
  assert.equal(principalCanAccessAsaasApi(principal), false);
});
