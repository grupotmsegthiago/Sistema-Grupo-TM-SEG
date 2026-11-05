import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolverTabelaProgressiva,
  tabelaCompativelComTipo,
  type LinhaPreco,
  type OsHistoricoTabela,
} from '../lib/billing/progressiveTableMatcher.ts';

const cliente = 'CEVA LOGISTICS LTDA';
const origem = 'GUARULHOS - SP';
const destino = 'CAMPINAS - SP';

function tabela(parcial: Partial<LinhaPreco> & { id: string }): LinhaPreco {
  return {
    operation_type: 'SUDESTE SP ATE 800KM',
    franchise_km: 800,
    franchise_hours: 8,
    client: cliente,
    ...parcial,
  };
}

function os(parcial: Partial<OsHistoricoTabela> & { id: string }): OsHistoricoTabela {
  return {
    cliente,
    fornecedor: 'ALFA ESCOLTA',
    origem,
    destino,
    tipoMissao: 'Caracterizada',
    clientTableId: 'tab-a',
    providerTableId: 'custo-a',
    criadaEm: '2026-08-01T00:00:00.000Z',
    ...parcial,
  };
}

const tabelas: LinhaPreco[] = [
  tabela({ id: 'tab-a', operation_type: 'SUDESTE SP ATE 400KM', franchise_km: 400 }),
  tabela({ id: 'tab-b', operation_type: 'SUDESTE SP ATE 800KM', franchise_km: 800 }),
  tabela({ id: 'velada', operation_type: 'VELADA GUARULHOS', franchise_km: 100 }),
  tabela({ id: 'hora', operation_type: 'ACOMPANHAMENTO 04 HORAS', franchise_km: 0, franchise_hours: 4 }),
  tabela({ id: 'palhoca', operation_type: 'PALHOCA / FLORIANOPOLIS / SUL ATE 200KM', franchise_km: 200 }),
];

const custos: LinhaPreco[] = [
  { id: 'custo-a', provider: 'ALFA ESCOLTA', operation_type: 'SUDESTE SP ATE 800KM', franchise_km: 800, franchise_hours: 8 },
  { id: 'custo-b', provider: 'ALFA ESCOLTA', operation_type: 'SUDESTE SP ATE 400KM', franchise_km: 400, franchise_hours: 8 },
];

function resolver(parcial: Parameters<typeof resolverTabelaProgressiva>[0]) {
  return resolverTabelaProgressiva({
    tipoMissao: 'Caracterizada',
    cliente,
    fornecedor: 'ALFA ESCOLTA',
    origem,
    destino,
    distanciaKm: 500,
    tabelasCliente: tabelas,
    tabelasFornecedor: custos,
    historico: [],
    ...parcial,
  });
}

test('sem tipo a busca não sugere tabela', () => {
  const escolha = resolver({ tipoMissao: '', historico: [os({ id: '1' })] });
  assert.equal(escolha.tabelaClienteId, null);
  assert.equal(escolha.origem, 'nenhuma');
});

test('velada não herda tabela caracterizada', () => {
  assert.equal(tabelaCompativelComTipo('SUDESTE SP ATE 800KM', 'Velada'), true);
  assert.equal(tabelaCompativelComTipo('CARACTERIZADA SP', 'Velada'), false);
  assert.equal(tabelaCompativelComTipo('VELADA GUARULHOS', 'Caracterizada'), false);
  const escolha = resolver({
    tipoMissao: 'Velada',
    tabelasCliente: [tabela({ id: 'carac', operation_type: 'CARACTERIZADA SP ATE 800KM', franchise_km: 800 })],
    historico: [os({ id: '1', tipoMissao: 'Caracterizada', clientTableId: 'carac' })],
    distanciaKm: 500,
  });
  assert.equal(escolha.tabelaClienteId, null);
});

test('top 1 conta as 10 mais recentes da rota, não só a última', () => {
  const historico = [
    os({ id: 'nova', clientTableId: 'tab-b', providerTableId: 'custo-b', criadaEm: '2026-10-01T00:00:00.000Z' }),
    os({ id: '1', clientTableId: 'tab-a', providerTableId: 'custo-a', criadaEm: '2026-09-03T00:00:00.000Z' }),
    os({ id: '2', clientTableId: 'tab-a', providerTableId: 'custo-a', criadaEm: '2026-09-02T00:00:00.000Z' }),
    os({ id: '3', clientTableId: 'tab-a', providerTableId: 'custo-a', criadaEm: '2026-09-01T00:00:00.000Z' }),
  ];
  const escolha = resolver({ historico });
  assert.equal(escolha.tabelaClienteId, 'tab-a');
  assert.equal(escolha.tabelaFornecedorId, 'custo-a');
  assert.equal(escolha.origem, 'historico');
  assert.equal(escolha.rotulo, 'Sugerido: Histórico Aprovado (Top 1)');
});

test('a décima primeira OS da rota não entra na contagem', () => {
  const recentes = Array.from({ length: 10 }, (_, indice) => os({
    id: `recente-${indice}`,
    clientTableId: 'tab-b',
    criadaEm: `2026-10-${String(20 - indice).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const antigas = Array.from({ length: 11 }, (_, indice) => os({
    id: `antiga-${indice}`,
    clientTableId: 'tab-a',
    criadaEm: `2026-08-${String(20 - indice).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const escolha = resolver({ historico: [...recentes, ...antigas], fornecedor: null });
  assert.equal(escolha.tabelaClienteId, 'tab-b');
});

test('tabela apagada do cadastro não é sugerida', () => {
  const escolha = resolver({
    historico: [
      os({ id: '1', clientTableId: 'apagada', criadaEm: '2026-10-02T00:00:00.000Z' }),
      os({ id: '2', clientTableId: 'apagada', criadaEm: '2026-10-01T00:00:00.000Z' }),
    ],
    distanciaKm: null,
  });
  assert.equal(escolha.tabelaClienteId, null);
});

test('destino em raio usa a franquia horária e ignora a cidade', () => {
  const escolha = resolver({
    destino: 'RAIO 200 KM — DESTINO A DEFINIR',
    historico: [os({ id: '1', clientTableId: 'tab-b' })],
  });
  assert.equal(escolha.tabelaClienteId, 'hora');
  assert.equal(escolha.tabelaFornecedorId, null);
  assert.equal(escolha.origem, 'franquia_horaria');
});

test('rota sem histórico cai na menor franquia da UF que cobre o km', () => {
  const escolha = resolver({ historico: [], distanciaKm: 500, fornecedor: 'ALFA ESCOLTA' });
  assert.equal(escolha.tabelaClienteId, 'tab-b');
  assert.equal(escolha.tabelaFornecedorId, null);
  assert.equal(escolha.rotulo, 'Sugerido: Cadastro Regional SP');
});

test('franquia menor que a distância não entra', () => {
  const escolha = resolver({
    historico: [],
    distanciaKm: 900,
    tabelasCliente: [tabela({ id: 'curta', operation_type: 'SUDESTE SP ATE 400KM', franchise_km: 400 })],
  });
  assert.equal(escolha.tabelaClienteId, null);
  assert.equal(escolha.origem, 'nenhuma');
});

test('duas faixas iguais não são escolhidas no escuro', () => {
  const escolha = resolver({
    historico: [],
    distanciaKm: 300,
    tabelasCliente: [
      tabela({ id: 'um', operation_type: 'SUDESTE SP ATE 400KM', franchise_km: 400 }),
      tabela({ id: 'dois', operation_type: 'SP ATE 400KM', franchise_km: 400 }),
    ],
  });
  assert.equal(escolha.tabelaClienteId, null);
});

test('tabela de outra cidade não cobre a rota só por estar na região', () => {
  const escolha = resolver({
    historico: [],
    origem: 'SAO PAULO - SP',
    destino: 'CAMPINAS - SP',
    distanciaKm: 100,
    tabelasCliente: [tabela({ id: 'palhoca', operation_type: 'PALHOCA / FLORIANOPOLIS / SUL ATE 200KM', franchise_km: 200 })],
  });
  assert.equal(escolha.tabelaClienteId, null);
});

test('sem fornecedor a tabela de custo fica vazia', () => {
  const escolha = resolver({
    fornecedor: null,
    historico: [os({ id: '1', providerTableId: 'custo-a' })],
  });
  assert.equal(escolha.tabelaClienteId, 'tab-a');
  assert.equal(escolha.tabelaFornecedorId, null);
});

test('fornecedor diferente não empresta a tabela do par', () => {
  const escolha = resolver({
    fornecedor: 'BETA ESCOLTA',
    historico: [os({ id: '1', fornecedor: 'ALFA ESCOLTA', clientTableId: 'tab-a' })],
    distanciaKm: null,
  });
  assert.equal(escolha.origem, 'nenhuma');
});

test('nome parecido de fornecedor não conta como o mesmo par', () => {
  const escolha = resolver({
    fornecedor: 'ATIVA',
    historico: [os({ id: '1', fornecedor: 'ATIVA PRONTA RESPOSTA', clientTableId: 'tab-a' })],
    distanciaKm: null,
  });
  assert.notEqual(escolha.origem, 'historico');
});
