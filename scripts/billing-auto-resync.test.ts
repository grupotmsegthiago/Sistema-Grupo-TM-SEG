import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleManualBillingSave, isIntentionalBillingOverride } from '../lib/financialUtils';

test('isStaleManualBillingSave detecta salvamento manual confirmado', () => {
  const reason = '[BARBARA - 01/07/2026, 11:58] Salvamento manual confirmado — receita: R$ 4.525,30';
  assert.equal(isStaleManualBillingSave(reason), true);
  assert.equal(isIntentionalBillingOverride(reason), false);
});

test('edição manual com divergência não é stale save', () => {
  const reason = '[USER] Edição manual — receita salva: R$ 100 | sistema sugeria: R$ 200';
  assert.equal(isStaleManualBillingSave(reason), false);
  assert.equal(isIntentionalBillingOverride(reason), true);
});
