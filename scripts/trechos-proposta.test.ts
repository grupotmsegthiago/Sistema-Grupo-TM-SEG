import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateTripCost, FRANQUIA_KM } from '../lib/precificacao/tabela2027';
import { cartaDaProposta, propostaRecebida } from '../lib/portalCliente/apresentacao';
import { lerSnapshot, pedidoParaRegistro } from '../lib/portalCliente/historicoCotacoes';
import {
  calcularTrechoProposta,
  conferirTrechosGravados,
  pisoRegional2027,
  somarTrechos,
} from '../lib/portalCliente/trechosProposta';

const CLIENTE = 'CEVA LOGISTICS LTDA';
const LINHAS = [
  { operation_type: 'TABELA 2027 - SUDESTE SP/RJ', price_per_extra_km: 6.9, price_per_extra_hour: 159 },
  { operation_type: 'TABELA 2027 - NORDESTE', price_per_extra_km: 8.3, price_per_extra_hour: 207.5 },
];

test('dois trechos somam a conta de calculateTripCost e separam o excedente', () => {
  const sudeste = calcularTrechoProposta({
    origem: 'Guarulhos, SP',
    destino: 'Rio de Janeiro, RJ',
    km: 150,
    cliente: CLIENTE,
    versao: '2027',
    linhas: LINHAS,
  });
  const nordeste = calcularTrechoProposta({
    origem: 'Salvador, BA',
    destino: 'Recife, PE',
    km: 80,
    cliente: CLIENTE,
    versao: '2027',
    linhas: LINHAS,
  });
  assert.equal(sudeste.ok, true);
  assert.equal(nordeste.ok, true);
  if (!sudeste.ok || !nordeste.ok) return;
  assert.equal(sudeste.trecho.valor, calculateTripCost(150, 6.9).valor);
  assert.equal(sudeste.trecho.kmExcedente, 50);
  assert.equal(sudeste.trecho.horas, calculateTripCost(150, 6.9).horasFaturadas);
  assert.equal(nordeste.trecho.usouMinimo, true);
  assert.equal(nordeste.trecho.valor, 830);
  assert.equal(nordeste.trecho.kmExcedente, 0);
  const soma = somarTrechos([sudeste.trecho, nordeste.trecho]);
  assert.equal(soma.total, Math.round((sudeste.trecho.valor + 830) * 100) / 100);
  assert.equal(soma.km, 230);
});

test('km extra e hora extra não descem do piso nem da tarifa já maior', () => {
  const piso = pisoRegional2027('Guarulhos, SP', CLIENTE);
  assert.equal(piso?.kmExtra, 6.9);
  assert.equal(piso?.acionamento, FRANQUIA_KM * 6.9);
  const abaixo = calcularTrechoProposta({
    origem: 'Guarulhos, SP',
    destino: 'Campinas, SP',
    km: 120,
    cliente: CLIENTE,
    versao: '2027',
    linhas: LINHAS,
    kmExtraInformado: 6,
  });
  assert.equal(abaixo.ok, false);
  const acima = calcularTrechoProposta({
    origem: 'Guarulhos, SP',
    destino: 'Campinas, SP',
    km: 120,
    cliente: CLIENTE,
    versao: '2027',
    linhas: LINHAS,
    kmExtraInformado: 8,
  });
  assert.equal(acima.ok, true);
  if (!acima.ok) return;
  assert.equal(acima.trecho.kmExtra, 8);
  assert.equal(acima.trecho.valor, calculateTripCost(120, 8).valor);
});

test('a gravação recusa total abaixo do motor e aceita dois trechos no snapshot', () => {
  const curto = calculateTripCost(80, 8.3);
  const longo = calculateTripCost(150, 6.9);
  const recusado = conferirTrechosGravados([
    { origem: 'Salvador, BA', destino: 'Recife, PE', km: 80, kmExtra: 8.3, horaExtra: 207.5, valor: 10 },
  ], CLIENTE, '2027');
  assert.equal(recusado.ok, false);
  const registro = pedidoParaRegistro({
    origem: 'Guarulhos, SP',
    destino: 'Recife, PE',
    km: 230,
    valor: 1,
    horas: 3,
    kmExtra: 6.9,
    horaExtra: 159,
    acionamento: 1,
    vigencia: '2027',
    trechos: [
      { origem: 'Guarulhos, SP', destino: 'Rio de Janeiro, RJ', km: 150, kmExtra: 6.9, horaExtra: 159, valor: longo.valor, regiao: 'SUDESTE SP/RJ' },
      { origem: 'Salvador, BA', destino: 'Recife, PE', km: 80, kmExtra: 8.3, horaExtra: 207.5, valor: curto.valor, regiao: 'NORDESTE' },
    ],
  }, { id: 4, name: CLIENTE }, { name: 'Comercial', email: 'comercial@grupotmseg.com.br' });
  assert.equal(registro.ok, true);
  if (!registro.ok) return;
  assert.equal(registro.linha.total_value, Math.round((longo.valor + curto.valor) * 100) / 100);
  assert.equal(registro.linha.origin, 'Guarulhos, SP');
  assert.equal(registro.linha.destination, 'Recife, PE');
  const lido = lerSnapshot(String(registro.linha.contract_details));
  assert.equal(lido?.trechos?.length, 2);
  const carta = cartaDaProposta({
    acordada: false,
    regiao: 'SUDESTE SP/RJ',
    origem: 'Guarulhos, SP',
    destino: 'Recife, PE',
    paradas: [],
    acionamento: Number(registro.linha.total_value),
    kmFranquia: 100,
    horasFranquia: 3,
    kmExtra: 6.9,
    horaExtra: 159,
    operacao: '2 trechos',
    trechos: lido?.trechos,
  }, null, 'http://127.0.0.1:5000/proposta/v/52/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.match(carta, /Guarulhos, SP/);
  assert.match(carta, /Salvador, BA/);
  assert.match(carta, /\/proposta\/v\//);
});

test('proposta de um trecho em 2027 abaixo do piso não grava', () => {
  const registro = pedidoParaRegistro({
    origem: 'Guarulhos, SP',
    destino: 'Campinas, SP',
    km: 80,
    valor: 500,
    horas: 3,
    kmExtra: 5,
    horaExtra: 100,
    acionamento: 500,
    vigencia: '2027',
  }, { id: 4, name: CLIENTE }, { name: 'Comercial', email: 'comercial@grupotmseg.com.br' });
  assert.equal(registro.ok, false);
  const email = propostaRecebida({
    acionamento: 500,
    kmFranquia: 100,
    horasFranquia: 3,
    kmExtra: 5,
    horaExtra: 100,
    vigencia: '2027',
    origem: 'Guarulhos, SP',
    destino: 'Campinas, SP',
    trechos: [
      { origem: 'Guarulhos, SP', destino: 'Campinas, SP', km: 80, kmExtra: 5, horaExtra: 100, valor: 500 },
      { origem: 'Salvador, BA', destino: 'Recife, PE', km: 80, kmExtra: 8.3, horaExtra: 207.5, valor: 830 },
    ],
  });
  assert.equal(email, null);
});

test('a tela da cotação mostra os trechos e lê o logotipo já gravado no cliente', () => {
  const tela = readFileSync(new URL('../components/ceva/CotacaoPortal.tsx', import.meta.url), 'utf8');
  const poster = readFileSync(new URL('../components/ceva/PropostaPremium.tsx', import.meta.url), 'utf8');
  const cadastro = readFileSync(new URL('../components/ClientForm.tsx', import.meta.url), 'utf8');
  assert.equal(cadastro.includes('Adicionar Nova Regra'), false);
  assert.equal(cadastro.includes('seletor-vigencia-precos'), false);
  assert.equal(cadastro.includes('select-tabela-vigencia'), false);
  assert.match(cadastro, /tabelaVigencia: VersaoTabelaRegional = '2027'/);
  assert.match(cadastro, /perfilComercial\) return tab.id === 'quotes'/);
  assert.match(cadastro, /RotaGoogleCotacao/);
  assert.match(tela, /data-testid="trechos-proposta"/);
  assert.match(tela, /portal_logo_url/);
  assert.match(tela, /calcularTrechoProposta/);
  assert.match(poster, /logoNaCarreta/);
  assert.match(readFileSync(new URL('../lib/precificacao/tabela2027.ts', import.meta.url), 'utf8'), /export function calculateTripCost/);
});
