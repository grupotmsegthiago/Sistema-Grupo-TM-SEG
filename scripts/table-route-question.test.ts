import test from 'node:test';
import assert from 'node:assert/strict';
import { questionTableAgainstRoute } from '../lib/tableRouteQuestion';

const palhoca = { id: 'p1', operation_type: 'PALHOCA - ATE 100KM', franchise_km: 100 };
const generica = { id: 'g1', operation_type: 'ATE 100KM', franchise_km: 100 };
const floripa = { id: 'f1', operation_type: 'FLORIANOPOLIS - ATE 100KM', franchise_km: 100 };

test('origem Palhoça com tabela genérica pede a tabela exclusiva', () => {
  const q = questionTableAgainstRoute({
    tableName: 'ATE 100KM',
    origin: 'Palhoça - SC',
    destination: 'Florianópolis - SC',
    candidates: [generica, palhoca, floripa],
    distanceKm: 40,
  });
  assert.equal(q.fits, false);
  assert.match(q.headline, /origem e o destino/i);
  assert.equal(q.suggestedTableId, 'p1');
  assert.match(q.answer, /PALHOCA - ATE 100KM/);
});

test('origem Palhoça com a tabela exclusiva confirma', () => {
  const q = questionTableAgainstRoute({
    tableName: 'PALHOCA - ATE 100KM',
    origin: 'Palhoça - SC',
    destination: 'Florianópolis - SC',
    candidates: [generica, palhoca],
  });
  assert.equal(q.fits, true);
  assert.match(q.answer, /exclusiva da origem PALHOCA/i);
});

test('tabela de Palhoça não serve para origem em São Paulo, mesmo com destino em Palhoça', () => {
  const q = questionTableAgainstRoute({
    tableName: 'PALHOCA - ATE 100KM',
    origin: 'São Paulo - SP',
    destination: 'Palhoça - SC',
    candidates: [generica, palhoca],
  });
  assert.equal(q.fits, false);
  assert.match(q.answer, /exclusiva de PALHOCA/i);
  assert.equal(q.suggestedTableId, undefined);
});

test('rota sem cidade exclusiva aceita a faixa de KM', () => {
  const q = questionTableAgainstRoute({
    tableName: 'ATE 100KM',
    origin: 'Campinas - SP',
    destination: 'São Paulo - SP',
    candidates: [generica, palhoca],
    distanceKm: 90,
  });
  assert.equal(q.fits, true);
  assert.match(q.answer, /Não há tabela exclusiva/i);
});
