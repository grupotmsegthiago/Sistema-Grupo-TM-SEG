import test from 'node:test';
import assert from 'node:assert/strict';
import { CABECALHOS_CONTROLE, linhaControleExportavel } from '../lib/cevaPortal/exportarControle';
import { aplicarStatusOs } from '../lib/cevaPortal/status';

test('exportação do controle não leva contrato e inclui TSP', () => {
  assert.equal(CABECALHOS_CONTROLE.includes('Contrato'), false);
  assert.equal(CABECALHOS_CONTROLE.includes('TSP'), true);
  assert.equal(CABECALHOS_CONTROLE.includes('Operação'), true);
  const linha = linhaControleExportavel({
    os: '8293',
    status: 'Em Viagem',
    dataInicio: null,
    dataFim: null,
    solicitante: 'LUIZ',
    quemAutorizou: null,
    servico: 'Escolta Caracterizada',
    atendimentoPgr: null,
    operacao: 'SHOPEE',
    tsp: 'ROTA SUL',
    placa: 'ABC1D23',
    motorista: 'PAULO',
    franquiaHora: '08:00',
    franquiaKm: 100,
    kmInicio: null,
    kmFim: null,
    kmRodado: null,
    kmExcedente: null,
    hrsTrabalhada: null,
    hrsExcedente: null,
    valorHrsExcedente: 10,
    valorKmExcedente: null,
    valorAcionamento: null,
    valorTotal: null,
    pedagio: null,
    tarifaKm: null,
    tarifaHora: null,
    local: null,
    obs: null,
    valores: 'AGUARDANDO',
  }, 4);
  assert.equal(linha.length, CABECALHOS_CONTROLE.length);
  assert.equal(linha[0], '8293');
  assert.equal(linha[1], 'Em Viagem');
  assert.equal(linha[2], '4');
  assert.equal(linha[CABECALHOS_CONTROLE.indexOf('Operação')], 'SHOPEE');
  assert.equal(linha[CABECALHOS_CONTROLE.indexOf('TSP')], 'ROTA SUL');
  assert.equal(linha[CABECALHOS_CONTROLE.indexOf('R$ total')], 'Aguardando validação');
  assert.equal(linha[CABECALHOS_CONTROLE.indexOf('Km início')], 'Aguardando Conferência');
});

test('status do sistema substitui o da tela sem mexer nas outras OS', () => {
  const atual = [
    { os: '1', status: 'Agendada', placa: 'AAA' },
    { os: '2', status: 'Em Viagem', placa: 'BBB' },
  ];
  const igual = aplicarStatusOs(atual, [{ os: '1', status: 'Agendada' }]);
  assert.equal(igual, atual);
  const mudou = aplicarStatusOs(atual, [{ os: '2', status: 'Concluída' }, { os: '9', status: 'Pendente' }]);
  assert.equal(mudou[0], atual[0]);
  assert.equal(mudou[1].status, 'Concluída');
  assert.equal(mudou[1].placa, 'BBB');
});
