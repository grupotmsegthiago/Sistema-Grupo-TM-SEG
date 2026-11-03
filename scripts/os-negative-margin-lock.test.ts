import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canApproveNegativeMarginLock,
  canEditNegativeMarginLockedOs,
  isNegativeMarginResult,
  isOsNegativeMarginLocked,
} from '../lib/osNegativeMarginLock';

describe('trava de prejuízo analisado', () => {
  it('libera somente Giovanna Marsili, Beatriz Rocha e Thiago Moreira', () => {
    assert.equal(canApproveNegativeMarginLock({ name: 'Giovanna Marsili André' }), true);
    assert.equal(canApproveNegativeMarginLock({ name: 'BEATRIZ ROCHA MACHADO' }), true);
    assert.equal(canApproveNegativeMarginLock({ name: 'Thiago Moreira' }), true);
  });

  it('não libera a outra Beatriz, Bárbara, Thiago Arruda nem administrador genérico', () => {
    assert.equal(canApproveNegativeMarginLock({ name: 'BEATRIZ DE CARVALHO SIMÕES' }), false);
    assert.equal(canApproveNegativeMarginLock({ name: 'Bárbara Sgarlata', role: 'administrador' }), false);
    assert.equal(canApproveNegativeMarginLock({ name: 'Thiago Arruda' }), false);
    assert.equal(canApproveNegativeMarginLock({ name: 'Thiago Santos', role: 'diretoria' }), false);
    assert.equal(canApproveNegativeMarginLock({ name: 'Daniel', role: 'administrador' }), false);
  });

  it('depois da trava só o perfil Diretoria edita', () => {
    assert.equal(canEditNegativeMarginLockedOs({ name: 'Giovanna Marsili', role: 'administrador' }), false);
    assert.equal(canEditNegativeMarginLockedOs({ name: 'Beatriz Rocha', role: 'operacional' }), false);
    assert.equal(canEditNegativeMarginLockedOs({ name: 'Thiago Moreira', role: 'administrador' }), false);
    assert.equal(canEditNegativeMarginLockedOs({ name: 'Thiago Moreira', role: 'diretoria' }), true);
    assert.equal(canEditNegativeMarginLockedOs({ name: 'Outro', role: 'Diretoria' }), true);
    assert.equal(canEditNegativeMarginLockedOs({ role: 'ceo' }), false);
  });

  it('reconhece prejuízo e OS já travada', () => {
    assert.equal(isNegativeMarginResult(1000, 1200), true);
    assert.equal(isNegativeMarginResult(1000, 1000), false);
    assert.equal(isNegativeMarginResult(1500, 800), false);
    assert.equal(isOsNegativeMarginLocked({ negative_margin_locked: true }), true);
    assert.equal(isOsNegativeMarginLocked({ negative_margin_locked: false }), false);
    assert.equal(isOsNegativeMarginLocked(null), false);
  });
});
