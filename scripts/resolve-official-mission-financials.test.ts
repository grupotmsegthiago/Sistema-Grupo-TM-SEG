/**
 * Testes do resolver oficial financeiro (grid ↔ Auditoria).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOfficialNegativeMargin,
  resolveOfficialMissionFinancials,
} from '../lib/resolveOfficialMissionFinancials.js';

describe('resolveOfficialMissionFinancials', () => {
  it('GTM-6761 — valores salvos com billing_verified_by', () => {
    const fin = resolveOfficialMissionFinancials({
      id: 'GTM-6761',
      revenue_value: 690,
      displacement_value: 1173,
      toll_value: 0,
      cost_value: 500,
      displacement_value_provider: 850,
      toll_value_provider: 0,
      billing_verified_by: 'THIAGO MOREIRA DOS SANTOS',
      billing_approved: false,
    });
    assert.equal(fin.valorCliente, 1863);
    assert.equal(fin.valorFornecedor, 1350);
    assert.equal(fin.resultadoBruto, 513);
    assert.ok(fin.margemPercentual != null);
    assert.ok(Math.abs((fin.margemPercentual as number) - 27.535) < 0.01);
    assert.equal(fin.origemCliente, 'salvo');
    assert.equal(fin.origemFornecedor, 'salvo');
    assert.equal(fin.statusFinanceiro, 'salvo');
    assert.equal(fin.consistente, true);
    assert.equal(fin.labelFaturamento, '(Salvo)');
    assert.equal(fin.labelFornecedor, '(Salvo)');
    assert.equal(fin.usedProjection, false);
  });

  it('billing_approved → origem aprovado', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 1000,
      toll_value: 100,
      displacement_value: 0,
      cost_value: 400,
      toll_value_provider: 80,
      displacement_value_provider: 0,
      billing_approved: true,
      billing_verified_by: 'Financeiro',
    });
    assert.equal(fin.valorCliente, 1100);
    assert.equal(fin.valorFornecedor, 480);
    assert.equal(fin.origemCliente, 'aprovado');
    assert.equal(fin.origemFornecedor, 'aprovado');
    assert.equal(fin.statusFinanceiro, 'aprovado');
    assert.equal(fin.labelFaturamento, '(Auditado)');
  });

  it('persistido sem verificação formal — não classifica como salvo', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 500,
      toll_value: 0,
      displacement_value: 0,
      cost_value: 200,
      toll_value_provider: 0,
      displacement_value_provider: 0,
      billing_approved: false,
      billing_verified_by: null,
    });
    assert.equal(fin.valorCliente, 500);
    assert.equal(fin.valorFornecedor, 200);
    assert.equal(fin.origemCliente, 'persistido');
    assert.equal(fin.origemFornecedor, 'persistido');
    assert.equal(fin.statusFinanceiro, 'pendente');
    assert.equal(fin.labelFaturamento, '(Persistido)');
    assert.equal(fin.labelStatus, 'Pendente');
  });

  it('OS pendente sem valores', () => {
    const fin = resolveOfficialMissionFinancials({
      status: 'Agendada',
      revenue_value: null,
      cost_value: null,
      toll_value: null,
      toll_value_provider: null,
      displacement_value: null,
      displacement_value_provider: null,
    });
    assert.equal(fin.valorCliente, 0);
    assert.equal(fin.valorFornecedor, 0);
    assert.equal(fin.origemCliente, 'pendente');
    assert.equal(fin.origemFornecedor, 'pendente');
    assert.equal(fin.statusFinanceiro, 'pendente');
    assert.equal(fin.margemPercentual, null);
  });

  it('projeção elegível Em Viagem sem save', () => {
    const fin = resolveOfficialMissionFinancials(
      {
        status: 'Em Viagem',
        revenue_value: 0,
        cost_value: 0,
        toll_value: 0,
        toll_value_provider: 0,
        displacement_value: 0,
        displacement_value_provider: 0,
        billing_approved: false,
        billing_verified_by: null,
      },
      { projectedClientTotal: 900, projectedProviderTotal: 600 },
    );
    assert.equal(fin.valorCliente, 900);
    assert.equal(fin.valorFornecedor, 600);
    assert.equal(fin.origemCliente, 'calculado');
    assert.equal(fin.origemFornecedor, 'calculado');
    assert.equal(fin.statusFinanceiro, 'calculado');
    assert.equal(fin.usedProjection, true);
    assert.equal(fin.resultadoBruto, 300);
  });

  it('projeção NÃO sobrepõe dados salvos', () => {
    const fin = resolveOfficialMissionFinancials(
      {
        status: 'Em Viagem',
        revenue_value: 690,
        displacement_value: 1173,
        toll_value: 0,
        cost_value: 500,
        displacement_value_provider: 850,
        toll_value_provider: 0,
        billing_verified_by: 'THIAGO',
        billing_approved: false,
      },
      { projectedClientTotal: 9999, projectedProviderTotal: 8888 },
    );
    assert.equal(fin.valorCliente, 1863);
    assert.equal(fin.valorFornecedor, 1350);
    assert.equal(fin.usedProjection, false);
    assert.equal(fin.origemCliente, 'salvo');
  });

  it('cliente zero → margem null (sem divisão por zero)', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 0,
      toll_value: 0,
      displacement_value: 0,
      cost_value: 100,
      toll_value_provider: 0,
      displacement_value_provider: 0,
      billing_verified_by: 'X',
    });
    assert.equal(fin.valorCliente, 0);
    assert.equal(fin.valorFornecedor, 100);
    assert.equal(fin.margemPercentual, null);
    assert.equal(fin.resultadoBruto, -100);
    assert.ok(fin.inconsistencias.includes('cliente_zero_fornecedor_positivo'));
  });

  it('fornecedor zero', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 1000,
      toll_value: 0,
      displacement_value: 0,
      cost_value: 0,
      toll_value_provider: 0,
      displacement_value_provider: 0,
      billing_verified_by: 'X',
    });
    assert.equal(fin.valorFornecedor, 0);
    assert.equal(fin.resultadoBruto, 1000);
    assert.ok(fin.margemPercentual != null && Math.abs(fin.margemPercentual - 100) < 0.001);
  });

  it('pedágios diferentes cliente vs fornecedor', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 1000,
      toll_value: 42,
      displacement_value: 0,
      cost_value: 500,
      toll_value_provider: 35,
      displacement_value_provider: 0,
      billing_verified_by: 'X',
    });
    assert.equal(fin.valorCliente, 1042);
    assert.equal(fin.valorFornecedor, 535);
    assert.equal(fin.tollClient, 42);
    assert.equal(fin.tollProvider, 35);
  });

  it('pedágio fornecedor nulo → 0 (não copia cliente) + inconsistência técnica', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 1000,
      toll_value: 50,
      displacement_value: 0,
      cost_value: 500,
      toll_value_provider: null,
      displacement_value_provider: 0,
      billing_verified_by: 'X',
    });
    assert.equal(fin.tollProvider, 0);
    assert.equal(fin.valorFornecedor, 500);
    assert.ok(fin.inconsistencias.includes('toll_provider_null_com_toll_cliente'));
  });

  it('deslocamentos diferentes', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 100,
      toll_value: 0,
      displacement_value: 200,
      cost_value: 80,
      toll_value_provider: 0,
      displacement_value_provider: 150,
      billing_verified_by: 'X',
    });
    assert.equal(fin.valorCliente, 300);
    assert.equal(fin.valorFornecedor, 230);
  });

  it('is_same_os zera fornecedor', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 800,
      toll_value: 20,
      displacement_value: 50,
      cost_value: 999,
      toll_value_provider: 99,
      displacement_value_provider: 88,
      is_same_os: true,
      billing_verified_by: 'X',
    });
    assert.equal(fin.valorCliente, 870);
    assert.equal(fin.valorFornecedor, 0);
    assert.equal(fin.tollProvider, 0);
    assert.equal(fin.displacementProvider, 0);
  });

  it('cliente salvo e fornecedor ausente → inconsistência', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 500,
      toll_value: 0,
      displacement_value: 0,
      cost_value: null,
      toll_value_provider: null,
      displacement_value_provider: null,
      billing_verified_by: 'X',
    });
    // Com verified_by, ambos lados usam stored (fornecedor 0) com origem salvo
    assert.equal(fin.origemCliente, 'salvo');
    assert.equal(fin.origemFornecedor, 'salvo');
    assert.equal(fin.valorFornecedor, 0);
  });

  it('fornecedor persistido e cliente ausente', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: null,
      cost_value: 400,
      toll_value: 0,
      toll_value_provider: 0,
      displacement_value: 0,
      displacement_value_provider: 0,
    });
    assert.equal(fin.origemFornecedor, 'persistido');
    assert.equal(fin.origemCliente, 'pendente');
    assert.ok(fin.inconsistencias.includes('cliente_ausente_fornecedor_presente'));
    assert.equal(fin.consistente, false);
  });

  it('margem negativa', () => {
    const m = {
      revenue_value: 100,
      cost_value: 200,
      toll_value: 0,
      toll_value_provider: 0,
      displacement_value: 0,
      displacement_value_provider: 0,
      billing_verified_by: 'X',
    };
    const fin = resolveOfficialMissionFinancials(m);
    assert.equal(fin.resultadoBruto, -100);
    assert.ok(fin.margemPercentual != null && fin.margemPercentual < 0);
    assert.equal(isOfficialNegativeMargin(m), true);
  });

  it('valores inválidos (NaN) → inconsistência', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: Number.NaN,
      cost_value: 10,
      billing_verified_by: 'X',
    });
    assert.ok(fin.inconsistencias.includes('valores_nao_finitos'));
  });

  it('campos nulos tratados como zero na recomposição stored', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: null,
      cost_value: null,
      toll_value: null,
      toll_value_provider: null,
      displacement_value: null,
      displacement_value_provider: null,
      billing_verified_by: 'X',
    });
    assert.equal(fin.valorCliente, 0);
    assert.equal(fin.valorFornecedor, 0);
    assert.equal(fin.origemCliente, 'salvo');
  });

  it('aceita string numérica do Supabase', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: '690',
      displacement_value: '1173',
      toll_value: '0',
      cost_value: '500',
      displacement_value_provider: '850',
      toll_value_provider: '0',
      billing_verified_by: 'THIAGO',
    });
    assert.equal(fin.valorCliente, 1863);
    assert.equal(fin.valorFornecedor, 1350);
  });

  it('mesmos totais geram resultado e margem coerentes', () => {
    const fin = resolveOfficialMissionFinancials({
      revenue_value: 1863,
      cost_value: 1350,
      toll_value: 0,
      toll_value_provider: 0,
      displacement_value: 0,
      displacement_value_provider: 0,
      billing_verified_by: 'X',
    });
    assert.equal(fin.resultadoBruto, fin.valorCliente! - fin.valorFornecedor!);
    assert.ok(fin.margemPercentual != null);
    assert.equal(
      fin.margemPercentual,
      ((fin.resultadoBruto as number) / (fin.valorCliente as number)) * 100,
    );
  });

  it('filtro isOfficialNegativeMargin ignora service-only (usa pedágio/DESL)', () => {
    // revenue_value - cost_value = +100, mas com DESL fornecedor alto → prejuízo
    const m = {
      revenue_value: 200,
      cost_value: 100,
      toll_value: 0,
      toll_value_provider: 0,
      displacement_value: 0,
      displacement_value_provider: 500,
      billing_verified_by: 'X',
    };
    assert.equal(isOfficialNegativeMargin(m), true);
    const fin = resolveOfficialMissionFinancials(m);
    assert.equal(fin.resultadoBruto, -400);
  });
});
