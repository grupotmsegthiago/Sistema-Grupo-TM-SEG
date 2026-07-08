import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRouteDistanceKm, normalizeRouteAddress } from '../lib/routeDistance.ts';

describe('routeDistance', () => {
  it('normaliza endereço com Brasil', () => {
    assert.equal(normalizeRouteAddress('Campinas'), 'Campinas, Brasil');
    assert.equal(normalizeRouteAddress('Campinas, Brasil'), 'Campinas, Brasil');
  });

  it('calcula Campinas → Barueri com sucesso', async () => {
    const result = await computeRouteDistanceKm('CAMPINAS', 'BARUERI');
    assert.equal(result.success, true);
    assert.ok((result.distanceKm || 0) > 50);
  });
});
