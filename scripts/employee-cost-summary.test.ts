import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmployeeCostBreakdown, sumCostBreakdowns } from '../lib/rh/employeeCostSummary';
import type { RhSalaryConfig } from '../types/rh';

const emptyTax = { inss: [], irrf: [] };

describe('employeeCostSummary', () => {
  it('calcula custo empresa = bruto + FGTS + benefícios + variáveis', () => {
    const salary: RhSalaryConfig = {
      employee_id: 'emp-1',
      base_salary: 3000,
      transport_voucher: 200,
      meal_voucher: 100,
      fgts_pct: 8,
    };
    const row = buildEmployeeCostBreakdown('emp-1', '2026-07', salary, emptyTax, 500, 100, 50);
    assert.equal(row.grossSalary, 3000);
    assert.equal(row.benefits, 300);
    assert.equal(row.fgts, 240);
    assert.equal(row.variablePay, 650);
    assert.equal(row.companyCost, 3000 + 240 + 300 + 650);
  });

  it('sem salário mantém apenas variáveis no custo', () => {
    const row = buildEmployeeCostBreakdown('emp-2', '2026-07', null, emptyTax, 100, 0, 0);
    assert.equal(row.hasSalaryConfig, false);
    assert.equal(row.companyCost, 100);
  });

  it('soma totais da equipe', () => {
    const a = buildEmployeeCostBreakdown('a', '2026-07', { employee_id: 'a', base_salary: 1000 }, emptyTax, 0, 0, 0);
    const b = buildEmployeeCostBreakdown('b', '2026-07', { employee_id: 'b', base_salary: 2000 }, emptyTax, 0, 0, 0);
    const totals = sumCostBreakdowns([a, b]);
    assert.equal(totals.grossSalary, 3000);
    assert.equal(totals.companyCost, a.companyCost + b.companyCost);
  });
});
