import test from 'node:test';
import assert from 'node:assert/strict';
import { montarMissaoAoVivo, ordenarMissoesAoVivo } from '../lib/cevaPortal/aoVivo';

test('em viagem fica na frente das programadas', () => {
  const ordem = ordenarMissoesAoVivo([
    { os: '10', status: 'Agendada', dataInicio: '2026-09-28T18:00:00.000Z' },
    { os: '12', status: 'Em Viagem', dataInicio: '2026-09-28T12:00:00.000Z' },
    { os: '11', status: 'Em Viagem', dataInicio: '2026-09-28T15:00:00.000Z' },
  ]).map((item) => item.os);
  assert.deepEqual(ordem, ['11', '12', '10']);
});

test('missão ao vivo traz os dados da OS e deixa km vazio como vazio', () => {
  const missao = montarMissaoAoVivo({
    id: 'GTM-8293',
    status: 'Em Viagem',
    missionType: 'Velada',
    plate: 'ABC1D23',
    driver: 'PAULO',
    origin: 'GUARUJÁ - SP',
    destination: 'EXTREMA - MG',
    start: '2026-09-28T15:00:00.000Z',
    startKm: '10',
    endKm: '',
  });
  assert.ok(missao);
  assert.equal(missao.os, '8293');
  assert.equal(missao.servico, 'Pronta Resposta');
  assert.equal(missao.placa, 'ABC1D23');
  assert.equal(missao.kmInicio, 10);
  assert.equal(missao.kmFim, null);
  assert.equal(missao.origem, 'Guarujá - SP');
  assert.equal(montarMissaoAoVivo({ id: '1985', status: 'Em Viagem' }), null);
});
