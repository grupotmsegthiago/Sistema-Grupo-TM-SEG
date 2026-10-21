import assert from 'node:assert/strict';
import test from 'node:test';
import {
  colunasDaEdicao,
  snapshotComSomenteOAlterado,
  textoSeAlterado,
  valorOperacionalAlterado,
} from '../lib/billing/gravarSomenteAlterado';

const valores = {
  receitaServico: 1000,
  custoServico: 800,
  pedagioCliente: 45.5,
  pedagioFornecedor: 40,
  deslocamentoCliente: 10,
  deslocamentoFornecedor: 0,
  mesmaOs: false,
};

const nada = {
  receita: false,
  custo: false,
  pedagioCliente: false,
  pedagioFornecedor: false,
  deslocamentoCliente: false,
  deslocamentoFornecedor: false,
};

test('pedágio do cliente grava só toll_value', () => {
  const colunas = colunasDaEdicao({ ...nada, pedagioCliente: true }, valores);
  assert.deepEqual(colunas, { toll_value: 45.5 });
});

test('pedágio do fornecedor não reescreve o custo', () => {
  const colunas = colunasDaEdicao({ ...nada, pedagioFornecedor: true }, valores);
  assert.deepEqual(colunas, { toll_value_provider: 40 });
  assert.equal('cost_value' in colunas, false);
  assert.equal('revenue_value' in colunas, false);
});

test('receita e pedágio na mesma gravação saem juntos, o custo fica de fora', () => {
  const colunas = colunasDaEdicao(
    { ...nada, receita: true, pedagioCliente: true },
    valores,
  );
  assert.deepEqual(colunas, { revenue_value: 1000, toll_value: 45.5 });
});

test('snapshot troca o pedágio e o total, e conserva a franquia', () => {
  const snap = snapshotComSomenteOAlterado(
    {
      tollVal: 20,
      revenueServiceOnly: 1000,
      franchiseKm: 100,
      kmExtraQtd: 12,
      totalGeral: 1030,
    },
    { toll_value: 45.5 },
  );
  assert.equal(snap?.tollVal, 45.5);
  assert.equal(snap?.totalGeral, 1055.5);
  assert.equal(snap?.revenueServiceOnly, 1000);
  assert.equal(snap?.franchiseKm, 100);
  assert.equal(snap?.kmExtraQtd, 12);
});

test('sem campo editado o snapshot não é reescrito', () => {
  assert.equal(snapshotComSomenteOAlterado({ tollVal: 20, franchiseKm: 100 }, {}), null);
});

test('km igual não entra no salvamento', () => {
  assert.equal(valorOperacionalAlterado(120, '120,00'), undefined);
  assert.equal(valorOperacionalAlterado(120, '130'), 130);
});

test('origem igual não entra no salvamento', () => {
  assert.equal(textoSeAlterado('Guarulhos, SP', 'Guarulhos, SP'), undefined);
  assert.equal(textoSeAlterado('Guarulhos, SP', 'Campinas, SP'), 'Campinas, SP');
});
