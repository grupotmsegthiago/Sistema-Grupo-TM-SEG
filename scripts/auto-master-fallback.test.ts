import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { MissionStatus } from '../types';

const CLIENTE = 'FLASH COURIER LTDA';

const contratual = {
  id: 'aa6eec77-cbf2-4a41-85ad-7d5108180869',
  client: CLIENTE,
  operation_type: 'SUDESTE - FLASH - 30 DIAS - BARUERI',
  activation_fee: 650,
  franchise_km: 100,
  franchise_hours: 12,
  price_per_extra_km: 0,
  price_per_extra_hour: 0,
};

const mestre = {
  id: '4461a2f4-e743-4466-bd2b-5b1ac9f737cd',
  client: CLIENTE,
  operation_type: '__AUTO_MASTER__ SUDESTE',
  activation_fee: 800,
  franchise_km: 100,
  franchise_hours: 8,
  price_per_extra_km: 2,
  price_per_extra_hour: 40,
};

function osBarueri() {
  return {
    id: 'GTM-8770',
    client: CLIENTE,
    provider: 'PRONTA RESPOSTA',
    status: MissionStatus.ORIGIN,
    origin: 'Alameda Surubiu 1688 Alphaville Barueri',
    destination: 'Alameda Surubiu 1688 Alphaville Barueri',
    totalDistance: 0,
    startKm: 0,
    endKm: 0,
  } as any;
}

describe('fallback __AUTO_MASTER__', () => {
  it('não troca a tabela contratual pela mestre genérica', () => {
    const fin = calculateMissionFinancials(
      osBarueri(),
      [contratual, mestre] as any,
      [],
      undefined,
      new Date(),
      { clientTableId: contratual.id },
    );
    assert.equal(fin.client.tableId, contratual.id);
    assert.equal(fin.client.tableName, contratual.operation_type);
    assert.equal(fin.client.base, 650);
  });

  it('busca automática ignora a mestre e fica na tabela de Barueri', () => {
    const fin = calculateMissionFinancials(
      osBarueri(),
      [mestre, contratual] as any,
      [],
    );
    assert.equal(fin.client.tableId, contratual.id);
    assert.equal(fin.client.base, 650);
    assert.doesNotMatch(String(fin.client.tableName), /AUTO_MASTER/);
  });

  it('OS nova sem tabela correspondente não recebe a mestre e avisa', () => {
    const fin = calculateMissionFinancials(
      osBarueri(),
      [mestre] as any,
      [],
    );
    assert.equal(fin.hasClientTable, false);
    assert.equal(fin.client.base, 0);
    assert.match(String(fin.client.detectionLog), /Tabela não encontrada/);
  });

  it('id salvo da mestre não é aplicado no lugar da tabela contratual', () => {
    const fin = calculateMissionFinancials(
      osBarueri(),
      [mestre, contratual] as any,
      [],
      undefined,
      new Date(),
      { clientTableId: mestre.id },
    );
    assert.notEqual(fin.client.tableId, mestre.id);
    assert.equal(fin.client.tableId, contratual.id);
    assert.equal(fin.client.base, 650);
  });
});
