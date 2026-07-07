import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roleCanAccessEmployees } from '../lib/rh/apiEmployeesAuth';
import { canAccessRhModule, canAccessRhScreen } from '../lib/rh/permissions';

describe('RH employees access', () => {
  it('libera somente diretoria e rh', () => {
    assert.equal(roleCanAccessEmployees('diretoria'), true);
    assert.equal(roleCanAccessEmployees('rh'), true);
    assert.equal(roleCanAccessEmployees('financeiro'), false);
    assert.equal(roleCanAccessEmployees('administrador'), false);
    assert.equal(roleCanAccessEmployees('operador'), false);
  });

  it('canAccessRhModule no client', () => {
    assert.equal(canAccessRhModule({ role: 'Diretoria' }), true);
    assert.equal(canAccessRhModule({ role: 'RH' }), true);
    assert.equal(canAccessRhModule({ role: 'Financeiro' }), false);
    assert.equal(canAccessRhModule({ role: 'Administrador' }), false);
    assert.equal(canAccessRhModule({ role: 'financeiro', permissions: ['rh-dashboard'] }), false);
  });

  it('canAccessRhScreen bloqueia todo módulo RH para financeiro e administrador', () => {
    const financeiro = { role: 'financeiro', permissions: ['rh-dashboard', 'rh-timeclock'] };
    assert.equal(canAccessRhScreen('rh-dashboard', financeiro), false);
    assert.equal(canAccessRhScreen('rh-employees', financeiro), false);
    assert.equal(canAccessRhScreen('rh-timeclock', financeiro), false);
    assert.equal(canAccessRhScreen('rh-dashboard', { role: 'administrador' }), false);
  });

  it('canAccessRhScreen libera módulo RH para diretoria e rh', () => {
    assert.equal(canAccessRhScreen('rh-dashboard', { role: 'diretoria' }), true);
    assert.equal(canAccessRhScreen('rh-employees', { role: 'diretoria' }), true);
    assert.equal(canAccessRhScreen('rh-timeclock', { role: 'rh' }), true);
  });
});
