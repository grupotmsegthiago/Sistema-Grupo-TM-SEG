import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controleDiarioStatus,
  controleDiarioTotalKm,
  isControleDiarioCarryover,
  controleDiarioOpensAudit,
  daysOfMonth,
  missionOnControlDay,
  sortControleDiarioRows,
  toControleDiarioRow,
  buildControleDiarioSheet,
} from '../lib/controleDiario';
import { canAccessScreen } from '../lib/screenAccess';

const day = '2026-09-28';

test('missão do dia e pernoite anterior entram na folha', () => {
  assert.equal(missionOnControlDay({ start_time: '2026-09-28T09:00:00-03:00', status: 'Concluída' }, day), true);
  assert.equal(missionOnControlDay({
    start_time: '2026-08-21T12:50:00-03:00',
    status: 'Em Viagem',
  }, day), true);
  assert.equal(missionOnControlDay({
    start_time: '2026-09-27T10:00:00-03:00',
    end_time: '2026-09-27T18:00:00-03:00',
    status: 'Concluída',
  }, day), false);
});

test('status segue a planilha', () => {
  assert.equal(controleDiarioStatus({ status: 'Concluída', start_time: '2026-09-28T06:00:00-03:00' }, day), 'FINALIZADO');
  assert.equal(controleDiarioStatus({ status: 'Em Viagem', start_time: '2026-08-21T12:00:00-03:00' }, day), 'PERNOITE');
  assert.equal(controleDiarioStatus({ status: 'Cancelada' }, day), 'CANCELADA');
  assert.equal(controleDiarioStatus({ status: 'Recusada' }, day), 'RECUSADA');
  assert.equal(controleDiarioStatus({ status: 'Em Viagem', special_operation_type: 'Preservação', start_time: '2026-09-28T18:00:00-03:00' }, day), 'PRESERVAÇÃO');
  assert.equal(controleDiarioStatus({ status: 'Documentação', start_time: '2026-09-28T08:00:00-03:00' }, day), 'FALTA DOC');
});

test('KM total e linha da planilha', () => {
  assert.equal(controleDiarioTotalKm(16636, 17493), 857);
  assert.equal(controleDiarioTotalKm(114116, 0), -114116);
  const row = toControleDiarioRow({
    id: 'GTM-8241',
    client: 'DHL',
    provider: 'Wardon',
    origin: 'Guarulhos - SP',
    destination: 'Tubarão - SC',
    status: 'Concluída',
    start_time: '2026-09-26T06:00:00-03:00',
    end_time: '2026-09-28T09:53:00-03:00',
    start_km: 16636,
    end_km: 17493,
    agent1: 'Adelmo',
    agent2: 'Milton',
    dhl_se_number: '190359',
    vehiclePlate: 'UOP1B89',
    cargoPlate: 'DII5B09',
    originAt: '2026-09-26T06:10:00-03:00',
    driver_name: 'Carlos Souza',
    occurrence_count: 2,
  }, day);
  assert.equal(row.os, '8241');
  assert.equal(row.rota, 'Guarulhos - SP x Tubarão - SC');
  assert.equal(row.origem, 'Guarulhos - SP');
  assert.equal(row.destino, 'Tubarão - SC');
  assert.equal(row.motorista, 'Carlos Souza');
  assert.equal(row.ocorrencias, 2);
  assert.equal(row.equipe, 'ADELMO X MILTON');
  assert.equal(row.totalKm, 857);
  assert.equal(row.status, 'FINALIZADO');
  assert.equal(row.viatura, 'UOP1B89');
});

test('rota mostra cidade e estado, e código vira só a UF', () => {
  const named = toControleDiarioRow({
    id: 'GTM-1',
    origin: 'Praça Yara Santini, 1223 - Vicente de Carvalho, Guarujá - SP, 11460-004, Brasil',
    destination: 'Embu das Artes - SP',
    status: 'Em Viagem',
    start_time: '2026-09-29T08:00:00-03:00',
  }, '2026-09-29');
  assert.equal(named.rota, 'Guarujá - SP x Embu das Artes - SP');

  const coded = toControleDiarioRow({
    id: 'GTM-2',
    origin: 'X876+FRC - REGIÃO METROPOLITANA DE JUNDIAÍ, JARINU - SP',
    destination: '9QHM+H8C, GO',
    status: 'Em Viagem',
    start_time: '2026-09-29T08:00:00-03:00',
  }, '2026-09-29');
  assert.equal(coded.rota, 'Jarinu - SP x GO');

  const road = toControleDiarioRow({
    id: 'GTM-3',
    origin: 'ROD. FERNÃO DIAS - POUSO ALEGRE, MG',
    destination: 'Biguaçu, SC',
    status: 'Em Viagem',
    start_time: '2026-09-29T08:00:00-03:00',
  }, '2026-09-29');
  assert.equal(road.rota, 'Pouso Alegre - MG x Biguaçu - SC');

  const stateName = toControleDiarioRow({
    id: 'GTM-4',
    origin: 'Cidade de Manaus, Estado do Amazonas',
    destination: 'Vila Buriti - Manaus - Amazonas',
    status: 'Em Viagem',
    start_time: '2026-09-29T08:00:00-03:00',
  }, '2026-09-29');
  assert.equal(stateName.rota, 'Manaus - AM x Manaus - AM');
});

test('viagem do dia anterior fica no topo e em um único grupo', () => {
  const sheet = '2026-09-25';
  assert.equal(isControleDiarioCarryover({ status: 'Em Viagem', start_time: '2026-09-24T08:00:00-03:00' }, sheet), true);
  assert.equal(isControleDiarioCarryover({ status: 'Em Viagem', start_time: '2026-09-25T08:00:00-03:00' }, sheet), false);
  assert.equal(isControleDiarioCarryover({ status: 'Concluída', start_time: '2026-09-24T08:00:00-03:00', end_time: '2026-09-25T10:00:00-03:00' }, sheet), false);
  const older = toControleDiarioRow({ id: 'GTM-10', status: 'Em Viagem', start_time: '2026-09-24T08:00:00-03:00', current_location: 'linha 1\nlinha 2' }, sheet);
  const today = toControleDiarioRow({ id: 'GTM-2', status: 'Em Viagem', start_time: '2026-09-25T09:00:00-03:00' }, sheet);
  const done = toControleDiarioRow({ id: 'GTM-3', status: 'Concluída', start_time: '2026-09-25T07:00:00-03:00', end_time: '2026-09-25T18:00:00-03:00' }, sheet);
  assert.equal(older.diaAnterior, true);
  assert.equal(done.status, 'FINALIZADO');
  assert.equal(older.observacao.includes('\n'), false);
  const ordered = sortControleDiarioRows([done, today, older]);
  assert.deepEqual(ordered.map((row) => row.os), ['10', '2', '3']);
});

test('controle diário abre para o interno e fecha para comercial e cliente', () => {
  assert.equal(canAccessScreen({ permissions: ['dashboard'], role: 'operacional' }, 'controle-diario'), true);
  assert.equal(canAccessScreen({ permissions: ['*'], role: 'comercial' }, 'controle-diario'), false);
  assert.equal(canAccessScreen({
    permissions: ['missions'],
    role: 'cliente',
    clientId: 'ceva',
  }, 'controle-diario'), false);
});

test('auditoria da OS fica com Giovanna, Beatriz e Thiago Moreira', () => {
  assert.equal(controleDiarioOpensAudit('Giovanna Marsili'), true);
  assert.equal(controleDiarioOpensAudit('Beatriz Rocha'), true);
  assert.equal(controleDiarioOpensAudit('Beatriz Machado'), true);
  assert.equal(controleDiarioOpensAudit('Beatriz de Carvalho'), false);
  assert.equal(controleDiarioOpensAudit('Thiago Moreira'), true);
  assert.equal(controleDiarioOpensAudit('Thiago Arruda'), false);
  assert.equal(daysOfMonth('2026-09').length, 30);
});

test('observação do controle diário guarda o texto e descarta vazio', async () => {
  const { normalizeControleDiarioNote } = await import('../lib/controleDiarioNotas');
  assert.equal(normalizeControleDiarioNote('  plantão avisou atraso  '), 'plantão avisou atraso');
  assert.equal(normalizeControleDiarioNote('   '), '');
  assert.equal(normalizeControleDiarioNote('linha 1\r\nlinha 2'), 'linha 1\nlinha 2');
});

function sheetRow(id: string, se: string, start: string) {
  return toControleDiarioRow({
    id,
    client: 'DHL',
    status: 'Em Viagem',
    start_time: start,
    dhl_se_number: se,
  }, day);
}

test('mesma SE da DHL fica junta e fechada até expandir', () => {
  const rows = sortControleDiarioRows([
    sheetRow('GTM-1', '190359', '2026-09-28T08:00:00-03:00'),
    sheetRow('GTM-2', '200000', '2026-09-28T09:00:00-03:00'),
    sheetRow('GTM-3', 'SE-190359', '2026-09-28T11:00:00-03:00'),
    sheetRow('GTM-4', '', '2026-09-28T12:00:00-03:00'),
  ]);
  const closed = buildControleDiarioSheet(rows, new Set());
  assert.deepEqual(closed.map((line) => line.row.os), ['1', '2', '4']);
  assert.equal(closed[0].isLeader, true);
  assert.equal(closed[0].groupSize, 2);
  assert.equal(closed[0].row.seKey, '190359');

  const open = buildControleDiarioSheet(rows, new Set(['190359']));
  assert.deepEqual(open.map((line) => line.row.os), ['1', '3', '2', '4']);
  assert.equal(open[1].isChild, true);
  assert.equal(open[1].row.se, 'SE-190359');
});
