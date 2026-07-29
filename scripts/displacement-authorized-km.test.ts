import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDisplacementFromAuthorizedKm } from '../lib/financialUtils.ts';

describe('resolveDisplacementFromAuthorizedKm', () => {
  it('deriva cliente e fornecedor a partir do KM quando R$ não está salvo', () => {
    const r = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      displacementValue: 0,
      displacementValueProvider: 0,
      clientUnitPriceKm: 7.35,
      providerUnitPriceKm: 5,
      origin: 'Florianópolis - SC',
      isSameOs: false,
    });
    assert.equal(r.client, 73.5);
    assert.equal(r.provider, 50);
    assert.equal(r.km, 10);
  });

  it('preserva valores já lançados e zera fornecedor em MESMA OS', () => {
    const r = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      displacementValue: 100,
      displacementValueProvider: 40,
      clientUnitPriceKm: 7.35,
      providerUnitPriceKm: 5,
      isSameOs: true,
    });
    assert.equal(r.client, 100);
    assert.equal(r.provider, 0);
  });

  it('usa fallback DHL por UF quando taxa do cliente é 0', () => {
    const sc = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      clientUnitPriceKm: 0,
      origin: 'Palhoça - SC',
    });
    assert.equal(sc.client, 73.5);

    const sp = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      clientUnitPriceKm: 0,
      origin: 'Santos - SP',
    });
    assert.equal(sp.client, 69);
  });

  it('sem KM autorizado não inventa deslocamento', () => {
    const r = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 0,
      clientUnitPriceKm: 7.35,
      providerUnitPriceKm: 5,
    });
    assert.equal(r.client, 0);
    assert.equal(r.provider, 0);
  });
});
