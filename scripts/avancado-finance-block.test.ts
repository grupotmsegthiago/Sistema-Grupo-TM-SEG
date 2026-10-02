import test from 'node:test';
import assert from 'node:assert/strict';
import { isPerfilAvancado, telaFinanceiraOcultaParaAvancado } from '../lib/avancadoFinanceBlock';
import { canAccessScreen } from '../lib/screenAccess';

test('reconhece o perfil Avançado com e sem acento', () => {
  assert.equal(isPerfilAvancado({ role: 'Avançado' }), true);
  assert.equal(isPerfilAvancado({ role: 'avancado' }), true);
  assert.equal(isPerfilAvancado({ role: 'Operador' }), false);
  assert.equal(isPerfilAvancado(null), false);
});

test('Avançado não abre tela financeira nem com permissão marcada', () => {
  const user = { role: 'Avançado', permissions: ['fin-dashboard', 'finance-group', 'diretoria-faturamento', 'missions', '*'] };
  assert.equal(canAccessScreen(user, 'fin-dashboard'), false);
  assert.equal(canAccessScreen(user, 'finance-group'), false);
  assert.equal(canAccessScreen(user, 'diretoria-faturamento'), false);
  assert.equal(canAccessScreen(user, 'quotes'), false);
  assert.equal(canAccessScreen(user, 'missions'), true);
  assert.equal(telaFinanceiraOcultaParaAvancado('fin-billing'), true);
  assert.equal(telaFinanceiraOcultaParaAvancado('missions'), false);
});
