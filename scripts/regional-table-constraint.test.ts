import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRegionalTableConstraint,
  calculateMissionFinancials,
} from '../lib/financialUtils';

test('evaluateRegionalTableConstraint — bloqueia Palhoça quando origem é São Paulo', () => {
  const r = evaluateRegionalTableConstraint('PALHOCA - ATE 100KM', {
    originCity: 'SAO PAULO',
    destCity: 'CAMPINAS',
    originRegion: 'SUDESTE',
    originUF: 'SP',
    originAddress: 'São Paulo - SP',
  });
  assert.equal(r.blocked, true);
  assert.match(r.reason, /BLOQUEIO CIDADE/);
});

test('evaluateRegionalTableConstraint — permite Palhoça quando origem é Palhoça', () => {
  const r = evaluateRegionalTableConstraint('PALHOCA - ATE 100KM', {
    originCity: 'PALHOCA',
    destCity: 'FLORIANOPOLIS',
    originRegion: 'SUL',
    originUF: 'SC',
    originAddress: 'Palhoça - SC',
  });
  assert.equal(r.blocked, false);
  assert.equal(r.matchedCity, 'PALHOCA');
});

test('evaluateRegionalTableConstraint — bloqueia região SUL para origem SUDESTE', () => {
  const r = evaluateRegionalTableConstraint('SUL - ATE 100KM CARACTERIZADA', {
    originCity: 'SAO PAULO',
    originRegion: 'SUDESTE',
    originUF: 'SP',
  });
  assert.equal(r.blocked, true);
  assert.match(r.reason, /BLOQUEIO REGIONAL/);
});

test('evaluateRegionalTableConstraint — tabela genérica por KM não é bloqueada', () => {
  const r = evaluateRegionalTableConstraint('ATE 100KM', {
    originCity: 'SAO PAULO',
    originRegion: 'SUDESTE',
    originUF: 'SP',
  });
  assert.equal(r.blocked, false);
});

test('evaluateRegionalTableConstraint — SUDESTE não confunde com SUL', () => {
  const r = evaluateRegionalTableConstraint('SUDESTE - ATE 100KM', {
    originCity: 'SAO PAULO',
    originRegion: 'SUDESTE',
    originUF: 'SP',
  });
  assert.equal(r.blocked, false);
});

test('calculateMissionFinancials — fornecedor ignora tabela Palhoça para origem SP e usa faixa KM padrão', () => {
  const mission: any = {
    id: 'GTM-TEST-REGIONAL',
    client: 'CLIENTE TESTE',
    provider: 'FORNECEDOR TESTE',
    origin: 'São Paulo - SP',
    destination: 'Campinas - SP',
    total_distance: 100,
    traveled_distance: 100,
    mission_type: 'Caracterizada',
    status: 'Concluída',
    start_time: '2026-09-01T10:00:00Z',
    end_time: '2026-09-01T13:00:00Z',
  };
  const clientTables: any[] = [{
    id: 'c1',
    client: 'CLIENTE TESTE',
    operation_type: 'ATE 100KM',
    activation_fee: 500,
    franchise_km: 100,
    franchise_hours: 3,
    price_per_extra_km: 5,
    price_per_extra_hour: 50,
  }];
  const providerTables: any[] = [
    {
      id: 'p-palhoca',
      provider: 'FORNECEDOR TESTE',
      operation_type: 'PALHOCA ATE 100KM',
      activation_cost: 200,
      franchise_km: 100,
      franchise_hours: 3,
      cost_per_extra_km: 2,
      cost_per_extra_hour: 20,
    },
    {
      id: 'p-floripa',
      provider: 'FORNECEDOR TESTE',
      operation_type: 'FLORIANOPOLIS ATE 100KM',
      activation_cost: 210,
      franchise_km: 100,
      franchise_hours: 3,
      cost_per_extra_km: 2,
      cost_per_extra_hour: 20,
    },
    {
      id: 'p-padrao',
      provider: 'FORNECEDOR TESTE',
      operation_type: 'ATE 100KM',
      activation_cost: 300,
      franchise_km: 100,
      franchise_hours: 3,
      cost_per_extra_km: 3,
      cost_per_extra_hour: 30,
    },
  ];

  const fin = calculateMissionFinancials(mission, clientTables, providerTables);
  assert.ok(fin.provider.tableId);
  assert.equal(fin.provider.tableId, 'p-padrao');
  assert.doesNotMatch(String(fin.provider.tableName || ''), /PALHOCA|FLORIANOPOLIS/i);
});
