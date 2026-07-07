import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roleCanAccessEmployees } from '../lib/rh/apiEmployeesAuth';
import { canAccessEmployeesScreen, canAccessRhScreen } from '../lib/rh/permissions';

describe('RH employees access', () => {
  it('libera somente diretoria e rh', () => {
    assert.equal(roleCanAccessEmployees('diretoria'), true);
    assert.equal(roleCanAccessEmployees('rh'), true);
    assert.equal(roleCanAccessEmployees('financeiro'), false);
    assert.equal(roleCanAccessEmployees('administrador'), false);
    assert.equal(roleCanAccessEmployees('operador'), false);
  });

  it('canAccessEmployeesScreen no client', () => {
    assert.equal(canAccessEmployeesScreen({ role: 'Diretoria' }), true);
    assert.equal(canAccessEmployeesScreen({ role: 'RH' }), true);
    assert.equal(canAccessEmployeesScreen({ role: 'Financeiro' }), false);
    assert.equal(canAccessEmployeesScreen({ role: 'Administrador' }), false);
  });

  it('canAccessRhScreen bloqueia funcionários para financeiro', () => {
    const financeiro = { role: 'financeiro', permissions: ['rh-dashboard'] };
    assert.equal(canAccessRhScreen('rh-dashboard', financeiro), true);
    assert.equal(canAccessRhScreen('rh-employees', financeiro), false);
    assert.equal(canAccessRhScreen('rh-employee-workspace', financeiro), false);
  });

  it('canAccessRhScreen libera funcionários para diretoria e rh', () => {
    assert.equal(canAccessRhScreen('rh-employees', { role: 'diretoria' }), true);
    assert.equal(canAccessRhScreen('rh-employees', { role: 'rh' }), true);
  });
});
