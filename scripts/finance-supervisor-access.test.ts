import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFinanceSupervisorName, normalizePersonName } from '../lib/financeSupervisorAccess';

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
