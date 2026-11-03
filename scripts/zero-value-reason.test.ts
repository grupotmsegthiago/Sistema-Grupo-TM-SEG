import test from 'node:test';
import assert from 'node:assert/strict';
import { zeroValueEditReasons } from '../lib/financialUtils.ts';

test('finalizar com custo zero grava o motivo que a regra do banco lê', () => {
  assert.deepEqual(zeroValueEditReasons({
    revenue: 1500,
    cost: 0,
    sameOs: true,
    fallbackReason: 'MESMA OS',
  }), { cost_edit_reason: 'MESMA OS' });
});

test('valor já preenchido não ganha motivo e motivo existente não é trocado', () => {
  assert.deepEqual(zeroValueEditReasons({
    revenue: 800,
    cost: 400,
    fallbackReason: 'AGUARDANDO DEFINIÇÃO',
  }), {});
  assert.deepEqual(zeroValueEditReasons({
    revenue: 0,
    cost: 0,
    revenueReason: 'OS Recusada — zerado automaticamente',
    costReason: 'OS Recusada — zerado automaticamente',
    fallbackReason: 'AGUARDANDO DEFINIÇÃO',
  }), {});
});

test('receita e custo zerados na finalização levam o motivo de espera', () => {
  assert.deepEqual(zeroValueEditReasons({
    revenue: 0,
    cost: 0,
    fallbackReason: 'AGUARDANDO DEFINIÇÃO',
  }), {
    revenue_edit_reason: 'AGUARDANDO DEFINIÇÃO',
    cost_edit_reason: 'AGUARDANDO DEFINIÇÃO',
  });
});
