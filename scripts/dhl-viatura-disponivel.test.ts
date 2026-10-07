import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTimeBR } from '../lib/dateUtils';
import { descreverReferencia, distanciaKm, ehCidadeTopo, foraDoPortalPorRaio, ordemCidadeTopo } from '../lib/dhlReferenciaGeografica';
import {
  filtrarViaturasPorRaio,
  idPublicoViatura,
  montarPontosPublicos,
} from '../lib/dhlViaturaMapa';
import {
  HORA_MS,
  agruparPorRegiao,
  entraNaListaBloqueados,
  montarMensagemDisponibilidadeDhl,
  parteLocal,
  copiaBloqueadaPara,
  mesmoOperador,
  podeAuditarNaoEncaminhados,
  podeVerPainelDhl,
  TEXTO_ALERTA_VIATURA_DISPONIVEL,
  detalheAlertaViaturaDisponivel,
  deveAvisarOperadores,
  textoAlertaJaCopiado,
  resolverAlertaDhl,
  rascunhosDeMissoesFinalizadas,
  textoHaQuantoTempo,
  tomDoBotao,
  visivelNoPainelVivo,
} from '../lib/dhlViaturaDisponivel';

const now = new Date('2026-10-06T22:00:00-03:00');
const ha = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

function base(over: Record<string, unknown> = {}) {
  return {
    missionId: 'GTM-9001',
    status: 'Concluída',
    isSameOs: false,
    provider: 'FORNECEDOR SECRETO LTDA',
    client: 'CEVA',
    currentLocation: 'FINALIZADO | CURITIBA - PR',
    destination: 'SAO PAULO - SP',
    endTime: ha(10),
    ...over,
  };
}

test('separa a última posição do texto da ocorrência', () => {
  assert.equal(parteLocal('FINALIZADO | CURITIBA - PR'), 'CURITIBA - PR');
  assert.equal(parteLocal('SAO PAULO - SP | CURITIBA - PR'), 'CURITIBA - PR');
  assert.equal(parteLocal('ENTREGUE'), 'ENTREGUE');
});

test('entra no portal por 30 min, fora do raio de 100 km, com o sul de Minas no topo', () => {
  const curitiba = resolverAlertaDhl(base(), now);
  assert.ok(curitiba);
  assert.equal(curitiba?.regiao, 'SUL');
  assert.equal(curitiba?.uf, 'PR');
  assert.equal(curitiba?.posicao, 'CURITIBA - PR');
  assert.equal(curitiba?.providerName, 'FORNECEDOR SECRETO LTDA');

  assert.equal(resolverAlertaDhl(base({ currentLocation: 'GUARULHOS - SP' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'São Paulo' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'CAMPINAS - SP' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'Niterói - RJ' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'Rio de Janeiro' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'RIBEIRAO PRETO - SP' }), now)?.uf, 'SP');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'CAMPOS DOS GOYTACAZES - RJ' }), now)?.uf, 'RJ');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'EXTREMA - MG' }), now)?.uf, 'MG');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'POUSO ALEGRE - MG' }), now)?.uf, 'MG');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'VARGINHA - MG' }), now)?.uf, 'MG');
  assert.equal(foraDoPortalPorRaio('EXTREMA - MG', 'MG'), false);
  assert.equal(foraDoPortalPorRaio('GUARULHOS - SP', 'SP'), true);
  assert.deepEqual(
    ['VARGINHA - MG', 'EXTREMA - MG', 'POUSO ALEGRE - MG'].sort((a, b) => ordemCidadeTopo(a) - ordemCidadeTopo(b)),
    ['EXTREMA - MG', 'POUSO ALEGRE - MG', 'VARGINHA - MG'],
  );
  assert.equal(ehCidadeTopo('CURITIBA - PR'), false);
  assert.equal(resolverAlertaDhl(base({ status: 'Em Viagem' }), now), null);
  assert.equal(resolverAlertaDhl(base({ isSameOs: true }), now), null);
  assert.equal(resolverAlertaDhl(base({ endTime: ha(31) }), now), null);
  assert.ok(resolverAlertaDhl(base({ endTime: ha(20) }), now));

  assert.equal(resolverAlertaDhl(base({ currentLocation: 'RECIFE - PE' }), now)?.regiao, 'NORDESTE');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'MANAUS - AM' }), now)?.regiao, 'NORTE');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'BRASILIA - DF' }), now)?.regiao, 'CENTRO-OESTE');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'BELO HORIZONTE - MG' }), now)?.regiao, 'SUDESTE');
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'VITORIA - ES' }), now)?.regiao, 'SUDESTE');
});

test('sem UF na ocorrência, usa o destino; menção a SP no meio do texto não vence Curitiba', () => {
  const peloDestino = resolverAlertaDhl(base({
    currentLocation: 'FINALIZADO',
    destination: 'SALVADOR - BA',
  }), now);
  assert.equal(peloDestino?.regiao, 'NORDESTE');
  assert.equal(peloDestino?.posicao, 'SALVADOR - BA');

  const mista = resolverAlertaDhl(base({
    currentLocation: 'SAIU DE SAO PAULO - SP | CHEGOU EM JOINVILLE - SC',
    destination: 'SAO PAULO - SP',
  }), now);
  assert.equal(mista?.uf, 'SC');
  assert.equal(mista?.regiao, 'SUL');
});

test('busca as missões concluídas nos últimos 30 minutos', () => {
  const linhas = rascunhosDeMissoesFinalizadas([
    { id: 'GTM-1', status: 'Concluída', current_location: 'EXTREMA - MG', end_time: ha(10) },
    { id: 'GTM-2', status: 'Concluída', current_location: 'GUARULHOS - SP', end_time: ha(5) },
    { id: 'GTM-3', status: 'Concluída', current_location: 'CURITIBA - PR', end_time: ha(40) },
    { id: 'GTM-4', status: 'Em Viagem', current_location: 'CURITIBA - PR', end_time: ha(5) },
  ], now);
  assert.deepEqual(linhas.map((item) => item.posicao), ['EXTREMA - MG']);
  assert.equal(linhas[0].providerName, '');
  assert.equal(linhas[0].cliente, '');
});

test('qualquer cliente entra no painel; o texto só avisa a DHL da viatura', () => {
  for (const client of ['DHL SUPPLY CHAIN', 'CEVA', 'LUFT', 'POLAR', 'Cliente Avulso']) {
    const alerta = resolverAlertaDhl(base({ client, missionId: `GTM-${client.length}` }), now);
    assert.ok(alerta, client);
    assert.equal(alerta?.cliente, client);
    const msg = montarMensagemDisponibilidadeDhl({
      regiao: alerta!.regiao,
      posicao: alerta!.posicao,
      uf: alerta!.uf,
      finalizadaEm: alerta!.finalizadaEm,
    });
    assert.equal(msg.toUpperCase().includes(client.toUpperCase()), false, client);
    assert.match(msg, /viatura disponível na região/);
  }
});

test('mensagem da DHL não revela fornecedor, OS nem cliente', () => {
  const quando = ha(8);
  const msg = montarMensagemDisponibilidadeDhl({
    regiao: 'SUL',
    posicao: 'CURITIBA - PR',
    uf: 'PR',
    finalizadaEm: quando,
  });
  assert.match(msg, /EQUIPE TM SEGUE INFORMA/);
  assert.match(msg, /viatura disponível na região \*Sul\*/);
  assert.match(msg, /CURITIBA - PR/);
  assert.match(msg, /A equipe acabou de finalizar/);
  assert.match(msg, /Equipe disponível para novas missões/);
  assert.ok(msg.includes(formatDateTimeBR(quando)));
  assert.equal(msg.includes('FORNECEDOR'), false);
  assert.equal(msg.includes('SECRETO'), false);
  assert.equal(msg.includes('GTM-'), false);
  assert.equal(msg.includes('CEVA'), false);
  assert.match(msg, /Distância da capital/);
  assert.match(msg, /na capital \(Curitiba\)/);
  assert.match(msg, /Afonso Pena · CWB/);
  assert.match(msg, /🟢/);
  assert.match(msg, /📍/);
  assert.match(msg, /✅/);
  assert.match(msg, /🕒/);
  assert.match(msg, /🚛/);
});

test('cor do botão e saída do painel depois de 30 minutos', () => {
  const pendente = { status: 'pendente' as const, finalizada_em: ha(10) };
  const copiado = { status: 'copiado' as const, finalizada_em: ha(20) };
  const estourado = { status: 'pendente' as const, finalizada_em: ha(30) };
  const expirado = { status: 'expirado' as const, finalizada_em: ha(40) };

  assert.equal(tomDoBotao('pendente', pendente.finalizada_em, now), 'escuro');
  assert.equal(tomDoBotao('copiado', copiado.finalizada_em, now), 'claro');
  assert.equal(tomDoBotao('pendente', estourado.finalizada_em, now), 'vermelho');
  assert.equal(visivelNoPainelVivo(pendente, now), true);
  assert.equal(visivelNoPainelVivo(copiado, now), true);
  assert.equal(visivelNoPainelVivo(estourado, now), false);
  assert.equal(visivelNoPainelVivo({ status: 'confirmado', finalizada_em: ha(5) }, now), false);
  assert.equal(entraNaListaBloqueados(estourado, now), true);
  assert.equal(entraNaListaBloqueados(expirado, now), true);
  assert.equal(entraNaListaBloqueados(copiado, now), false);
  assert.equal(HORA_MS, 30 * 60 * 1000);
});

test('tempo relativo e agrupamento por região', () => {
  assert.equal(textoHaQuantoTempo(ha(0.4), now), 'há menos de 1 min');
  assert.equal(textoHaQuantoTempo(ha(12), now), 'há 12 min');
  assert.equal(textoHaQuantoTempo(ha(90), now), 'há 1 h 30 min');

  const grupos = agruparPorRegiao([
    { regiao: 'SUL', finalizada_em: ha(5), id: 'a' },
    { regiao: 'NORTE', finalizada_em: ha(2), id: 'b' },
    { regiao: 'NORTE', finalizada_em: ha(20), id: 'c' },
  ]);
  assert.deepEqual(grupos.map((g) => g.regiao), ['NORTE', 'SUL']);
  assert.deepEqual(grupos[0].itens.map((i) => i.id), ['b', 'c']);
});

test('só diretoria e administrador veem as não encaminhadas', () => {
  assert.equal(podeAuditarNaoEncaminhados({ role: 'diretoria' }), true);
  assert.equal(podeAuditarNaoEncaminhados({ role: 'administrador' }), true);
  assert.equal(podeAuditarNaoEncaminhados({ role: 'Operador' }), false);
  assert.equal(podeAuditarNaoEncaminhados({ role: 'financeiro', permissions: ['*'] }), true);
  assert.equal(podeAuditarNaoEncaminhados(null), false);
});

test('mensagem diz a distância da capital do estado e do aeroporto mais próximo', () => {
  const curitiba = descreverReferencia('CURITIBA - PR', 'PR');
  assert.ok(curitiba);
  assert.match(curitiba!.capital, /na capital \(Curitiba\)/);
  assert.match(curitiba!.aeroporto, /Afonso Pena · CWB/);

  const londrina = descreverReferencia('LONDRINA - PR', 'PR');
  assert.ok(londrina);
  assert.match(londrina!.capital, /de Curitiba/);
  assert.match(londrina!.aeroporto, /Londrina · LDB/);
  const kmCapital = Number(londrina!.capital.match(/cerca de (\d+) km/)?.[1]);
  assert.ok(kmCapital > 250 && kmCapital < 400);

  const joinville = descreverReferencia('JOINVILLE - SC', 'SC');
  assert.match(joinville!.aeroporto || '', /Joinville · JOI/);
  assert.match(joinville!.capital || '', /Florianópolis/);

  assert.equal(descreverReferencia('SITIO NOVO SEM CIDADE - PR', 'PR'), null);
  const semCidade = montarMensagemDisponibilidadeDhl({
    regiao: 'SUL',
    posicao: 'SITIO NOVO SEM CIDADE - PR',
    uf: 'PR',
    finalizadaEm: ha(5),
  });
  assert.equal(semCidade.includes('Distância da capital'), false);

  const reta = distanciaKm({ lat: -25.4284, lng: -49.2733 }, { lat: -25.4284, lng: -49.2733 });
  assert.equal(reta < 0.01, true);
});

test('segunda cópia de outro operador fica bloqueada e avisa o nome', () => {
  assert.equal(mesmoOperador('Maria Souza', 'maria souza'), true);
  assert.equal(mesmoOperador('João', 'Maria'), false);
  assert.equal(copiaBloqueadaPara('Maria Souza', 'João'), true);
  assert.equal(copiaBloqueadaPara('Maria Souza', 'maria souza'), false);
  assert.equal(copiaBloqueadaPara('', 'João'), false);
  const texto = textoAlertaJaCopiado('Maria Souza', 'GTM-9001', 'CURITIBA - PR');
  assert.match(texto, /Maria Souza já copiou a mensagem da OS GTM-9001/);
  assert.match(texto, /CURITIBA - PR/);
  assert.match(texto, /Não envie de novo no grupo da DHL/);
});

test('avisa a operação só na primeira vez, dentro da janela', () => {
  assert.equal(TEXTO_ALERTA_VIATURA_DISPONIVEL, 'Tem viatura disponível, favor mandar pra DHL.');
  assert.equal(detalheAlertaViaturaDisponivel('CURITIBA - PR', 'SUL'), 'CURITIBA - PR · Sul');
  assert.equal(detalheAlertaViaturaDisponivel('EXTREMA - MG', 'TOPO'), 'EXTREMA - MG · No topo');
  assert.equal(detalheAlertaViaturaDisponivel('', ''), '');
  assert.equal(deveAvisarOperadores('pendente', ha(5), now), true);
  assert.equal(deveAvisarOperadores('pendente', ha(31), now), false);
  assert.equal(deveAvisarOperadores('copiado', ha(5), now), false);
  assert.equal(deveAvisarOperadores('confirmado', ha(2), now), false);
  assert.equal(TEXTO_ALERTA_VIATURA_DISPONIVEL.includes('FORNECEDOR'), false);
});

test('mapa público esconde OS, fornecedor e cliente e obedece o raio', () => {
  const pontos = montarPontosPublicos([
    { mission_id: 'GTM-183013', posicao: 'CURITIBA - PR', uf: 'PR', regiao: 'SUL', finalizada_em: ha(10), status: 'pendente' },
    { mission_id: 'GTM-200', posicao: 'MANAUS - AM', uf: 'AM', regiao: 'NORTE', finalizada_em: ha(8), status: 'confirmado' },
    { mission_id: 'GTM-SP', posicao: 'SÃO PAULO - SP', uf: 'SP', regiao: 'SUDESTE', finalizada_em: ha(5), status: 'pendente' },
    { mission_id: 'GTM-VELHA', posicao: 'FLORIANÓPOLIS - SC', uf: 'SC', regiao: 'SUL', finalizada_em: ha(90), status: 'pendente' },
    { mission_id: 'GTM-X', posicao: 'SITIO SEM CIDADE - PR', uf: 'PR', regiao: 'SUL', finalizada_em: ha(4), status: 'pendente' },
  ], now);

  assert.equal(pontos.length, 2);
  assert.equal(pontos.some((p) => p.uf === 'SP'), false);
  assert.equal(JSON.stringify(pontos).includes('GTM-'), false);
  assert.equal(JSON.stringify(pontos).includes('mission'), false);
  assert.equal(pontos[0].id.startsWith('tm'), true);
  assert.notEqual(idPublicoViatura('GTM-183013'), 'GTM-183013');

  const curitiba = pontos.find((p) => p.uf === 'PR')!;
  const perto = filtrarViaturasPorRaio(pontos, { lat: curitiba.lat, lng: curitiba.lng }, 50);
  assert.equal(perto.some((p) => p.uf === 'PR'), true);
  assert.equal(perto.some((p) => p.uf === 'AM'), false);
  assert.equal(filtrarViaturasPorRaio(pontos, { lat: curitiba.lat, lng: curitiba.lng }, 0).length, 0);
  assert.equal(filtrarViaturasPorRaio(pontos, null, 0).length, 2);

  const semLink = montarMensagemDisponibilidadeDhl({
    regiao: 'SUL',
    posicao: 'CURITIBA - PR',
    uf: 'PR',
    finalizadaEm: ha(5),
  });
  assert.equal(semLink.includes('Portal DHL'), false);
  assert.equal(semLink.includes('https://'), false);
  assert.equal(semLink.includes('GTM-'), false);
  assert.equal(semLink.includes('FORNECEDOR'), false);
});

test('painel só para a operação interna', () => {
  assert.equal(podeVerPainelDhl({ role: 'operador' }), true);
  assert.equal(podeVerPainelDhl({ role: 'avançado' }), true);
  assert.equal(podeVerPainelDhl({ role: 'diretoria' }), true);
  assert.equal(podeVerPainelDhl({ role: 'comercial' }), false);
  assert.equal(podeVerPainelDhl({ role: 'operador', userType: 'provider', providerId: '9' }), false);
  assert.equal(podeVerPainelDhl({ role: 'operador', clientId: '1' }), false);
  assert.equal(podeVerPainelDhl(null), false);
});
