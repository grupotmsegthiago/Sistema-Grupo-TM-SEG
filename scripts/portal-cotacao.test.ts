import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cartaDaProposta, marcoDeOperacoes, SERVICOS_TMSEG } from '../lib/portalCliente/apresentacao.ts';
import { logoConhecido, pedidoDaCarreta, slugVisual, urlMapaEstatico } from '../lib/portalCliente/frotaVisual.ts';
import {
  chaveDoMapaNoServidor,
  destinoDirections,
  enderecoComUf,
  lerCoordenada,
  lugarComGeometria,
  mensagemFalhaDirections,
  polylineCodificada,
  refererDoMapa,
  resumirPontos,
  rotaAdministrativaPronta,
  statusDaFalhaDirections,
} from '../lib/portalCliente/rotaCotacao.ts';
import {
  calcularCotacaoPortal,
  consultaDoCliente,
  horasDaRota,
  linhaDoClienteNaRegiao,
  regiaoDaOperacao,
  tabelaPadraoDaRegiao,
  tarifaDaRegiao,
  cidadeDaRota,
  montarProposta,
  mesmaRota,
  valoresDaRegiao,
} from '../lib/portalCliente/cotacao.ts';

const NORTE = {
  acionamento: 2398,
  franquiaKm: 100,
  franquiaHoras: 3,
  kmExtra: 11,
  horaExtra: 275,
};

test('950 km vira 24 horas', () => {
  const resultado = horasDaRota(950);
  assert.equal(resultado.km, 950);
  assert.equal(resultado.horas, 24);
});

test('o km também sobe a fração', () => {
  const resultado = horasDaRota(502.5);
  assert.equal(resultado.kmRota, 502.5);
  assert.equal(resultado.km, 503);
  assert.equal(resultado.horas, 13);
});

test('100 km fica nas 3 horas mínimas', () => {
  const resultado = horasDaRota(100);
  assert.equal(resultado.km, 100);
  assert.equal(resultado.horas, 3);
});

test('rota menor que 100 km usa 100 km e 3 horas', () => {
  const resultado = horasDaRota(40);
  assert.equal(resultado.kmRota, 40);
  assert.equal(resultado.km, 100);
  assert.equal(resultado.horas, 3);
});

test('km extra e hora extra saem da tabela da região', () => {
  const resultado = calcularCotacaoPortal(NORTE, 950);
  assert.equal(resultado.kmExtra, 850);
  assert.equal(resultado.horasExtra, 21);
  assert.equal(resultado.valorKm, 9350);
  assert.equal(resultado.valorHoras, 5775);
  assert.equal(resultado.total, 17523);
});

test('a carta apresenta a empresa, os serviços e o pedágio à parte', () => {
  const carta = cartaDaProposta({
    acordada: false,
    regiao: 'SUDESTE',
    origem: 'Santos, SP',
    destino: 'Diadema, SP',
    paradas: [],
    acionamento: 650,
    kmFranquia: 100,
    horasFranquia: 3,
    kmExtra: 7.1,
    horaExtra: 160,
    operacao: 'SUDESTE - SANTOS X DIADEMA',
  });
  assert.equal(SERVICOS_TMSEG.length, 4);
  assert.match(carta, /Fiscal de rota/);
  assert.match(carta, /www\.grupotmseg\.com\.br/);
  assert.match(carta, /pedágio será cobrado à parte/);
  assert.match(carta, /R\$\s*7,10/);
  assert.match(carta, /500\+/);
  assert.equal(marcoDeOperacoes(8120), '8 mil+');
  assert.equal(marcoDeOperacoes(8000), '8 mil');
  assert.equal(marcoDeOperacoes(7432), '7 mil+');
  assert.equal(marcoDeOperacoes(400), null);
  assert.match(cartaDaProposta({
    acordada: false,
    regiao: 'SUDESTE',
    origem: 'Santos, SP',
    destino: 'Diadema, SP',
    paradas: [],
    acionamento: 650,
    kmFranquia: 100,
    horasFranquia: 3,
    kmExtra: 7.1,
    horaExtra: 160,
    operacao: 'SUDESTE - SANTOS X DIADEMA',
  }, '8 mil+'), /8 mil\+/);
  assert.match(carta, /CEVA/);
  assert.equal(carta.includes('\t'), false);
});

test('trecho curto mostra a franquia mínima de 100 km', () => {
  const proposta = montarProposta({
    tabelas: [],
    regiao: 'SUDESTE',
    origem: 'Santos, SP',
    destino: 'Diadema, SP',
    paradas: [],
    kmRota: 48,
    tabelaRegiao: { acionamento: 650, franquiaHoras: 3, franquiaKm: 100, kmExtra: 7.1, horaExtra: 160 },
  });
  assert.equal(proposta.acordada, false);
  assert.equal(proposta.kmFranquia, 100);
  assert.equal(proposta.horasFranquia, 3);
  assert.equal(proposta.acionamento, 650);
  assert.equal(proposta.kmExtra, 7.1);
  assert.equal(proposta.horaExtra, 160);
});

test('rota curta na franquia de 100 km não cobra extra', () => {
  const resultado = calcularCotacaoPortal(NORTE, 80);
  assert.equal(resultado.kmExtra, 0);
  assert.equal(resultado.horasExtra, 0);
  assert.equal(resultado.total, 2398);
});

test('NORTE não absorve NORDESTE', () => {
  assert.equal(regiaoDaOperacao('NORDESTE - ESTADO DE PE'), 'NORDESTE');
  assert.equal(regiaoDaOperacao('NORTE - ESTADO DO PA'), 'NORTE');
  assert.equal(regiaoDaOperacao('CENTRO-OESTE - ESTADO DE DF'), 'CENTRO-OESTE');
  assert.equal(regiaoDaOperacao('TABELA 2027 - NORDESTE'), 'NORDESTE');
  assert.equal(regiaoDaOperacao('TABELA 2027 - SUDESTE SP/RJ'), 'SUDESTE');
  assert.equal(regiaoDaOperacao('TABELA 2027 - NORTE'), 'NORTE');
});

test('a cotação da CEVA usa a linha 2027 do cliente e não a tarifa antiga', () => {
  const lista = [
    { id: 'antiga', operacao: 'NORDESTE - ESTADO DE BA', regiao: 'NORDESTE', acionamento: 1000, franquiaHoras: 3, franquiaKm: 100, kmExtra: 10, horaExtra: 250 },
    { id: 'ceva', operacao: 'TABELA 2027 - NORDESTE', regiao: 'NORDESTE', acionamento: 830, franquiaHoras: 3, franquiaKm: 100, kmExtra: 8.3, horaExtra: 207.5 },
  ];
  const linha = linhaDoClienteNaRegiao(lista, 'NORDESTE', '2027');
  assert.equal(linha?.id, 'ceva');
  assert.equal(linha?.acionamento, 830);
  assert.equal(linha?.kmExtra, 8.3);
  assert.equal(linha?.horaExtra, 207.5);
  const semLinha = tarifaDaRegiao([lista[0]], 'NORDESTE', '2027');
  assert.equal(semLinha?.operacao, 'TABELA 2027 - NORDESTE');
  assert.equal(semLinha?.kmExtra, 8.3);
  assert.equal(semLinha?.acionamento, 830);
  assert.equal(semLinha?.horaExtra, 169);
  assert.match(consultaDoCliente('CEVA LOGISTICS LTDA'), /client\.eq\.CEVA LOGISTICS LTDA/);
  assert.match(consultaDoCliente('CEVA LOGISTICS LTDA'), /%CEVA LOGIST%/);
  const http = readFileSync(new URL('../lib/portalCliente/cotacaoHttp.ts', import.meta.url), 'utf8');
  assert.match(http, /consultaDoCliente/);
});

test('rota já cadastrada devolve a tabela acordada', () => {
  const tabelas = [
    { id: '1', operacao: 'SUDESTE - SANTOS X RIO DE JANEIRO', regiao: 'SUDESTE', acionamento: 3893.14, franquiaHoras: 14, franquiaKm: 589.9, kmExtra: 7, horaExtra: 160 },
    { id: '2', operacao: 'SUDESTE - ESTADO DE SP E RJ', regiao: 'SUDESTE', acionamento: 660, franquiaHoras: 3, franquiaKm: 100, kmExtra: 6.6, horaExtra: 160 },
  ];
  assert.equal(cidadeDaRota('Santos, SP, Brasil'), 'SANTOS');
  assert.equal(mesmaRota(tabelas[0].operacao, 'Santos, SP', 'Rio de Janeiro, RJ'), true);
  const proposta = montarProposta({
    tabelas,
    regiao: 'SUDESTE',
    origem: 'Santos, SP, Brasil',
    destino: 'Rio de Janeiro, RJ, Brasil',
    paradas: [],
    kmRota: 502.5,
    tabelaRegiao: { acionamento: 650, franquiaHoras: 3, franquiaKm: 100, kmExtra: 7.1, horaExtra: 160 },
  });
  assert.equal(proposta.acordada, true);
  assert.equal(proposta.acionamento, 3893.14);
  assert.equal(proposta.kmFranquia, 589.9);
  assert.equal(proposta.horasFranquia, 14);
  assert.equal(proposta.kmExtra, 7);
  assert.equal(proposta.horaExtra, 160);
});

test('a cotação usa o valor por km da região e não uma rota pronta', () => {
  const norte = valoresDaRegiao([
    { id: '1', operacao: 'NORTE - ANALISE DE PERIMETRO', regiao: 'NORTE', acionamento: 750, franquiaHoras: 3, franquiaKm: 50, kmExtra: 3, horaExtra: 149 },
    { id: '2', operacao: 'NORTE - ESTADO DO PA', regiao: 'NORTE', acionamento: 2398, franquiaHoras: 3, franquiaKm: 100, kmExtra: 11, horaExtra: 275 },
    { id: '3', operacao: 'NORTE - ESTADO DO AM - MANAUS', regiao: 'NORTE', acionamento: 2398, franquiaHoras: 3, franquiaKm: 100, kmExtra: 11, horaExtra: 275 },
    { id: '4', operacao: 'NORTE - NORTE - AM X RR', regiao: 'NORTE', acionamento: 2398, franquiaHoras: 12, franquiaKm: 900, kmExtra: 11, horaExtra: 200 },
  ]);
  assert.equal(norte?.kmExtra, 11);
  assert.equal(norte?.acionamento, 2398);
  assert.equal(norte?.operacao, 'NORTE');
});

test('a região começa pela tabela de 100 km e 3 horas', () => {
  const escolhida = tabelaPadraoDaRegiao([
    { operacao: 'NORTE - AM X RR', franquiaKm: 900, franquiaHoras: 12 },
    { operacao: 'NORTE - ESTADO DO PA', franquiaKm: 100, franquiaHoras: 3 },
    { operacao: 'NORTE - ESTADO DO AM - MANAUS', franquiaKm: 100, franquiaHoras: 3 },
  ]);
  assert.equal(escolhida?.operacao, 'NORTE - ESTADO DO AM - MANAUS');
});

test('a cotação do portal reaproveita as funções existentes', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    functions: Record<string, unknown>;
    rewrites: Array<{ source: string; destination: string }>;
  };
  assert.equal(Object.keys(vercel.functions).length, 50);
  for (const origem of ['ceva-portal', 'ibl-portal', 'cliente-portal']) {
    const regra = vercel.rewrites.find((item) => item.source === `/api/${origem}/cotacao`);
    assert.ok(regra, origem);
    const destino = origem === 'cliente-portal' ? 'ibl-portal' : origem;
    assert.equal(regra?.destination, `/api/${destino}?op=cotacao`);
  }
  const handler = readFileSync(new URL('../lib/cevaPortal/httpHandler.ts', import.meta.url), 'utf8');
  assert.match(handler, /op === 'cotacao'/);
  assert.doesNotMatch(readFileSync(new URL('../lib/portalCliente/cotacao.ts', import.meta.url), 'utf8'), /calculateMissionFinancials|financialUtils/);
});

test('a carreta não pede marca desenhada e o mapa estático usa a rota recebida', () => {
  assert.equal(slugVisual('CEVA LOGISTICS LTDA'), 'ceva');
  assert.equal(slugVisual('../CEVA'), 'ceva');
  assert.equal(logoConhecido('CEVA Logistics'), '/logo_ceva_portal.png');
  assert.equal(logoConhecido('Cliente novo'), null);
  const pedido = pedidoDaCarreta('#152C54');
  assert.match(pedido, /#152c54/);
  assert.match(pedido, /Não desenhe texto/);
  assert.doesNotMatch(pedido, /CEVA|DHL|IBL/);
  const mapa = urlMapaEstatico({
    polyline: 'encodedPolylineOk',
    chave: 'chave-teste',
    inicio: { lat: -23.96, lng: -46.33 },
    fim: { lat: -22.9, lng: -43.17 },
  });
  assert.ok(mapa);
  assert.match(mapa || '', /size=640x360/);
  assert.match(mapa || '', /scale=2/);
  assert.match(mapa || '', /maptype=roadmap/);
  assert.doesNotMatch(mapa || '', /size=800|maptype=hybrid/);
  assert.match(mapa || '', /enc%3AencodedPolylineOk|enc:encodedPolylineOk/);
  assert.match(mapa || '', /label%3AA|label:A/);
  assert.match(mapa || '', /label%3AB|label:B/);
  assert.doesNotMatch(mapa || '', /Santos|Rio/);
  assert.equal(urlMapaEstatico({ polyline: 'curta', chave: 'chave-teste' }), null);
  const longa = 'A'.repeat(5000);
  assert.equal(urlMapaEstatico({ polyline: longa, chave: 'chave-teste' }), null);
  const porPontos = urlMapaEstatico({
    polyline: longa,
    chave: 'chave-teste',
    pontos: [
      { lat: -12.97, lng: -38.5 },
      { lat: -19.92, lng: -43.94 },
      { lat: -23.55, lng: -46.63 },
    ],
    inicio: { lat: -12.97, lng: -38.5 },
    fim: { lat: -23.55, lng: -46.63 },
  });
  assert.ok(porPontos);
  assert.ok((porPontos || '').length < 8000);
  assert.doesNotMatch(porPontos || '', /enc%3A/);
  assert.match(porPontos || '', /-12\.97000(?:%2C|,)-38\.50000/);
  const visual = readFileSync(new URL('../server/frotaVisual.ts', import.meta.url), 'utf8');
  assert.match(visual, /pedidoDaCarreta/);
  assert.doesNotMatch(visual, /body\.prompt/);
  const rota = readFileSync(new URL('../server/cevaPortal.ts', import.meta.url), 'utf8');
  assert.match(rota, /\/api\/proposta-escolta\/visual/);
  assert.match(rota, /\/api\/proposta-escolta\/mapa/);
});

test('a rota da cotação lê coordenada, explica a falha e não grava tempo inexistente', () => {
  assert.deepEqual(lerCoordenada({ lat: () => -12.97, lng: () => -38.51 }), { lat: -12.97, lng: -38.51 });
  assert.deepEqual(lerCoordenada({ lat: -23.55, lng: -46.63 }), { lat: -23.55, lng: -46.63 });
  assert.equal(lerCoordenada({ lat: 'Salvador', lng: -38 }), null);
  const lugar = lugarComGeometria({
    formatted_address: 'Salvador, BA, Brasil',
    place_id: 'abc',
    geometry: { location: { lat: -12.97, lng: -38.5 } },
  });
  assert.equal(lugar?.endereco, 'Salvador, BA, Brasil');
  assert.equal(enderecoComUf({
    formatted_address: 'Salvador, Bahia, Brazil',
    address_components: [
      { long_name: 'Salvador', types: ['locality'] },
      { short_name: 'BA', types: ['administrative_area_level_1'] },
    ],
  }, 'Salvador, BA'), 'Salvador, BA');
  assert.equal(enderecoComUf({
    formatted_address: 'Salvador, Bahia, Brazil',
    address_components: [
      { long_name: 'Salvador', types: ['locality'] },
      { short_name: 'BA', types: ['administrative_area_level_1'] },
    ],
  }, 'salvador'), 'Salvador, BA');
  assert.equal(lugar?.placeId, 'abc');
  assert.equal(lugarComGeometria({ name: 'Salvador' }), null);
  assert.deepEqual(destinoDirections(lugar?.coordenada, 'Salvador, BA'), { lat: -12.97, lng: -38.5 });
  assert.equal(destinoDirections(null, 'São Paulo, SP'), 'São Paulo, SP');
  assert.equal(polylineCodificada({ overview_polyline: { points: 'abc12345' } }), 'abc12345');
  assert.equal(polylineCodificada({ overview_polyline: 'xyz12345' }), 'xyz12345');
  assert.match(mensagemFalhaDirections('ZERO_RESULTS'), /caminho de carro/);
  assert.match(mensagemFalhaDirections('MAX_ROUTE_LENGTH_EXCEEDED'), /parada/);
  assert.match(mensagemFalhaDirections('REQUEST_DENIED'), /Tente de novo/);
  assert.match(mensagemFalhaDirections('NOT_FOUND'), /cidade e a UF/);
  assert.equal(statusDaFalhaDirections({ message: 'Directions request failed: ZERO_RESULTS' }), 'ZERO_RESULTS');
  assert.deepEqual(rotaAdministrativaPronta({ origin: 'Salvador, BA', destination: 'São Paulo, SP', distance: '1600.0', durationMinutes: null }), { ok: true });
  assert.equal(rotaAdministrativaPronta({ origin: '', destination: 'São Paulo, SP', distance: '10' }).ok, false);
  assert.equal(rotaAdministrativaPronta({ origin: 'Salvador, BA', destination: 'São Paulo, SP', distance: '0' }).ok, false);
  assert.equal(rotaAdministrativaPronta({ origin: 'Salvador, BA', destination: 'São Paulo, SP', distance: '10', durationMinutes: 0 }).ok, false);
  assert.equal(resumirPontos(Array.from({ length: 200 }, (_, i) => ({ lat: -12 + i / 100, lng: -38 - i / 100 })), 80).length, 80);
  assert.equal(refererDoMapa('http://localhost:5000/cotacao'), 'http://localhost:5000/');
  assert.equal(refererDoMapa('https://evil.example'), 'https://sistema.grupotmseg.com.br/');
  assert.equal(chaveDoMapaNoServidor({ GOOGLE_MAPS_API_KEY: 'chave-servidor', VITE_GOOGLE_MAPS_API_KEY: 'outra' }), 'chave-servidor');
  const tela = readFileSync(new URL('../components/ceva/CotacaoPortal.tsx', import.meta.url), 'utf8');
  assert.match(tela, /Geocoder/);
  assert.match(tela, /place_id/);
  assert.match(tela, /mensagemFalhaDirections/);
  assert.match(tela, /\/api\/proposta-escolta\/mapa/);
  assert.doesNotMatch(tela, /\/api\/proposta-escolta\/visual/);
  const formulario = readFileSync(new URL('../components/ClientRouteForm.tsx', import.meta.url), 'utf8');
  assert.match(formulario, /rotaAdministrativaPronta/);
  assert.doesNotMatch(formulario, /duration_minutes/);
});
