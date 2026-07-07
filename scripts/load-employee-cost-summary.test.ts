import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSalaryConfig, resolveMonthlyPremio } from '../lib/rh/loadEmployeeCostSummary.ts';

describe('loadEmployeeCostSummary helpers', () => {
  it('usa salário da planilha quando não há config no banco', () => {
    const salary = resolveSalaryConfig('id-1', 'RH001', null, null);
    assert.equal(salary?.base_salary, 2000);
  });

  it('usa premiação da planilha quando não há prêmio no banco', () => {
    assert.equal(resolveMonthlyPremio('RH001', 0), 3000);
    assert.equal(resolveMonthlyPremio('RH003', 0), 0);
  });
});
