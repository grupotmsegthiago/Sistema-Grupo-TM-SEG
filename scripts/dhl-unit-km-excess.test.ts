import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMissionFinancials, dhlDefaultUnitKmExcess, clientTableMatchesMission } from '../lib/financialUtils';
import { MissionStatus } from '../types';

test('dhlDefaultUnitKmExcess — SP usa 6,90 e SC usa 7,35', () => {
  assert.equal(dhlDefaultUnitKmExcess('SP'), 6.90);
  assert.equal(dhlDefaultUnitKmExcess('SC'), 7.35);
  assert.equal(dhlDefaultUnitKmExcess('RS'), 7.35);
});

test('clientTableMatchesMission — tolera variações de razão social DHL', () => {
  const canonical = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
  assert.equal(clientTableMatchesMission(canonical, canonical), true);
  assert.equal(clientTableMatchesMission(canonical, 'DHL SUPPLY CHAIN'), true);
});

test('calculateMissionFinancials — DHL aplica KM excedente automático quando tabela tem price_per_extra_km = 0', () => {
  const mission = {
    id: 'GTM-TEST',
    client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
    provider: 'WARDON',
    status: MissionStatus.COMPLETED,
    origin: 'GUARULHOS - SP',
    destination: 'RIO DE JANEIRO - RJ',
    startKm: 81403,
    endKm: 81835,
    totalDistance: 404,
    startTime: '2026-07-01T08:00:00',
    endTime: '2026-07-01T22:00:00',
    toll_value: 0,
    revenue_value: 0,
    cost_value: 0,
  } as any;

  const clientTables = [{
    id: 't1',
    client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
    operation_type: 'SUDESTE - RAIO ES 400KM',
    activation_fee: 2760,
    franchise_km: 400,
    franchise_hours: 9,
    price_per_extra_km: 0,
    price_per_extra_hour: 145,
  }] as any[];

  const result = calculateMissionFinancials(
    mission,
    clientTables,
    [],
    undefined,
    new Date('2026-07-02T12:00:00'),
    { clientTableId: 't1' },
  );

  assert.equal(result.client.excessKm, 32);
  assert.equal(result.client.unitPriceKm, 6.90);
  assert.equal(result.client.extraKmVal, 220.8);
});

test('calculateMissionFinancials — OS concluída seleciona tabela pelo KM real, não KM previsto da rota', () => {
  const mission = {
    id: 'GTM-6258-TEST',
    client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
    provider: 'COMANDO G8 - SEGURANCA PATRIMONIAL E TRANSPORTE DE VALORES LTDA',
    status: MissionStatus.COMPLETED,
    origin: 'AV. TAMBORE, BARUERI - SP',
    destination: 'ROD. FERNÃO DIAS',
    start_km: 268054,
    end_km: 268181,
    total_distance: 320,
    start_time: '2026-07-07T01:30:00+00:00',
    end_time: '2026-07-07T06:30:00+00:00',
    revenue_value: 1166.3,
    cost_value: 809.6,
    mission_type: 'Caracterizada',
  } as any;

  const clientTables = [
    {
      id: '100km',
      client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
      operation_type: 'SUDESTE - DISTRIBUIÇÃO SP 100KM',
      activation_fee: 690,
      franchise_km: 100,
      franchise_hours: 3,
      price_per_extra_km: 17.6,
      price_per_extra_hour: 145,
    },
    {
      id: '300km',
      client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
      operation_type: 'SUDESTE - RAIO SP 300KM',
      activation_fee: 2070,
      franchise_km: 300,
      franchise_hours: 9,
      price_per_extra_km: 6.9,
      price_per_extra_hour: 145,
    },
  ] as any[];

  const result = calculateMissionFinancials(mission, clientTables, [], undefined, new Date());

  assert.ok(result.realTraveledKm === 127, 'KM real executado = 127');
  assert.ok(
    (result.client.tableName || '').includes('100KM'),
    `deve usar faixa 100KM pelo KM real, não 300KM pelo previsto 320. Obtido: ${result.client.tableName}`,
  );
  assert.ok(!(result.client.tableName || '').includes('300KM'));
  assert.ok(result.client.excessKm === 27, 'excedente calculado sobre 127 km reais (27 acima da franquia 100)');
});
