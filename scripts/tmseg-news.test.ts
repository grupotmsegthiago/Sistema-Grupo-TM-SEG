import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atualizacoesVisiveis,
  nomesDePerfil,
  nomesQueViram,
  selosDePerfil,
  noticiaDoLog,
  partesQuando,
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
    details: JSON.stringify({ titulo: 'Escala de sábado', texto: 'A escala muda às 7h.', tipo: 'informe', autor: 'Thiago Moreira', anexoNome: 'escala.pdf', anexoUrl: 'https://exemplo/escala.pdf', fotos: [{ url: 'https://exemplo/foto.png', legenda: 'Tela nova' }], treinamento: { passos: ['Abra o card', 'Siga o passo'], tela: 'dashboard' } }),
  });
  assert.equal(noticia?.titulo, 'Escala de sábado');
  assert.equal(noticia?.autor, 'Thiago Moreira');
  assert.equal(noticia?.anexoNome, 'escala.pdf');
  assert.equal(noticia?.anexoUrl, 'https://exemplo/escala.pdf');
  assert.deepEqual(noticia?.telas, []);
  assert.equal(noticia?.fotos[0]?.legenda, 'Tela nova');
  assert.deepEqual(noticia?.treinamento?.passos, ['Abra o card', 'Siga o passo']);
});

test('atualização do sistema só aparece para o perfil que acessa a área', () => {
  const operador = { role: 'operador', name: 'Beatriz', permissions: ['quotes'] };
  assert.equal(usuarioVeItem(operador, ['missions']), false);
  assert.equal(usuarioVeItem(operador, []), true);
  const titulos = atualizacoesVisiveis(operador).map((item) => item.titulo);
  assert.equal(titulos.includes('Meu Portal'), true);
  assert.equal(titulos.includes('Viaturas para comunicar à DHL'), false);
  const portal = atualizacoesVisiveis(operador).find((item) => item.titulo === 'Meu Portal');
  assert.equal(portal?.fotos[0]?.url, '/atualizacoes/sys-meu-portal.svg');
  assert.equal(portal?.treinamento?.passos.length, 3);
  assert.equal(atualizacoesVisiveis(operador).every((item) => item.fotos.length > 0 && (item.treinamento?.passos.length || 0) > 0), true);
  const financeiro = { role: 'financeiro', name: 'Plínio', permissions: ['fin-dashboard'] };
  assert.equal(atualizacoesVisiveis(financeiro).some((item) => item.titulo === 'Erro de pedágio vai para quem alterou'), true);
});

test('a coluna perfil mostra quem pode acessar', () => {
  assert.deepEqual(nomesDePerfil(['dashboard'], []), ['Todos']);
  assert.deepEqual(
    nomesDePerfil(['fin-dashboard'], [
      { name: 'Financeiro', permissions: ['fin-dashboard'] },
      { name: 'Operador', permissions: ['missions'] },
    ]),
    ['Financeiro'],
  );
  assert.deepEqual(nomesDePerfil(['missions'], []), ['Painel de OS']);
  assert.deepEqual(
    nomesDePerfil(['missions'], [
      { name: 'Operador', permissions: ['missions'] },
      { name: 'Financeiro', permissions: ['missions'] },
    ]),
    ['Todos'],
  );
  assert.deepEqual(selosDePerfil(['Financeiro', 'Operador', 'RH']), { visiveis: ['Financeiro', 'Operador'], resto: 1 });
});

test('a linha da atualização separa data e hora', () => {
  assert.deepEqual(partesQuando('2026-10-06T21:00:00-03:00'), { data: '06/10/2026', hora: '21:00' });
  const portal = atualizacoesVisiveis({ role: 'operador', name: 'Beatriz', permissions: ['quotes'] }).find((item) => item.id === 'sys-meu-portal');
  assert.equal(portal?.criadoEm, '2026-10-06T21:00:00-03:00');
});

test('balão separa quem leu de quem ainda não leu', () => {
  const leitura = separarLeitura(['Beatriz', 'Michelle Dias', 'Thiago Moreira'], ['beatriz']);
  assert.deepEqual(leitura.leu, ['Beatriz']);
  assert.deepEqual(leitura.naoLeu, ['Michelle Dias', 'Thiago Moreira']);
});
