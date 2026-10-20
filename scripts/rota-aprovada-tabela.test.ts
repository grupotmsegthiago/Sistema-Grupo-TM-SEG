import assert from 'node:assert/strict';
import test from 'node:test';
import {
  algumaTabelaCobreCidade,
  cidadeNoEndereco,
  escolherTabelasDaRotaAprovada,
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

test('cidade presente na tabela impede a memória da rota', () => {
  assert.equal(algumaTabelaCobreCidade([{ id: '1', operation_type: 'NORTE - BELEM' }], 'BELEM'), true);
  const escolha = escolherTabelasDaRotaAprovada({
    cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
    origem: origemBelem,
    destino: destinoBelem,
    historico: [{
      id: 'GTM-1',
      cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
      origem: 'BELÉM - PA',
      destino: 'BELÉM - PA',
      clientTableId: 'tab-antiga',
      aprovadaEm: '2026-01-01',
    }],
    tabelasCliente: [{ id: 'tab-cidade', operation_type: 'BELEM 100KM', client: 'INTERMODAL' }],
    tabelasFornecedor: [],
  });
  assert.equal(escolha, null);
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
});
