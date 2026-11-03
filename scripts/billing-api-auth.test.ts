import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBillingApiAccess,
  roleCanAccessBillingApi,
} from '../lib/billingApiAuth.ts';

test('roleCanAccessBillingApi aceita diretoria, administrador e ceo', () => {
  assert.equal(roleCanAccessBillingApi('diretoria'), true);
  assert.equal(roleCanAccessBillingApi('Diretoria'), true);
  assert.equal(roleCanAccessBillingApi('administrador'), true);
  assert.equal(roleCanAccessBillingApi('ceo'), true);
  assert.equal(roleCanAccessBillingApi('financeiro'), false);
  assert.equal(roleCanAccessBillingApi('rh'), false);
});

test('assertBillingApiAccess recusa token antigo mesmo com perfil no navegador', async () => {
  const token = 'tmseg-token-42-1783678641263';
  const denied = await assertBillingApiAccess(token, {
    headers: {
      'x-tmseg-user-id': '42',
      'x-tmseg-role': 'Diretoria',
      'x-tmseg-permissions': '[]',
    },
  });
  assert.equal(denied, 'Não autorizado');
});

test('assertBillingApiAccess nega token antigo com userId divergente', async () => {
  const token = 'tmseg-token-42-1783678641263';
  const denied = await assertBillingApiAccess(token, {
    headers: {
      'x-tmseg-user-id': '99',
      'x-tmseg-role': 'Diretoria',
      'x-tmseg-permissions': '[]',
    },
  });
  assert.equal(denied, 'Não autorizado');
});

test('assertBillingApiAccess nega token antigo de financeiro', async () => {
  const token = 'tmseg-token-42-1783678641263';
  const denied = await assertBillingApiAccess(token, {
    headers: {
      'x-tmseg-user-id': '42',
      'x-tmseg-role': 'financeiro',
      'x-tmseg-permissions': '[]',
    },
  });
  assert.equal(denied, 'Não autorizado');
});
