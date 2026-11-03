import assert from 'node:assert/strict';
import test from 'node:test';
import { lugarLegivel, nomeLegivel, relatoMedicao, telefoneLegivel, type EntradaRelato } from '../lib/portalCliente/relatoMedicao';

function limpar(valor: string): string {
  return valor.replace(/\u00a0/g, ' ');
}

function base(): EntradaRelato {
  return {
    os: '8563',
    status: 'Concluída',
    servico: 'Escolta Caracterizada',
    local: 'Guarulhos - SP x Diadema - SP',
    origem: 'AEROPORTO, GUARULHOS - SP, BRASIL',
    destino: 'AV. FAGUNDES DE OLIVEIRA, 1580 - PIRAPORINHA, DIADEMA - SP, 09950-300',
    dataInicio: '2026-10-14T16:00:00.000Z',
    dataFim: '2026-10-14T18:57:00.000Z',
    franquiaHora: '03:00',
    franquiaKm: 100,
    kmInicio: 12174,
    kmFim: 12216,
    kmRodado: 42,
    kmExcedente: 0,
    hrsTrabalhada: '02:57',
    hrsExcedente: '00:00',
    valorHrsExcedente: 0,
    valorKmExcedente: 0,
    valorAcionamento: 660,
    valorTotal: 666.4,
    pedagio: 6.4,
    tarifaHora: 0,
    tarifaKm: 0,
    placa: 'elw4f94',
    motorista: 'ELIAS',
    telefone: '11947025415',
    identificacao: null,
    solicitante: null,
    quemAutorizou: null,
    operacao: null,
    contrato: null,
    atendimentoPgr: null,
    tsp: null,
    obs: null,
  };
}

test('endereço, nome e telefone ficam legíveis para o cliente', () => {
  assert.equal(lugarLegivel('AEROPORTO, GUARULHOS - SP, BRASIL'), 'Aeroporto, Guarulhos (SP)');
  assert.equal(
    lugarLegivel('AV. FAGUNDES DE OLIVEIRA, 1580 - PIRAPORINHA, DIADEMA - SP, 09950-300'),
    'Av. Fagundes de Oliveira, 1580, Piraporinha, Diadema (SP)',
  );
  assert.equal(nomeLegivel('UBIRAJARA DE ALBUQUERQUE GUARANI'), 'Ubirajara de Albuquerque Guarani');
  assert.equal(telefoneLegivel('11947025415'), '(11) 94702-5415');
  assert.equal(telefoneLegivel('(92) 99372-5625'), '(92) 99372-5625');
});

test('relato da medição usa os dados gravados e omite o que está vazio', () => {
  const itens = relatoMedicao(base());
  assert.deepEqual(itens.map((item) => item.rotulo), ['Serviço', 'Trajeto', 'Motorista', 'Tempo', 'Percurso', 'Valores']);
  assert.equal(limpar(itens[0].texto), 'OS GTM-8563. Escolta caracterizada, concluída em 14/10/2026, das 13:00 às 15:57.');
  assert.equal(
    itens[1].texto,
    'Saída em Aeroporto, Guarulhos (SP), com chegada em Av. Fagundes de Oliveira, 1580, Piraporinha, Diadema (SP). Trecho Guarulhos (SP) a Diadema (SP).',
  );
  assert.equal(itens[2].texto, 'Elias conduziu o veículo ELW4F94. Contato (11) 94702-5415.');
  assert.equal(limpar(itens[3].texto), 'Duração de 02:57, dentro da franquia de 03:00, sem hora extra.');
  assert.equal(limpar(itens[4].texto), 'Percorridos 42 km, hodômetro de 12.174 a 12.216, franquia de 100 km e sem quilometragem excedente.');
  assert.equal(limpar(itens[5].texto), 'Acionamento de R$ 660,00, pedágio de R$ 6,40 e total de R$ 666,40.');
  assert.equal(itens.some((item) => item.rotulo === 'Responsável' || item.rotulo === 'Operação' || item.rotulo === 'Obs'), false);
});

test('hora extra, km excedente e campos do cliente entram só quando existem', () => {
  const itens = relatoMedicao({
    ...base(),
    hrsExcedente: '00:40',
    kmExcedente: 12,
    valorHrsExcedente: 80,
    valorKmExcedente: 36,
    tarifaHora: 120,
    tarifaKm: 3,
    origem: 'ITARARÉ, SÃO VICENTE - SP',
    destino: 'ITARARÉ, SÃO VICENTE - SP',
    local: null,
    identificacao: 'NF 4412',
    solicitante: 'MARIA SOUZA',
    quemAutorizou: null,
    operacao: 'SUDESTE',
    contrato: '30 DIAS',
    atendimentoPgr: null,
    tsp: null,
    obs: 'Cliente pediu a via de acesso secundária.',
  });
  assert.match(limpar(itens.find((item) => item.rotulo === 'Tempo')?.texto || ''), /com 00:40 de hora extra \(R\$ 80,00\)/);
  assert.match(limpar(itens.find((item) => item.rotulo === 'Percurso')?.texto || ''), /12 km excedentes \(R\$ 36,00\)/);
  assert.match(limpar(itens.find((item) => item.rotulo === 'Valores')?.texto || ''), /Tarifa de hora extra a R\$ 120,00 e km excedente a R\$ 3,00/);
  assert.equal(itens.find((item) => item.rotulo === 'Trajeto')?.texto, 'O atendimento ocorreu em Itararé, São Vicente (SP).');
  assert.match(itens.find((item) => item.rotulo === 'Motorista')?.texto || '', /Identificação NF 4412/);
  assert.equal(itens.find((item) => item.rotulo === 'Responsável')?.texto, 'Solicitado por Maria Souza.');
  assert.equal(itens.find((item) => item.rotulo === 'Operação')?.texto, 'Operação Sudeste e contrato 30 Dias.');
  assert.equal(itens.find((item) => item.rotulo === 'Obs')?.texto, 'Cliente pediu a via de acesso secundária.');
});
