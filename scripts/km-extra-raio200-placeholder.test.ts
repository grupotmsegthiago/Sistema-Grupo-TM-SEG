import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMissionFinancials,
  isUndefinedDestinationPlaceholder,
  mentionsFixedKmBand,
} from '../lib/financialUtils';
import { MissionStatus } from '../types';

test('mentionsFixedKmBand — 1200KM não é 200KM; 1000KM não é 100KM', () => {
  assert.equal(mentionsFixedKmBand('1200KM', 200), false);
  assert.equal(mentionsFixedKmBand('SUDESTE - 200KM', 200), true);
  assert.equal(mentionsFixedKmBand('RAIO 200 KM', 200), true);
  assert.equal(mentionsFixedKmBand('1000KM', 100), false);
  assert.equal(mentionsFixedKmBand('100KM', 100), true);
});

test('isUndefinedDestinationPlaceholder — RAIO 200 stub', () => {
  assert.equal(isUndefinedDestinationPlaceholder('RAIO 200 KM — DESTINO A DEFINIR'), true);
  assert.equal(isUndefinedDestinationPlaceholder('200KM DE ACOMPANHAMENTO'), false);
});

test('GTM-7828 — placeholder RAIO 200 não zera extra da rota 1135KM', () => {
  const mission = {
    id: 'GTM-7828',
    client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
    provider: 'STAR SERVICE VIGILANCIA LTDA',
    status: MissionStatus.COMPLETED,
    origin: 'AV. CAMINHO DE GOIÁS, 100 - JARDIM SAO BENTO, JUNDIAÍ - SP, 13214-870',
    destination: 'RAIO 200 KM — DESTINO A DEFINIR',
    startKm: 53587,
    endKm: 54797,
    totalDistance: 200,
    startTime: '2026-09-14T11:00:00-03:00',
    endTime: '2026-09-16T07:50:00-03:00',
  } as any;

  const clientTables = [{
    id: '0070feb7-fa0a-4e29-86a8-648f291834be',
    client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
    operation_type: 'SUDESTE - ITAPEVI-NOVA SANTA RITA 1135KM',
    activation_fee: 10387.13,
    franchise_km: 1135,
    franchise_hours: 46,
    price_per_extra_km: 0,
    price_per_extra_hour: 145,
  }] as any[];

  const providerTables = [{
    id: '208fd3fc-87ca-4651-a2f4-7dfa70b9dee1',
    provider: 'STAR SERVICE VIGILANCIA LTDA',
    operation_type: '1200KM',
    activation_cost: 6000,
    franchise_km: 1200,
    franchise_hours: 30,
    cost_per_extra_km: 5,
    cost_per_extra_hour: 90,
  }] as any[];

  const result = calculateMissionFinancials(
    mission,
    clientTables,
    providerTables,
    undefined,
    new Date('2026-09-16T12:00:00-03:00'),
    { clientTableId: clientTables[0].id, providerTableId: providerTables[0].id },
  );

  assert.equal(result.client.excessKm, 75);
  assert.equal(result.client.unitPriceKm, 6.9);
  assert.equal(result.client.extraKmVal, 517.5);
  assert.equal(result.client.extraHrVal, 0);
  assert.equal(result.provider.excessKm, 10);
  assert.equal(result.provider.extraKmVal, 50);
});

test('Pacote 200KM de acompanhamento legítimo continua capando extra', () => {
  const mission = {
    id: 'GTM-200-OK',
    client: 'CEVA LOGISTICS LTDA',
    provider: 'WARDON',
    status: MissionStatus.COMPLETED,
    origin: 'JUNDIAÍ - SP',
    destination: '200KM DE ACOMPANHAMENTO',
    startKm: 1000,
    endKm: 1450,
    totalDistance: 200,
    startTime: '2026-09-14T08:00:00-03:00',
    endTime: '2026-09-14T12:00:00-03:00',
  } as any;

  const clientTables = [{
    id: 't-200',
    client: 'CEVA LOGISTICS LTDA',
    operation_type: 'SUDESTE - 200KM LOGITECH',
    activation_fee: 1380,
    franchise_km: 200,
    franchise_hours: 6,
    price_per_extra_km: 0,
    price_per_extra_hour: 0,
  }] as any[];

  const result = calculateMissionFinancials(
    mission,
    clientTables,
    [],
    undefined,
    new Date('2026-09-14T13:00:00-03:00'),
    { clientTableId: 't-200' },
  );

  assert.equal(result.client.excessKm, 0);
  assert.equal(result.client.extraKmVal, 0);
});
