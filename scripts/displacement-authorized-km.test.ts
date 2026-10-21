import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDisplacementFromAuthorizedKm } from '../lib/financialUtils.ts';

describe('resolveDisplacementFromAuthorizedKm', () => {
  it('deriva cliente e fornecedor a partir do KM quando R$ não está salvo', () => {
    const r = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      displacementValue: null,
      displacementValueProvider: null,
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

  it('não troca tarifa zero da tabela pela tarifa regional', () => {
    const sc = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 190,
      clientUnitPriceKm: 0,
      providerUnitPriceKm: 4.5,
      origin: 'Palhoça - SC',
    });
    assert.equal(sc.origemTarifaCliente, 'zero_contratual');
    assert.equal(sc.client, 0);
    assert.equal(sc.provider, 855);

    const ausente = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      clientUnitPriceKm: null,
      origin: 'Santos - SP',
    });
    assert.equal(ausente.origemTarifaCliente, 'ausente');
    assert.equal(ausente.client, 0);
  });

  it('tarifa regional só entra quando a confirmação excepcional informa o valor', () => {
    const sc = resolveDisplacementFromAuthorizedKm({
      dhlDeslocamentoKm: 10,
      clientUnitPriceKm: 0,
      tarifaExcepcionalCliente: 7.35,
      origin: 'Palhoça - SC',
    });
    assert.equal(sc.origemTarifaCliente, 'excepcional');
    assert.equal(sc.client, 73.5);
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
