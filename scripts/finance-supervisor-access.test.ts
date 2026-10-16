import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSeeMissionBillingSummary,
  canSeeOsComPrejuizo,
  isFinanceProfileRole,
  isFinanceSupervisorName,
  normalizePersonName,
} from '../lib/financeSupervisorAccess';

describe('financeSupervisorAccess', () => {
  it('reconhece Bárbara com e sem acento', () => {
    assert.equal(isFinanceSupervisorName('Barbara Sgarlata'), true);
    assert.equal(isFinanceSupervisorName('Bárbara Sgarlata'), true);
    assert.equal(isFinanceSupervisorName('BARBARA'), true);
  });

  it('reconhece Giovanna Marsili (mesmo acesso da Bárbara)', () => {
    assert.equal(isFinanceSupervisorName('Giovanna Marsili'), true);
    assert.equal(isFinanceSupervisorName('giovanna marsili andré'), true);
  });

  it('não marca outros nomes', () => {
    assert.equal(isFinanceSupervisorName('Simone Borges'), false);
    assert.equal(isFinanceSupervisorName('Daniel'), false);
    assert.equal(isFinanceSupervisorName(''), false);
    assert.equal(isFinanceSupervisorName(null), false);
  });

  it('normalizePersonName remove acentos', () => {
    assert.equal(normalizePersonName('Bárbara'), 'barbara');
  });
});

describe('canSeeOsComPrejuizo', () => {
  it('libera Barbara, Daniel e Giovanna pelo nome', () => {
    assert.equal(canSeeOsComPrejuizo({ name: 'Barbara Sgarlata', role: 'financeiro' }), true);
    assert.equal(canSeeOsComPrejuizo({ name: 'DANIEL LIMA', role: 'operacional' }), true);
    assert.equal(canSeeOsComPrejuizo({ name: 'Giovanna Marsili', role: 'financeiro' }), true);
  });

  it('libera perfil administrador mesmo sem nome especial', () => {
    assert.equal(canSeeOsComPrejuizo({ name: 'Usuario X', role: 'administrador' }), true);
    assert.equal(canSeeOsComPrejuizo({ name: 'Usuario X', role: 'Administrador' }), true);
  });

  it('bloqueia comercial e usuário sem perfil financeiro', () => {
    assert.equal(canSeeOsComPrejuizo({ name: 'Vendedor', role: 'comercial' }), false);
    assert.equal(canSeeOsComPrejuizo({ name: 'Operacional', role: 'operacional' }), false);
    assert.equal(canSeeOsComPrejuizo(null), false);
  });
});

describe('isFinanceProfileRole', () => {
  it('reconhece o perfil Financeiro', () => {
    assert.equal(isFinanceProfileRole('Financeiro'), true);
    assert.equal(isFinanceProfileRole('financeiro'), true);
  });

  it('não libera comercial nem diretoria por esse atalho', () => {
    assert.equal(isFinanceProfileRole('Comercial'), false);
    assert.equal(isFinanceProfileRole('Diretoria'), false);
    assert.equal(isFinanceProfileRole(null), false);
  });
});

describe('canSeeMissionBillingSummary', () => {
  it('libera o perfil Financeiro no card da OS', () => {
    assert.equal(canSeeMissionBillingSummary({ name: 'Analista', role: 'Financeiro' }), true);
    assert.equal(canSeeMissionBillingSummary({ name: 'Analista', role: 'financeiro' }), true);
  });

  it('mantém diretoria e administrador e bloqueia operacional', () => {
    assert.equal(canSeeMissionBillingSummary({ name: 'Thiago', role: 'Diretoria' }), true);
    assert.equal(canSeeMissionBillingSummary({ name: 'Admin', role: 'administrador' }), true);
    assert.equal(canSeeMissionBillingSummary({ name: 'Operacional', role: 'operacional' }), false);
    assert.equal(canSeeMissionBillingSummary(null), false);
  });
});
