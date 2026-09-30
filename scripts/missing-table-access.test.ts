import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeMissingTableAlert, mustForceMissingTable } from '../lib/missingTableAccess';

test('perfil Operador não vê OS sem Tabela, mesmo com nome da exceção', () => {
  const operador = { role: 'Operador', name: 'Barbara Operação', permissions: ['missions'] };
  assert.equal(canSeeMissingTableAlert(operador), false);
  assert.equal(mustForceMissingTable(operador), false);
  assert.equal(canSeeMissingTableAlert({ role: 'operador', name: 'Plantão', permissions: ['*'] }), false);
});

test('Administrador e Avançado continuam vendo e o alerta abre sozinho', () => {
  assert.equal(canSeeMissingTableAlert({ role: 'Administrador', name: 'Bárbara Sgarlata' }), true);
  assert.equal(mustForceMissingTable({ role: 'Administrador', name: 'Bárbara Sgarlata' }), true);
  assert.equal(canSeeMissingTableAlert({ role: 'Avançado', name: 'Supervisão' }), true);
  assert.equal(mustForceMissingTable({ role: 'AVANÇADO', name: 'Supervisão' }), true);
});

test('comercial e operador sem exceção também ficam de fora', () => {
  assert.equal(canSeeMissingTableAlert({ role: 'comercial', name: 'Vendas' }), false);
  assert.equal(canSeeMissingTableAlert({ role: 'Operador', name: 'Michele' }), false);
});
