import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTopTabelasSugestao, destinoBloqueiaSugestao } from '../lib/billing/tabelaNaCriacao.ts';
import { atrasoDaSugestao, podeDispararSugestao } from '../lib/billing/useTabelaSuggestion.ts';
import { getTopTabelaId, resolverSugestaoTop1 } from '../lib/rotaAprovadaTabela.ts';

const cliente = 'CEVA LOGISTICS LTDA';
const origem = 'GUARULHOS - SP';
const destino = 'CAMPINAS - SP';

function os(parcial: Record<string, unknown>) {
  return {
    id: 'OS',
    cliente,
    origem,
    destino,
    fornecedor: '',
    clientTableId: 'tab-a',
    providerTableId: null,
    aprovadaEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  };
}

test('top 1 desempata pela data mais recente', () => {
  const id = getTopTabelaId([
    { tabela_id: 'tab-a', created_at: '2026-01-01T00:00:00.000Z' },
    { tabela_id: 'tab-b', created_at: '2026-08-01T00:00:00.000Z' },
  ]);
  assert.equal(id, 'tab-b');
  const repetida = getTopTabelaId([
    { tabela_id: 'tab-a', created_at: '2026-01-01T00:00:00.000Z' },
    { tabela_id: 'tab-a', created_at: '2026-02-01T00:00:00.000Z' },
    { tabela_id: 'tab-b', created_at: '2026-09-01T00:00:00.000Z' },
  ]);
  assert.equal(repetida, 'tab-a');
});

test('com fornecedor, o par define cliente e custo', () => {
  const historico = [
    os({ id: '1', fornecedor: 'ALFA ESCOLTA', clientTableId: 'tab-par', providerTableId: 'custo-1', aprovadaEm: '2026-03-01T00:00:00.000Z' }),
    os({ id: '2', fornecedor: 'ALFA ESCOLTA', clientTableId: 'tab-par', providerTableId: 'custo-2', aprovadaEm: '2026-04-01T00:00:00.000Z' }),
    os({ id: '3', fornecedor: 'ALFA ESCOLTA', clientTableId: 'tab-outra', providerTableId: 'custo-1', aprovadaEm: '2026-05-01T00:00:00.000Z' }),
    os({ id: '4', fornecedor: 'BETA ESCOLTA', clientTableId: 'tab-geral', providerTableId: 'custo-beta', aprovadaEm: '2026-06-01T00:00:00.000Z' }),
    os({ id: '5', fornecedor: 'BETA ESCOLTA', clientTableId: 'tab-geral', providerTableId: 'custo-beta', aprovadaEm: '2026-07-01T00:00:00.000Z' }),
    os({ id: '6', fornecedor: 'BETA ESCOLTA', clientTableId: 'tab-geral', providerTableId: 'custo-beta', aprovadaEm: '2026-08-01T00:00:00.000Z' }),
  ];
  const par = resolverSugestaoTop1({ cliente, fornecedor: 'ALFA ESCOLTA', origem, destino, historico });
  assert.equal(par.tabelaClienteSugeridaId, 'tab-par');
  assert.equal(par.tabelaFornecedorSugeridaId, 'custo-1');
  const semPar = resolverSugestaoTop1({ cliente, fornecedor: 'GAMA ESCOLTA', origem, destino, historico });
  assert.equal(semPar.tabelaClienteSugeridaId, 'tab-geral');
  assert.equal(semPar.tabelaFornecedorSugeridaId, null);
});

test('sem fornecedor só sugere a tabela do cliente', () => {
  const escolha = resolverSugestaoTop1({
    cliente,
    origem,
    destino,
    historico: [
      os({ id: '1', fornecedor: 'ALFA ESCOLTA', clientTableId: 'tab-a', providerTableId: 'custo-1' }),
      os({ id: '2', clientTableId: 'tab-a', providerTableId: 'custo-9', aprovadaEm: '2026-02-01T00:00:00.000Z' }),
    ],
  });
  assert.equal(escolha.tabelaClienteSugeridaId, 'tab-a');
  assert.equal(escolha.tabelaFornecedorSugeridaId, null);
});

test('rota sem histórico não sugere tabela', () => {
  const escolha = resolverSugestaoTop1({
    cliente,
    origem,
    destino,
    historico: [os({ origem: 'SANTOS - SP', destino: 'SANTOS - SP', clientTableId: 'tab-santos' })],
  });
  assert.equal(escolha.tabelaClienteSugeridaId, null);
  assert.equal(escolha.tabelaFornecedorSugeridaId, null);
});

test('raio, a definir e acompanhamento não disparam', () => {
  assert.equal(destinoBloqueiaSugestao(''), true);
  assert.equal(destinoBloqueiaSugestao('RAIO 200 KM — DESTINO A DEFINIR'), true);
  assert.equal(destinoBloqueiaSugestao('02 HORAS DE ACOMPANHAMENTO'), true);
  assert.equal(destinoBloqueiaSugestao('CAMPINAS - SP'), false);
  assert.equal(podeDispararSugestao('', origem, destino), false);
  assert.equal(podeDispararSugestao(cliente, origem, destino), true);
  assert.equal(atrasoDaSugestao({ isRotaPredefinida: true, rotaMudou: true, ligouRotaPredefinida: false }), 0);
  assert.equal(atrasoDaSugestao({ isRotaPredefinida: true, rotaMudou: false, ligouRotaPredefinida: true }), 0);
  assert.equal(atrasoDaSugestao({ isRotaPredefinida: true, rotaMudou: false, ligouRotaPredefinida: false }), 1200);
  assert.equal(atrasoDaSugestao({ isRotaPredefinida: false, rotaMudou: true, ligouRotaPredefinida: false }), 1200);
});

function consultaFalsa(linhas: any[]) {
  const filtros: unknown[][] = [];
  const chain: any = {
    select: () => chain,
    eq: (coluna: string, valor: unknown) => { filtros.push(['eq', coluna, valor]); return chain; },
    ilike: (coluna: string, valor: unknown) => { filtros.push(['ilike', coluna, valor]); return chain; },
    not: (coluna: string, op: string, valor: unknown) => { filtros.push(['not', coluna, op, valor]); return chain; },
    order: (coluna: string, opcoes: unknown) => { filtros.push(['order', coluna, opcoes]); return chain; },
    limit: (quantidade: number) => { filtros.push(['limit', quantidade]); return chain; },
    abortSignal: () => chain,
    then: (resolve: (valor: unknown) => unknown) => resolve({ data: linhas, error: null }),
  };
  return { sb: { from: (tabela: string) => { filtros.push(['from', tabela]); return chain; } }, filtros };
}

test('consulta só OS aprovadas e fica nas 10 mais novas com tabela', async () => {
  const linhas = [];
  for (let i = 0; i < 6; i += 1) {
    linhas.push({
      id: `FALSA-${i}`,
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      created_at: `2026-12-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      billing_approved: false,
      snapshot_data: { clientTableId: 'tab-errada', providerTableId: 'custo-errada' },
    });
  }
  for (let i = 0; i < 6; i += 1) {
    linhas.push({
      id: `NOVA-${i}`,
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      created_at: `2026-10-${String(20 - i).padStart(2, '0')}T00:00:00.000Z`,
      billing_approved: true,
      snapshot_data: { clientTableId: 'tab-nova', providerTableId: 'custo-nova' },
    });
  }
  for (let i = 0; i < 4; i += 1) {
    linhas.push({
      id: `MISTA-${i}`,
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      created_at: `2026-09-0${i + 1}T00:00:00.000Z`,
      billing_approved: true,
      snapshot_data: { clientTableId: 'tab-velha', providerTableId: 'custo-velha' },
    });
  }
  for (let i = 0; i < 3; i += 1) {
    linhas.push({
      id: `VELHA-${i}`,
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
      billing_approved: true,
      snapshot_data: { clientTableId: 'tab-velha', providerTableId: 'custo-velha' },
    });
  }
  linhas.push({
    id: 'OUTRA-ROTA',
    client: cliente,
    origin: 'SANTOS - SP',
    destination: 'SANTOS - SP',
    provider: 'ALFA ESCOLTA',
    created_at: '2026-11-01T00:00:00.000Z',
    billing_approved: true,
    snapshot_data: { clientTableId: 'tab-santos', providerTableId: 'custo-santos' },
  });
  const consulta = consultaFalsa(linhas);
  const escolha = await fetchTopTabelasSugestao(consulta.sb, cliente, 'ALFA ESCOLTA', origem, destino);
  assert.equal(escolha.tabelaClienteSugeridaId, 'tab-nova');
  assert.equal(escolha.tabelaFornecedorSugeridaId, 'custo-nova');
  assert.deepEqual(consulta.filtros.find((item) => item[0] === 'eq'), ['eq', 'billing_approved', true]);
  assert.equal(consulta.filtros.some((item) => item[0] === 'order' && item[1] === 'created_at'), true);
});
