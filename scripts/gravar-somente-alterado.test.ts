import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  colunasDaEdicao,
  colunasDoFormulario,
  colunasQueATelaMostraDiferente,
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

test('o formulário envia os seis valores da tela, inclusive zero', () => {
  assert.deepEqual(colunasDoFormulario({
    ...valores,
    receitaServico: 0,
    pedagioCliente: 0,
  }), {
    revenue_value: 0,
    cost_value: 800,
    toll_value: 0,
    toll_value_provider: 40,
    displacement_value: 10,
    displacement_value_provider: 0,
  });
});

test('a tela diferente do banco entra mesmo sem a marca de edição', () => {
  const colunas = colunasQueATelaMostraDiferente(
    { revenue_value: 1000, cost_value: 800, toll_value: 20, toll_value_provider: 40, displacement_value: 10, displacement_value_provider: 0 },
    { ...valores, pedagioCliente: 45.5 },
  );
  assert.deepEqual(colunas, { toll_value: 45.5 });
});

test('tela igual ao banco não regrava nada', () => {
  assert.deepEqual(colunasQueATelaMostraDiferente(
    { revenue_value: 1000, cost_value: 800, toll_value: 45.5, toll_value_provider: 40, displacement_value: 10, displacement_value_provider: 0 },
    valores,
  ), {});
});

test('mesma OS não zera o fornecedor só porque a tela mostra zero', () => {
  assert.deepEqual(colunasQueATelaMostraDiferente(
    {
      revenue_value: 1000,
      cost_value: 800,
      toll_value: 45.5,
      toll_value_provider: 40,
      displacement_value: 10,
      displacement_value_provider: 15,
    },
    { ...valores, mesmaOs: true, custoServico: 0, pedagioFornecedor: 0, deslocamentoFornecedor: 0 },
  ), {});
});

test('a auditoria mostra Salvando até o banco confirmar', () => {
  const tela = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
  assert.match(tela, /painel-salvando-auditoria/);
  assert.match(tela, />Salvando</);
  assert.match(tela, /Confirmando no banco/);
  assert.match(tela, /colunasDoFormulario\(valoresNaTela\)/);
  assert.match(tela, /\.select\(\)/);
  assert.match(tela, /O banco não devolveu a OS gravada/);
  assert.match(tela, /tmseg:missao-gravada/);
  assert.match(tela, /gravarMissaoConfirmada/);
  assert.match(tela, /fecharAuditoria/);
  assert.match(tela, /fieldset disabled=\{isUpdating \|\| isSavingRoute\}/);
  assert.match(tela, /Aguarde a confirmação do banco/);
  const bloco = tela.slice(tela.indexOf('setIsUpdating(true);'), tela.indexOf('const desaprovarPelaDiretoria'));
  const liga = bloco.lastIndexOf('setIsUpdating(true)');
  const confirma = bloco.indexOf('O banco não confirmou a gravação');
  const desliga = bloco.lastIndexOf('setIsUpdating(false)');
  assert.ok(liga >= 0 && confirma > liga && desliga > confirma);
});

test('origem igual não entra no salvamento', () => {
  assert.equal(textoSeAlterado('Guarulhos, SP', 'Guarulhos, SP'), undefined);
  assert.equal(textoSeAlterado('Guarulhos, SP', 'Campinas, SP'), 'Campinas, SP');
});
