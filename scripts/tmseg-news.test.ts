import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nomesQueViram,
  noticiaDoLog,
  podePublicarNews,
  podeVerNews,
  textoParabensCadastro,
} from '../lib/tmsegNews';

test('diretoria publica e o cliente de fora não vê o mural', () => {
  assert.equal(podePublicarNews({ role: 'diretoria', name: 'Ana' }), true);
  assert.equal(podePublicarNews({ role: 'operador', name: 'Thiago Moreira' }), true);
  assert.equal(podePublicarNews({ role: 'operador', name: 'Beatriz' }), false);
  assert.equal(podeVerNews({ role: 'operador', name: 'Beatriz' }), true);
  assert.equal(podeVerNews({ role: 'cliente', name: 'IBL', clientId: '1' }), false);
  assert.equal(podeVerNews({ role: 'fornecedor', name: 'GNS' }), false);
});

test('cadastro novo parabeniza quem cadastrou', () => {
  const cliente = textoParabensCadastro('cliente', 'Beatriz de Carvalho Simões', 'INTERMODAL');
  assert.match(cliente.titulo, /Cliente novo: INTERMODAL/);
  assert.match(cliente.texto, /Beatriz de Carvalho Simões, parabéns/);
  assert.match(cliente.texto, /Obrigado pelo apoio/);
  const fornecedor = textoParabensCadastro('fornecedor', 'Michelle Dias', 'GNS');
  assert.match(fornecedor.titulo, /Fornecedor novo: GNS/);
  assert.match(fornecedor.texto, /fornecedor GNS/);
});

test('quem visualizou não repete o mesmo nome', () => {
  assert.deepEqual(nomesQueViram(['Beatriz', 'beatriz', 'Michelle Dias']), ['Beatriz', 'Michelle Dias']);
  const noticia = noticiaDoLog({
    entity_id: 'n1',
    user_name: 'Thiago Moreira',
    created_at: '2026-10-06T12:00:00.000Z',
    details: JSON.stringify({ titulo: 'Escala de sábado', texto: 'A escala muda às 7h.', tipo: 'informe', autor: 'Thiago Moreira' }),
  });
  assert.equal(noticia?.titulo, 'Escala de sábado');
  assert.equal(noticia?.autor, 'Thiago Moreira');
});
