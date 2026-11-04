import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { MissionStatus } from '../types';

const CLIENTE = 'INTERMODAL BRASIL LOGISTICA S.A.';

function linha(id: string, nome: string, acionamento: number, franquiaKm: number) {
  return {
    id,
    client: CLIENTE,
    operation_type: nome,
    activation_fee: acionamento,
    franchise_km: franquiaKm,
    franchise_hours: 3,
    price_per_extra_km: 7.3,
    price_per_extra_hour: 181.33,
  };
}

const palhoca = linha('palhoca', 'SUL - OPERAÇÃO PALHOÇA/SC / FLORIANÓPOLIS / FLORIPA/SC', 1800, 100);
const nordeste = linha('nordeste', 'NORDESTE - ATÉ 100 KM', 1057, 100);
const sul = linha('sul', 'SUL - ATÉ 100 KM - REGIÃO SUL', 928, 100);
const longa = linha('longa', 'SUL ROTA-LONGA-SUL FRANQUIA LARGA', 5000, 800);

function osBase(extra: Record<string, unknown>) {
  return {
    id: 'GTM-TESTE',
    client: CLIENTE,
    provider: '',
    status: MissionStatus.ORIGIN,
    totalDistance: 6,
    startKm: 0,
    endKm: 0,
    startTime: '2026-11-04T14:00:00.000Z',
    endTime: '2026-11-04T14:05:00.000Z',
    ...extra,
  } as any;
}

describe('Faixa KM Corrigida respeita a praça', () => {
  it('Palhoça com 6 km permanece na operação nomeada de R$ 1.800', () => {
    const fin = calculateMissionFinancials(
      osBase({
        origin: 'AV. DO COMERCIO, PALHOÇA - SC',
        destination: 'PALHOÇA - SC',
      }),
      [nordeste, sul, palhoca] as any,
      [],
    );
    assert.equal(fin.client.tableId, 'palhoca');
    assert.equal(fin.client.base, 1800);
    assert.doesNotMatch(String(fin.client.detectionLog), /Faixa KM Corrigida/);
    assert.doesNotMatch(String(fin.client.tableName), /NORDESTE/);
  });

  it('franquia larga sem a cidade troca para a faixa do Sul, não do Nordeste', () => {
    const fin = calculateMissionFinancials(
      osBase({
        origin: 'CURITIBA - PR',
        destination: 'CURITIBA - PR',
        route_code: 'ROTA-LONGA-SUL',
      }),
      [nordeste, longa, sul] as any,
      [],
    );
    assert.equal(fin.client.tableId, 'sul');
    assert.equal(fin.client.base, 928);
    assert.match(String(fin.client.detectionLog), /Faixa KM Corrigida/);
    assert.doesNotMatch(String(fin.client.tableName), /NORDESTE/);
  });

  it('sem faixa da mesma região, a faixa de outra região ainda cobre a distância', () => {
    const fin = calculateMissionFinancials(
      osBase({
        origin: 'CURITIBA - PR',
        destination: 'CURITIBA - PR',
        route_code: 'ROTA-LONGA-SUL',
      }),
      [nordeste, longa] as any,
      [],
    );
    assert.equal(fin.client.tableId, 'nordeste');
    assert.equal(fin.client.base, 1057);
    assert.match(String(fin.client.detectionLog), /Faixa KM Corrigida/);
  });
});
