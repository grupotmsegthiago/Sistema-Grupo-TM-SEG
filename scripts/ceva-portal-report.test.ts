import test from 'node:test';
import assert from 'node:assert/strict';
import { cidadeUfDoEndereco, horaDoBoletim, linhaDoBoletimCeva, localOrigemDestino, numeroOsDoBoletim, osAprovadaParaValores, osMudouDepoisDoSnapshot } from '../lib/cevaPortal/report';
import { isoDeDataBrasil, mascaraDataBrasil, periodoMesAtualBrasil } from '../lib/cevaPortal/datas';
import { classeStatusSistema } from '../lib/cevaPortal/status';

const vazio = { priceTables: [], providerTables: [] };

test('local mostra só cidade e UF de origem e destino', () => {
  assert.equal(cidadeUfDoEndereco('PRAÇA YARA SANTINI, 1223 - VICENTE DE CARVALHO, GUARUJÁ - SP, 11460-004'), 'Guarujá - SP');
  assert.equal(cidadeUfDoEndereco('ROD. FERNÃO DIAS, 221 - EXTREMA, MG, 07053-171'), 'Extrema - MG');
  assert.equal(cidadeUfDoEndereco('5M7F+XMC - EXTREMA, MG, 37640-000'), 'Extrema - MG');
  assert.equal(cidadeUfDoEndereco('RJ9W+GMV - SANTA RITA DO RIBEIRA, MIRACATU - SP, 11850-000'), 'Miracatu - SP');
  assert.equal(cidadeUfDoEndereco('FV9M+RRG, SÃO JOSÉ DOS PINHAIS - PR'), 'São José dos Pinhais - PR');
  assert.equal(
    localOrigemDestino(
      'PRAÇA YARA SANTINI - JARDIM BOA ESPERANCA (VICENTE DE CARVALHO), GUARUJÁ - SP',
      'RODOVIA, EMBU DAS ARTES - SP',
    ),
    'Guarujá - SP x Embu das Artes - SP',
  );
});

test('formata hora como o boletim', () => {
  assert.equal(horaDoBoletim(3), '03:00');
  assert.equal(horaDoBoletim(8.433333333333334), '08:26');
  assert.equal(horaDoBoletim(0), '00:00');
});

test('o número da OS é o impresso no boletim', () => {
  assert.equal(numeroOsDoBoletim('GTM-7710'), '7710');
  assert.equal(numeroOsDoBoletim('8293'), null);
  assert.equal(numeroOsDoBoletim('GTM-ABC'), null);
});

test('snapshot aprovado entrega os números do boletim e ignora id de veículo', () => {
  const row = linhaDoBoletimCeva({
    id: 'GTM-7710',
    status: 'Concluída',
    client: 'CEVA LOGISTICS LTDA',
    start_time: '2026-09-09T11:25:00Z',
    end_time: null,
    start_km: '188178',
    end_km: '189065',
    mission_type: 'Velada',
    driver_name: 'PAULO ISAC',
    plate: '1985',
    origin: '428G+G39, SÃO LOURENÇO DA SERRA - SP',
    destination: '428G+G39, SÃO LOURENÇO DA SERRA - SP',
    revenue_value: '3252.1',
    toll_value: '114',
    toll_value_provider: '95',
    billing_approved: true,
    snapshot_approved_by: 'financeiro',
    snapshot_data: {
      kmTotal: '887',
      franchiseKm: '50',
      franchiseHours: '3',
      durationHours: '8.433333333333334',
      hrExtraQtd: '6',
      kmExtraQtd: '837',
      hrExtraTotal: '678',
      kmExtraTotal: '1925.1',
      activationFee: '649',
      totalGeral: '3366.1',
      unitKm: '2.3',
      unitHr: '113',
      tollVal: '114',
      route: '428G+G39 X 428G+G39',
    },
  }, vazio);

  assert.ok(row);
  assert.equal(row.os, '7710');
  assert.equal(row.status, 'Concluída');
  assert.equal(row.placa, null);
  assert.equal(row.kmRodado, 887);
  assert.equal(row.kmExcedente, 837);
  assert.equal(row.hrsTrabalhada, '08:26');
  assert.equal(row.valores, 'APROVADO');
  assert.equal(row.valorTotal, 3366.1);
  assert.equal(row.valorAcionamento, 649);
  assert.equal(row.pedagio, 114);
  assert.equal(row.tarifaKm, 2.3);
  assert.equal(row.tarifaHora, 113);
  assert.equal(row.local, 'São Lourenço da Serra - SP x São Lourenço da Serra - SP');
});

test('id que não é OS de boletim não vira linha', () => {
  const row = linhaDoBoletimCeva({ id: '1985', status: 'Concluída', plate: 'ABC1D23' }, vazio);
  assert.equal(row, null);
});

test('placa real entra e o status da viagem é o gravado', () => {
  const row = linhaDoBoletimCeva({
    id: 'GTM-8293',
    status: 'Em Viagem',
    plate: 'ABC1D23',
    start_km: 10,
    end_km: 10,
    revenue_value: 0,
    toll_value: 0,
  }, vazio);
  assert.ok(row);
  assert.equal(row.os, '8293');
  assert.equal(row.status, 'Em Viagem');
  assert.equal(row.placa, 'ABC1D23');
  assert.equal(row.kmRodado, 0);
  assert.equal(row.valores, 'AGUARDANDO');
  assert.equal(row.valorTotal, null);
  assert.equal(row.pedagio, null);
  assert.equal(row.tarifaKm, null);
});

test('sem aprovação no sistema o dinheiro fica aguardando, mesmo com snapshot', () => {
  assert.equal(osAprovadaParaValores({ billing_approved: true }), true);
  assert.equal(osAprovadaParaValores({ billing_approved: false }), false);
  assert.equal(osAprovadaParaValores({}), false);
  const row = linhaDoBoletimCeva({
    id: 'GTM-7710',
    status: 'Concluída',
    billing_approved: false,
    snapshot_approved_by: 'financeiro',
    start_km: '188178',
    end_km: '189065',
    revenue_value: '3252.1',
    toll_value: '114',
    snapshot_data: {
      kmTotal: '887',
      hrExtraTotal: '678',
      kmExtraTotal: '1925.1',
      activationFee: '649',
      totalGeral: '3366.1',
      unitKm: '2.3',
      unitHr: '113',
      tollVal: '114',
    },
  }, vazio);
  assert.ok(row);
  assert.equal(row.valores, 'AGUARDANDO');
  assert.equal(row.kmRodado, 887);
  assert.equal(row.valorTotal, null);
  assert.equal(row.valorAcionamento, null);
  assert.equal(row.pedagio, null);
  assert.equal(row.tarifaHora, null);
});

test('km vazio na OS não vira zero', () => {
  const row = linhaDoBoletimCeva({ id: 'GTM-9001', status: 'Solicitada' }, vazio);
  assert.ok(row);
  assert.equal(row.kmInicio, null);
  assert.equal(row.kmFim, null);
  assert.equal(row.kmRodado, null);
  assert.equal(row.local, null);
});

test('alteração depois de aprovada atualiza o total do cliente e ignora o pedágio do fornecedor', () => {
  const mission = {
    id: 'GTM-7710',
    status: 'Concluída',
    client: 'CEVA LOGISTICS LTDA',
    start_km: '188178',
    end_km: '189065',
    revenue_value: '4000',
    toll_value: '114',
    toll_value_provider: '95',
    billing_approved: true,
    snapshot_approved_by: 'financeiro',
    snapshot_data: {
      kmTotal: '887',
      hrExtraTotal: '678',
      kmExtraTotal: '1925.1',
      activationFee: '649',
      totalGeral: '3366.1',
      unitKm: '2.3',
      unitHr: '113',
      tollVal: '114',
    },
  };
  assert.equal(osMudouDepoisDoSnapshot(mission, mission.snapshot_data), true);
  const row = linhaDoBoletimCeva(mission, vazio);
  assert.ok(row);
  assert.equal(row.valores, 'APROVADO');
  assert.equal(row.valorTotal, 4114);
  assert.equal(row.pedagio, 114);
  assert.notEqual(row.pedagio, 95);
  assert.equal(row.valorAcionamento, 649);
});

test('data do filtro segue dia/mês/ano e o status usa a cor do sistema', () => {
  assert.equal(mascaraDataBrasil('28092026'), '28/09/2026');
  assert.equal(isoDeDataBrasil('28/09/2026'), '2026-09-28');
  assert.equal(isoDeDataBrasil('28/09'), '');
  assert.equal(isoDeDataBrasil('31/02/2026'), '');
  assert.deepEqual(periodoMesAtualBrasil(new Date('2026-09-28T15:00:00-03:00')), { inicio: '01/09/2026', fim: '30/09/2026' });
  assert.deepEqual(periodoMesAtualBrasil(new Date('2026-10-01T02:30:00Z')), { inicio: '01/09/2026', fim: '30/09/2026' });
  assert.deepEqual(periodoMesAtualBrasil(new Date('2026-02-10T12:00:00-03:00')), { inicio: '01/02/2026', fim: '28/02/2026' });
  assert.match(classeStatusSistema('Em Viagem'), /bg-purple-600/);
  assert.match(classeStatusSistema('Concluída'), /bg-green-600/);
  assert.match(classeStatusSistema('Cancelada'), /bg-red-600/);
  assert.match(classeStatusSistema('Solicitada'), /bg-orange-500/);
});
