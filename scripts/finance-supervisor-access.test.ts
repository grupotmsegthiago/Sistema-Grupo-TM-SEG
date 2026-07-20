import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSeeOsComPrejuizo,
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
