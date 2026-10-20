import assert from 'node:assert/strict';
import test from 'node:test';
import {
  algumaTabelaCobreCidade,
  cidadeNoEndereco,
  escolherTabelasDaRotaAprovada,
  quilometragemRegistrada,
  rotaDaOs,
} from '../lib/rotaAprovadaTabela.ts';

const origemBelem = 'PASSAGEM BARTOLOMEU DE GUSMÃO, 625 - CURIÓ-UTINGA, BELÉM - PA, 66610-190';
const destinoBelem = 'ROD. ENG. AUGUSTO MEIRA FILHO, PARÁ, 66923-120';

test('Belém no endereço e destino no mesmo estado fecham a rota Belém-Belém', () => {
  assert.equal(cidadeNoEndereco(origemBelem), 'BELEM');
  assert.equal(cidadeNoEndereco(destinoBelem), '');
  assert.deepEqual(rotaDaOs(origemBelem, destinoBelem), { origem: 'BELEM', destino: 'BELEM' });
  assert.deepEqual(rotaDaOs('GUARULHOS - SP', 'GOIANIA - GO'), { origem: 'GUARULHOS', destino: 'GOIANIA' });
});

test('histórico aprovado da rota vence mesmo quando a cidade aparece numa tabela', () => {
  assert.equal(algumaTabelaCobreCidade([{ id: '1', operation_type: 'NORTE - BELEM' }], 'BELEM'), true);
  const escolha = escolherTabelasDaRotaAprovada({
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: origemBelem,
    destino: destinoBelem,
    regiao: 'NORTE',
    historico: [{
      id: 'GTM-1',
      cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
      origem: 'BELÉM - PA',
      destino: 'BELÉM - PA',
      clientTableId: 'tab-antiga',
      aprovadaEm: '2026-01-01',
    }],
    tabelasCliente: [
      { id: 'tab-cidade', operation_type: 'BELEM 100KM', client: 'INTERMODAL' },
      { id: 'tab-antiga', operation_type: 'NORTE PA', client: 'INTERMODAL' },
    ],
    tabelasFornecedor: [],
  });
  assert.equal(escolha?.clientTableId, 'tab-antiga');
  assert.equal(escolha?.votos, 1);
  assert.equal(escolha?.faturadas, 0);
});

test('sem a cidade, vence a tabela mais aprovada da mesma rota e o fornecedor atual', () => {
  const historico = [
    { id: 'OS-A', cliente: 'INTERMODAL BRASIL LOGISTICA', origem: 'BELÉM - PA', destino: 'BELÉM - PA', fornecedor: 'FORNECEDOR X', clientTableId: 'cli-1', providerTableId: 'prov-1', aprovadaEm: '2026-02-01' },
    { id: 'OS-B', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'CENTRO, BELÉM - PA', destino: 'ROD. ENG. AUGUSTO MEIRA FILHO, PARÁ, 66923-120', fornecedor: 'FORNECEDOR X', clientTableId: 'cli-1', providerTableId: 'prov-1', aprovadaEm: '2026-03-01' },
    { id: 'OS-C', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', fornecedor: 'OUTRO', clientTableId: 'cli-2', providerTableId: 'prov-9', aprovadaEm: '2026-04-01' },
    { id: 'OS-D', cliente: 'OUTRO CLIENTE', origem: 'BELÉM - PA', destino: 'BELÉM - PA', clientTableId: 'cli-1', providerTableId: 'prov-1', aprovadaEm: '2026-05-01' },
  ];
  const escolha = escolherTabelasDaRotaAprovada({
    osAtualId: 'OS-ATUAL',
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: origemBelem,
    destino: destinoBelem,
    fornecedorAtual: 'FORNECEDOR X',
    historico,
    tabelasCliente: [
      { id: 'cli-1', operation_type: 'NORTE PA', client: 'INTERMODAL' },
      { id: 'cli-2', operation_type: 'NIVEL BRASIL', client: 'INTERMODAL' },
    ],
    tabelasFornecedor: [
      { id: 'prov-1', provider: 'FORNECEDOR X' },
      { id: 'prov-9', provider: 'OUTRO' },
    ],
  });
  assert.equal(escolha?.clientTableId, 'cli-1');
  assert.equal(escolha?.providerTableId, 'prov-1');
  assert.equal(escolha?.votos, 2);
  assert.equal(escolha?.osExemplo, 'OS-B');
  assert.equal(escolha?.rota, 'BELEM → BELEM');
  assert.equal(escolha?.faturadas, 0);
});

test('faturada com quilometragem parecida vence várias aprovadas de outra distância', () => {
  assert.equal(quilometragemRegistrada(10, 56, 900), 46);
  assert.equal(quilometragemRegistrada(0, 0, 46), 46);
  const historico = [
    { id: 'OS-CURTA-1', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', fornecedor: 'FORNECEDOR X', clientTableId: 'cli-curta', providerTableId: 'prov-curta', aprovadaEm: '2026-06-01', km: 40, faturada: true },
    { id: 'OS-CURTA-2', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'CENTRO, BELÉM - PA', destino: destinoBelem, fornecedor: 'FORNECEDOR X', clientTableId: 'cli-curta', providerTableId: 'prov-curta', aprovadaEm: '2026-07-01', km: 50, faturada: true },
    { id: 'OS-LONGA-1', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', clientTableId: 'cli-longa', providerTableId: 'prov-longa', aprovadaEm: '2026-08-01', km: 800, faturada: false },
    { id: 'OS-LONGA-2', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', clientTableId: 'cli-longa', providerTableId: 'prov-longa', aprovadaEm: '2026-08-02', km: 820, faturada: false },
    { id: 'OS-LONGA-3', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', clientTableId: 'cli-longa', providerTableId: 'prov-longa', aprovadaEm: '2026-08-03', km: 790, faturada: false },
    { id: 'OS-LONGA-4', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', clientTableId: 'cli-longa', providerTableId: 'prov-longa', aprovadaEm: '2026-08-04', km: 810, faturada: false },
    { id: 'OS-LONGA-5', cliente: 'INTERMODAL BRASIL LOGISTICA S.A.', origem: 'BELÉM - PA', destino: 'BELÉM - PA', clientTableId: 'cli-longa', providerTableId: 'prov-longa', aprovadaEm: '2026-08-05', km: 805, faturada: false },
  ];
  const escolha = escolherTabelasDaRotaAprovada({
    kmAtual: 46,
    regiao: 'NORTE',
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: origemBelem,
    destino: destinoBelem,
    fornecedorAtual: 'FORNECEDOR X',
    historico,
    tabelasCliente: [
      { id: 'cli-curta', operation_type: 'NORTE BELEM CURTA', client: 'INTERMODAL' },
      { id: 'cli-longa', operation_type: 'NORTE BELEM LONGA', client: 'INTERMODAL' },
    ],
    tabelasFornecedor: [
      { id: 'prov-curta', provider: 'FORNECEDOR X' },
      { id: 'prov-longa', provider: 'FORNECEDOR X' },
    ],
  });
  assert.equal(escolha?.clientTableId, 'cli-curta');
  assert.equal(escolha?.providerTableId, 'prov-curta');
  assert.equal(escolha?.votos, 2);
  assert.equal(escolha?.faturadas, 2);
  assert.equal(escolha?.osExemplo, 'OS-CURTA-2');
});

test('sem quilometragem parecida, vale a tabela com mais aprovações da rota', () => {
  const historico = [1, 2, 3].map((n) => ({
    id: `OS-L-${n}`,
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: 'BELÉM - PA',
    destino: 'BELÉM - PA',
    clientTableId: 'cli-longa',
    aprovadaEm: `2026-08-0${n}`,
    km: 800,
    faturada: false,
  }));
  historico.push({
    id: 'OS-OUTRA',
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: 'BELÉM - PA',
    destino: 'BELÉM - PA',
    clientTableId: 'cli-outra',
    aprovadaEm: '2026-09-01',
    km: 900,
    faturada: true,
  });
  const escolha = escolherTabelasDaRotaAprovada({
    kmAtual: 46,
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: origemBelem,
    destino: destinoBelem,
    historico,
    tabelasCliente: [
      { id: 'cli-longa', operation_type: 'NORTE', client: 'INTERMODAL' },
      { id: 'cli-outra', operation_type: 'NORTE', client: 'INTERMODAL' },
    ],
    tabelasFornecedor: [],
  });
  assert.equal(escolha?.clientTableId, 'cli-longa');
  assert.equal(escolha?.votos, 3);
});
