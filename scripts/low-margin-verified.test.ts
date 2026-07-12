import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLowMarginVerified, type LowMarginVerifiedEntry } from '../lib/lowMarginVerified';

describe('lowMarginVerified', () => {
  it('reconhece verificação com mesmos valores', () => {
    const map: Record<string, LowMarginVerifiedEntry> = {
      'GTM-100': {
        missionId: 'GTM-100',
        at: new Date().toISOString(),
        by: 'Thiago',
        rev: 1000,
        cost: 900,
      },
    };
    assert.equal(isLowMarginVerified(map, 'GTM-100', 1000, 900), true);
    assert.equal(isLowMarginVerified(map, 'GTM-100', 1000.01, 900), true);
  });

  it('reexibe OS se receita ou custo mudarem após verificação', () => {
    const map: Record<string, LowMarginVerifiedEntry> = {
      'GTM-200': {
        missionId: 'GTM-200',
        at: new Date().toISOString(),
        by: 'Test',
        rev: 500,
        cost: 450,
      },
    };
    assert.equal(isLowMarginVerified(map, 'GTM-200', 500, 450), true);
    assert.equal(isLowMarginVerified(map, 'GTM-200', 520, 450), false);
    assert.equal(isLowMarginVerified(map, 'GTM-200', 500, 470), false);
  });
});
