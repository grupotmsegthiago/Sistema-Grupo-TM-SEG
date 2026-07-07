import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickRouteEndpoints } from '../lib/resolveRouteDistanceClient.ts';

describe('resolveRouteDistanceClient', () => {
  it('prefere endereço mais completo entre rota e formulário', () => {
    const picked = pickRouteEndpoints(
      { origin: 'CAMPINAS', destination: 'BARUERI' },
      'CAMPINAS, SP, BRASIL',
      'BARUERI, SP, BRASIL',
    );
    assert.equal(picked.origin, 'CAMPINAS, SP, BRASIL');
    assert.equal(picked.destination, 'BARUERI, SP, BRASIL');
  });
});
