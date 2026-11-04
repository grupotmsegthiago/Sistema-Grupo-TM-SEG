import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTopTabelasSugestao, fetchUltimaTabelaAprovada, destinoBloqueiaSugestao } from '../lib/billing/tabelaNaCriacao.ts';
import { atrasoDaSugestao, deveAplicarSugestao, podeDispararSugestao } from '../lib/billing/useTabelaSuggestion.ts';
import { getTopTabelaId, resolverSugestaoTop1, resolverSugestaoUltimaAprovada } from '../lib/rotaAprovadaTabela.ts';

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

test('a última OS aprovada vence a tabela mais repetida', () => {
  const historico = [
    os({ id: 'GTM-1', clientTableId: 'tab-antiga', providerTableId: 'custo-antiga', aprovadaEm: '2026-01-01T00:00:00.000Z', tipoMissao: 'Caracterizada', fornecedor: 'ALFA ESCOLTA' }),
    os({ id: 'GTM-2', clientTableId: 'tab-antiga', providerTableId: 'custo-antiga', aprovadaEm: '2026-02-01T00:00:00.000Z', tipoMissao: 'Caracterizada', fornecedor: 'ALFA ESCOLTA' }),
    os({ id: 'GTM-3', clientTableId: 'tab-antiga', providerTableId: 'custo-antiga', aprovadaEm: '2026-03-01T00:00:00.000Z', tipoMissao: 'Caracterizada', fornecedor: 'ALFA ESCOLTA' }),
    os({ id: 'GTM-9', clientTableId: 'tab-ultima', providerTableId: 'custo-ultima', aprovadaEm: '2026-11-04T16:00:00.000Z', tipoMissao: 'Caracterizada', fornecedor: 'ALFA ESCOLTA', pedagioReal: 48.5 }),
    os({ id: 'GTM-8', clientTableId: 'tab-velada', providerTableId: 'custo-velada', aprovadaEm: '2026-12-01T00:00:00.000Z', tipoMissao: 'Velada', fornecedor: 'ALFA ESCOLTA' }),
  ];
  const escolha = resolverSugestaoUltimaAprovada({
    cliente, fornecedor: 'ALFA ESCOLTA', origem, destino, tipoMissao: 'Caracterizada', historico,
  });
  assert.equal(escolha.tabelaClienteSugeridaId, 'tab-ultima');
  assert.equal(escolha.tabelaFornecedorSugeridaId, 'custo-ultima');
  assert.equal(escolha.osOrigemId, 'GTM-9');
  assert.equal(escolha.pedagioReal, 48.5);
});

test('sem o par do fornecedor a última aprovada não empresta tabela de outro', () => {
  const escolha = resolverSugestaoUltimaAprovada({
    cliente,
    fornecedor: 'GAMA ESCOLTA',
    origem,
    destino,
    tipoMissao: 'Caracterizada',
    historico: [
      os({ id: 'GTM-9', clientTableId: 'tab-alfa', providerTableId: 'custo-alfa', aprovadaEm: '2026-11-04T16:00:00.000Z', tipoMissao: 'Caracterizada', fornecedor: 'ALFA ESCOLTA' }),
    ],
  });
  assert.equal(escolha.tabelaClienteSugeridaId, null);
  assert.equal(escolha.tabelaFornecedorSugeridaId, null);
});

test('sem fornecedor a última aprovada só traz a tabela do cliente', () => {
  const escolha = resolverSugestaoUltimaAprovada({
    cliente,
    origem,
    destino,
    tipoMissao: 'Velada',
    historico: [
      os({ id: 'GTM-4', clientTableId: 'tab-velada', providerTableId: 'custo-velada', aprovadaEm: '2026-08-01T00:00:00.000Z', tipoMissao: 'Velada', fornecedor: 'ALFA ESCOLTA' }),
    ],
  });
  assert.equal(escolha.tabelaClienteSugeridaId, 'tab-velada');
  assert.equal(escolha.tabelaFornecedorSugeridaId, null);
  assert.equal(escolha.osOrigemId, 'GTM-4');
});

test('pedágio zero permanece e pedágio ausente não vira zero', () => {
  const zero = resolverSugestaoUltimaAprovada({
    cliente, origem, destino, tipoMissao: 'Caracterizada',
    historico: [os({ id: 'GTM-0', aprovadaEm: '2026-11-01T00:00:00.000Z', tipoMissao: 'Caracterizada', pedagioReal: 0 })],
  });
  assert.equal(zero.pedagioReal, 0);
  const ausente = resolverSugestaoUltimaAprovada({
    cliente, origem, destino, tipoMissao: 'Caracterizada',
    historico: [os({ id: 'GTM-A', aprovadaEm: '2026-11-01T00:00:00.000Z', tipoMissao: 'Caracterizada' })],
  });
  assert.equal(ausente.pedagioReal, null);
});

test('troca manual segura a tabela até o campo-chave mudar', () => {
  assert.equal(deveAplicarSugestao(true, false), false);
  assert.equal(deveAplicarSugestao(true, true), true);
  assert.equal(deveAplicarSugestao(false, false), true);
});

test('consulta da última aprovada ignora tipo diferente e OS não aprovada', async () => {
  const linhas = [
    {
      id: 'GTM-NOVA-VELADA',
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      mission_type: 'Velada',
      created_at: '2026-11-04T18:00:00.000Z',
      billing_approved: true,
      snapshot_data: { clientTableId: 'tab-velada', providerTableId: 'custo-velada' },
    },
    {
      id: 'GTM-ULTIMA-CARACT',
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      mission_type: 'Caracterizada',
      created_at: '2026-11-04T15:00:00.000Z',
      billing_approved: true,
      toll_value: 58.2,
      toll_value_provider: 48.5,
      snapshot_data: { clientTableId: 'tab-caract', providerTableId: 'custo-caract' },
    },
    {
      id: 'GTM-NAO-APROVADA',
      client: cliente,
      origin: origem,
      destination: destino,
      provider: 'ALFA ESCOLTA',
      mission_type: 'Caracterizada',
      created_at: '2026-11-04T19:00:00.000Z',
      billing_approved: false,
      snapshot_data: { clientTableId: 'tab-errada', providerTableId: 'custo-errada' },
    },
  ];
  const consulta = consultaFalsa(linhas);
  const escolha = await fetchUltimaTabelaAprovada(consulta.sb, cliente, 'ALFA ESCOLTA', origem, destino, 'Caracterizada');
  assert.equal(escolha.tabelaClienteSugeridaId, 'tab-caract');
  assert.equal(escolha.tabelaFornecedorSugeridaId, 'custo-caract');
  assert.equal(escolha.osOrigemId, 'GTM-ULTIMA-CARACT');
  assert.equal(escolha.pedagioReal, 48.5);
  assert.equal(consulta.filtros.some((item) => item[0] === 'eq' && item[1] === 'billing_approved' && item[2] === true), true);
});
