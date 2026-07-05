import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canViewGoalMonetaryData } from '../lib/goalPermissions';

test('permissão explícita libera valores e gráfico de metas para usuários financeiros', () => {
  assert.equal(canViewGoalMonetaryData(true, 'operador'), true);
});

test('permissão explícita bloqueia valores e gráfico de metas', () => {
  assert.equal(canViewGoalMonetaryData(false, 'diretoria'), false);
});

test('sem permissão explícita mantém compatibilidade: diretoria vê valores e gráfico', () => {
  assert.equal(canViewGoalMonetaryData(undefined, 'diretoria'), true);
  assert.equal(canViewGoalMonetaryData(undefined, 'Diretoria'), true);
});

test('sem permissão explícita outros perfis não veem valores e gráfico', () => {
  assert.equal(canViewGoalMonetaryData(undefined, 'operador'), false);
});
