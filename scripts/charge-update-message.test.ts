import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChargeUpdateMessage, formatPhoneDddNumber } from '../lib/chargeUpdateMessage.ts';

test('cobrança traz primeiro e último nome, celular (DDD)número e placa em negrito', () => {
  const text = buildChargeUpdateMessage({
    osId: 'GTM-8329',
    origin: 'Guarulhos - SP',
    destination: 'Cumbica - SP',
    plate: 'abc1d23',
    agent1: 'VALDIRON BRAGA MONTEIRO',
    agent2: 'ELISEU DA SILVA BARBOZA',
    agent1Phone: '(11) 98888-7777',
    agent2Phone: '5555999998888',
  });
  assert.match(text, /\*SOLICITAÇÃO DE ATUALIZAÇÃO\*/);
  assert.match(text, /\*ATENÇÃO\* equipe \*VALDIRON MONTEIRO\* @\(11\)988887777 e \*ELISEU BARBOZA\* @\(55\)999998888/);
  assert.match(text, /escoltando o veículo \*ABC1D23\*/);
  assert.match(text, /📍 \*ORIGEM:\* Guarulhos - SP/);
  assert.match(text, /🏁 \*DESTINO:\* Cumbica - SP/);
  assert.match(text, /OS \*GTM-8329\*/);
  assert.match(text, /📍 \*LOCALIZAÇÃO FIXA:\*/);
  assert.match(text, /📸 \*FOTO\* normal sem logotipo ou timestamp\./);
  assert.match(text, /🚦 \*SITUAÇÃO DA VIAGEM:\*/);
  assert.match(text, /\*LEMBRANDO QUE, A PRÓXIMA ATUALIZAÇÃO É DAQUI 01 HORA\*/);
});

test('um agente só não inventa o segundo nem um celular vazio', () => {
  const text = buildChargeUpdateMessage({
    osId: 'GTM-1',
    agent1: 'JOÃO SOUZA',
    agent2: '---',
    plate: '',
  });
  assert.match(text, /equipe \*JOÃO SOUZA\*, que esta escoltando/);
  assert.equal(text.includes(' e '), false);
  assert.equal(text.includes('@'), false);
  assert.match(text, /\*NÃO INFORMADA\*/);
});

test('telefone sai (DDD)número e o 55 do país não entra no DDD', () => {
  assert.equal(formatPhoneDddNumber('(11) 98888-7777'), '(11)988887777');
  assert.equal(formatPhoneDddNumber('55999998877'), '(55)999998877');
  assert.equal(formatPhoneDddNumber('5555999998877'), '(55)999998877');
});
