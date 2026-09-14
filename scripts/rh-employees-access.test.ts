import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roleCanAccessEmployees } from '../lib/rh/apiEmployeesAuth';
import { canAccessRhModule, canAccessRhScreen } from '../lib/rh/permissions';

describe('RH employees access', () => {
  it('API libera somente diretoria e rh (role no backend)', () => {
    assert.equal(roleCanAccessEmployees('diretoria'), true);
    assert.equal(roleCanAccessEmployees('rh'), true);
    assert.equal(roleCanAccessEmployees('financeiro'), false);
    assert.equal(roleCanAccessEmployees('administrador'), false);
    assert.equal(roleCanAccessEmployees('operador'), false);
  });

  it('UI do módulo RH exige telas vinculadas no perfil', () => {
    assert.equal(canAccessRhModule({ role: 'Diretoria' }), false);
    assert.equal(canAccessRhModule({ role: 'RH' }), false);
    assert.equal(canAccessRhModule({ role: 'RH', permissions: ['rh-dashboard'] }), true);
    assert.equal(canAccessRhModule({ role: 'Financeiro', permissions: ['rh-dashboard'] }), true);
    assert.equal(canAccessRhModule({ role: 'Financeiro' }), false);
    assert.equal(canAccessRhModule({ role: 'Administrador', permissions: ['*'] }), true);
  });

  it('canAccessRhScreen respeita só o vínculo do perfil (não o nome do role)', () => {
    const financeiroComRh = { role: 'financeiro', permissions: ['rh-dashboard', 'rh-timeclock'] };
    assert.equal(canAccessRhScreen('rh-dashboard', financeiroComRh), true);
    assert.equal(canAccessRhScreen('rh-timeclock', financeiroComRh), true);
    assert.equal(canAccessRhScreen('rh-employees', financeiroComRh), false);
    assert.equal(canAccessRhScreen('rh-dashboard', { role: 'administrador' }), false);
    assert.equal(canAccessRhScreen('rh-dashboard', { role: 'diretoria' }), false);
  });

  it('canAccessRhScreen libera quando o perfil traz a tela', () => {
    assert.equal(canAccessRhScreen('rh-dashboard', { role: 'diretoria', permissions: ['rh-dashboard'] }), true);
    assert.equal(canAccessRhScreen('rh-employees', { role: 'diretoria', permissions: ['rh-employees'] }), true);
    assert.equal(canAccessRhScreen('rh-timeclock', { role: 'rh', permissions: ['rh-timeclock'] }), true);
  });
});
