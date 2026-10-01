import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasPersistedBillingFreeze, shouldRecalcOnTableChange } from '../lib/billing/tableSwapPolicy.ts';

describe('Troca de tabela não apaga valor salvo', () => {
  it('a mesma tabela não recalcula', () => {
    assert.equal(shouldRecalcOnTableChange('tab-100', 'tab-100'), false);
    assert.equal(shouldRecalcOnTableChange('', ''), false);
    assert.equal(shouldRecalcOnTableChange(null, ''), false);
  });

  it('tabela nova recalcula', () => {
    assert.equal(shouldRecalcOnTableChange('tab-100', 'tab-200'), true);
    assert.equal(shouldRecalcOnTableChange('tab-100', ''), true);
    assert.equal(shouldRecalcOnTableChange('', 'tab-100'), true);
  });

  it('valor salvo, motivo ou conferência congela o motor', () => {
    assert.equal(hasPersistedBillingFreeze({ cost_value: 1197.85, cost_edit_reason: 'Rota Brasil' }), true);
    assert.equal(hasPersistedBillingFreeze({ cost_value: 1244.6, revenue_value: 2062.2 }), true);
    assert.equal(hasPersistedBillingFreeze({ billing_verified_by: 'Giovanna Marsili', cost_value: 0, revenue_value: 0 }), true);
    assert.equal(hasPersistedBillingFreeze({ billing_approved: true }), true);
    assert.equal(hasPersistedBillingFreeze({ cost_value: 0, revenue_value: 0 }), false);
    assert.equal(hasPersistedBillingFreeze(null), false);
  });
});
