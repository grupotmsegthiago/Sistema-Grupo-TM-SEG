import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atualizacoesVisiveis,
  nomesQueViram,
  noticiaDoLog,
  podePublicarNews,
  podeVerNews,
  separarLeitura,
  textoParabensCadastro,
  usuarioVeItem,
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
    details: JSON.stringify({ titulo: 'Escala de sábado', texto: 'A escala muda às 7h.', tipo: 'informe', autor: 'Thiago Moreira', anexoNome: 'escala.pdf', anexoUrl: 'https://exemplo/escala.pdf' }),
  });
  assert.equal(noticia?.titulo, 'Escala de sábado');
  assert.equal(noticia?.autor, 'Thiago Moreira');
  assert.equal(noticia?.anexoNome, 'escala.pdf');
  assert.equal(noticia?.anexoUrl, 'https://exemplo/escala.pdf');
  assert.deepEqual(noticia?.telas, []);
});

test('atualização do sistema só aparece para o perfil que acessa a área', () => {
  const operador = { role: 'operador', name: 'Beatriz', permissions: ['quotes'] };
  assert.equal(usuarioVeItem(operador, ['missions']), false);
  assert.equal(usuarioVeItem(operador, []), true);
  const titulos = atualizacoesVisiveis(operador).map((item) => item.titulo);
  assert.equal(titulos.includes('Meu Portal'), true);
  assert.equal(titulos.includes('Viaturas para comunicar à DHL'), false);
  const financeiro = { role: 'financeiro', name: 'Plínio', permissions: ['fin-dashboard'] };
  assert.equal(atualizacoesVisiveis(financeiro).some((item) => item.titulo === 'Erro de pedágio vai para quem alterou'), true);
});

test('balão separa quem leu de quem ainda não leu', () => {
  const leitura = separarLeitura(['Beatriz', 'Michelle Dias', 'Thiago Moreira'], ['beatriz']);
  assert.deepEqual(leitura.leu, ['Beatriz']);
  assert.deepEqual(leitura.naoLeu, ['Michelle Dias', 'Thiago Moreira']);
});
