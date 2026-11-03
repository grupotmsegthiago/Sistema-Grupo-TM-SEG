import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePanelMissions, placeMissionOnPanel } from '../lib/missionPanelLayers';

const now = new Date('2026-09-30T15:00:00-03:00');

function at(minutesFromNow: number): string {
  return new Date(now.getTime() + minutesFromNow * 60000).toISOString();
}

test('viagem com mais de 2 horas sem atualizar fica no atraso', () => {
  const place = placeMissionOnPanel({
    id: 'a',
    status: 'Em Viagem',
    lastUpdate: at(-150),
  }, now);
  assert.equal(place.layer, 'atraso');
  assert.equal(place.rank, 0);
});

test('origem atualizada não sobe para o topo', () => {
  const place = placeMissionOnPanel({
    id: 'b',
    status: 'Origem',
    lastUpdate: at(-10),
  }, now);
  assert.equal(place.layer, 'viagem');
  assert.equal(place.rank, 3);
});

test('agendamento em 30 minutos fica na prioridade 0', () => {
  for (const status of ['Agendada', 'Documentação', 'Solicitada']) {
    const place = placeMissionOnPanel({
      id: 'c',
      status,
      startTime: at(30),
      lastUpdate: at(-5),
    }, now);
    assert.equal(place.layer, 'atraso', status);
    assert.equal(place.rank, 0, status);
  }
  const almost = placeMissionOnPanel({
    id: 'c2',
    status: 'Agendada',
    startTime: new Date(now.getTime() + (30 * 60000) + 59000).toISOString(),
    lastUpdate: at(-5),
  }, now);
  assert.equal(almost.layer, 'atraso');
});

test('agendamento com mais de 30 minutos não entra na prioridade 0', () => {
  const place = placeMissionOnPanel({
    id: 'far',
    status: 'Agendada',
    startTime: at(31),
    lastUpdate: at(-1),
  }, now);
  assert.equal(place.layer, 'solicitada');
});

test('viagem com 1 hora sem atualizar fica na prioridade 2', () => {
  const place = placeMissionOnPanel({
    id: 'd',
    status: 'Em Viagem',
    lastUpdate: at(-70),
  }, now);
  assert.equal(place.layer, 'atualizar');
  assert.equal(place.rank, 2);
});

test('solicitada longe do horário fica na camada de solicitadas', () => {
  const place = placeMissionOnPanel({
    id: 'e',
    status: 'Solicitada',
    startTime: at(180),
    lastUpdate: at(-20),
  }, now);
  assert.equal(place.layer, 'solicitada');
});

test('início já passou sobe para o atraso, acima das próximas', () => {
  const late = { id: 'late', status: 'Agendada', startTime: at(-40), lastUpdate: at(-40) };
  const soon = { id: 'soon', status: 'Agendada', startTime: at(10), lastUpdate: at(-1) };
  assert.equal(placeMissionOnPanel(late, now).layer, 'atraso');
  assert.ok(comparePanelMissions(soon, late, now) > 0);
});

test('ordem do painel: atraso, início, atualizar, viagem atualizada, solicitada', () => {
  const list = [
    { id: 'sol', status: 'Solicitada', startTime: at(240), lastUpdate: at(-1) },
    { id: 'via', status: 'Em Viagem', lastUpdate: at(-15) },
    { id: 'p2', status: 'Origem', lastUpdate: at(-80) },
    { id: 'p1', status: 'Agendada', startTime: at(12), lastUpdate: at(-2) },
    { id: 'p0', status: 'Em Viagem', lastUpdate: at(-180) },
  ];
  const ordered = [...list].sort((a, b) => comparePanelMissions(a, b, now)).map(m => m.id);
  assert.deepEqual(ordered, ['p0', 'p1', 'p2', 'via', 'sol']);
});

test('sem atraso, a próxima a iniciar fica no topo', () => {
  const list = [
    { id: 'via', status: 'Em Viagem', lastUpdate: at(-8) },
    { id: 'p1', status: 'Documentação', startTime: at(20), lastUpdate: at(-3) },
    { id: 'sol', status: 'Solicitada', startTime: at(400), lastUpdate: at(-1) },
  ];
  const ordered = [...list].sort((a, b) => comparePanelMissions(a, b, now)).map(m => m.id);
  assert.deepEqual(ordered, ['p1', 'via', 'sol']);
});
