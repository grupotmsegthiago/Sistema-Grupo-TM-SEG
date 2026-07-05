import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canViewGoalMonetaryData } from '../lib/goalPermissions';

test('permissão explícita não libera valores e gráfico de metas para perfis que não sejam diretoria', () => {
  assert.equal(canViewGoalMonetaryData(true, 'operador'), false);
  assert.equal(canViewGoalMonetaryData(true, 'administrador'), false);
  assert.equal(canViewGoalMonetaryData(true, 'controller'), false);
});

test('permissão explícita false bloqueia valores e gráfico mesmo para diretoria', () => {
  assert.equal(canViewGoalMonetaryData(false, 'diretoria'), false);
});

test('somente diretoria vê valores e gráfico de metas', () => {
  assert.equal(canViewGoalMonetaryData(undefined, 'diretoria'), true);
  assert.equal(canViewGoalMonetaryData(undefined, 'Diretoria'), true);
});

test('outros perfis não veem valores e gráfico de metas', () => {
  assert.equal(canViewGoalMonetaryData(undefined, 'operador'), false);
  assert.equal(canViewGoalMonetaryData(undefined, 'administrador'), false);
  assert.equal(canViewGoalMonetaryData(undefined, 'controller'), false);
});
