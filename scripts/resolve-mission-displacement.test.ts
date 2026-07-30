import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMissionDisplacement } from '../lib/billing/resolveMissionDisplacement';

describe('resolveMissionDisplacement', () => {
  it('soma DESL derivado do KM no total cobrável quando R$ não está salvo', () => {
    const d = resolveMissionDisplacement(
      {
        dhl_deslocamento_km: 160,
        displacement_value: 0,
        displacement_value_provider: 0,
        origin: 'Palhoça - SC',
        is_same_os: false,
      },
      { clientUnitPriceKm: 7.35, providerUnitPriceKm: 5.3125 },
    );
    // 160 × 7,35 = 1176 (aprox. do exemplo do relatório; taxa exata depende da tabela)
    assert.equal(d.client, 1176);
    assert.equal(d.provider, 850);
  });

  it('preserva R$ já lançado e não inventa sem KM', () => {
    const kept = resolveMissionDisplacement(
      {
        dhl_deslocamento_km: 100,
        displacement_value: 200,
        displacement_value_provider: 150,
        is_same_os: false,
      },
      { clientUnitPriceKm: 7.35, providerUnitPriceKm: 5 },
    );
    assert.equal(kept.client, 200);
    assert.equal(kept.provider, 150);

    const empty = resolveMissionDisplacement(
      { dhl_deslocamento_km: 0, displacement_value: 0, displacement_value_provider: 0 },
      { clientUnitPriceKm: 7.35, providerUnitPriceKm: 5 },
    );
    assert.equal(empty.client, 0);
    assert.equal(empty.provider, 0);
  });

  it('zera fornecedor em MESMA OS', () => {
    const d = resolveMissionDisplacement(
      {
        dhl_deslocamento_km: 100,
        displacement_value: 0,
        displacement_value_provider: 0,
        is_same_os: true,
      },
      { clientUnitPriceKm: 7.35, providerUnitPriceKm: 5 },
    );
    assert.ok(d.client > 0);
    assert.equal(d.provider, 0);
  });
});
