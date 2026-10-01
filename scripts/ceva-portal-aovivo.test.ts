import test from 'node:test';
import assert from 'node:assert/strict';
import { montarMissaoAoVivo, ordenarMissoesAoVivo, segueNoAoVivo } from '../lib/cevaPortal/aoVivo';

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

test('OS finalizada ou aprovada sai do ao vivo; viagem com hora final permanece', () => {
  assert.equal(segueNoAoVivo({ status: 'Pendente', end_time: '2026-05-25T16:01:00+00:00', billing_approved: true }), false);
  assert.equal(segueNoAoVivo({ status: 'Pendente', end_time: '2026-05-25T16:01:00+00:00', billing_approved: false }), false);
  assert.equal(segueNoAoVivo({ status: 'Pendente', end_time: null, billing_approved: false }), true);
  assert.equal(segueNoAoVivo({ status: 'Em Viagem', end_time: '2026-10-01T18:00:00+00:00', billing_approved: false }), true);
  assert.equal(segueNoAoVivo({ status: 'Concluída', end_time: '2026-05-25T16:01:00+00:00', billing_approved: true }), false);
});
