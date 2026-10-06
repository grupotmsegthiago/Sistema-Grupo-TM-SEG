import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTimeBR } from '../lib/dateUtils';
import { descreverReferencia, distanciaKm } from '../lib/dhlReferenciaGeografica';
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
  textoAlertaJaCopiado,
  resolverAlertaDhl,
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

test('entra no painel só fora de SP e RJ, pela última posição', () => {
  const curitiba = resolverAlertaDhl(base(), now);
  assert.ok(curitiba);
  assert.equal(curitiba?.regiao, 'SUL');
  assert.equal(curitiba?.uf, 'PR');
  assert.equal(curitiba?.posicao, 'CURITIBA - PR');
  assert.equal(curitiba?.providerName, 'FORNECEDOR SECRETO LTDA');

  assert.equal(resolverAlertaDhl(base({ currentLocation: 'GUARULHOS - SP' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'São Paulo' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'Niterói - RJ' }), now), null);
  assert.equal(resolverAlertaDhl(base({ currentLocation: 'Rio de Janeiro' }), now), null);
  assert.equal(resolverAlertaDhl(base({ status: 'Em Viagem' }), now), null);
  assert.equal(resolverAlertaDhl(base({ isSameOs: true }), now), null);
  assert.equal(resolverAlertaDhl(base({ endTime: ha(61) }), now), null);

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

test('cor do botão e saída do painel depois de 1 hora', () => {
  const pendente = { status: 'pendente' as const, finalizada_em: ha(10) };
  const copiado = { status: 'copiado' as const, finalizada_em: ha(70) };
  const estourado = { status: 'pendente' as const, finalizada_em: ha(60) };
  const expirado = { status: 'expirado' as const, finalizada_em: ha(80) };

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
  assert.equal(HORA_MS, 3_600_000);
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

test('painel só para a operação interna', () => {
  assert.equal(podeVerPainelDhl({ role: 'operador' }), true);
  assert.equal(podeVerPainelDhl({ role: 'avançado' }), true);
  assert.equal(podeVerPainelDhl({ role: 'diretoria' }), true);
  assert.equal(podeVerPainelDhl({ role: 'comercial' }), false);
  assert.equal(podeVerPainelDhl({ role: 'operador', userType: 'provider', providerId: '9' }), false);
  assert.equal(podeVerPainelDhl({ role: 'operador', clientId: '1' }), false);
  assert.equal(podeVerPainelDhl(null), false);
});
