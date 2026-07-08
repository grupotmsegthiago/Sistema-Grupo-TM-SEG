import test from 'node:test';
import assert from 'node:assert/strict';
import { isIntentionalBillingOverride } from '../lib/financialUtils';

test('isIntentionalBillingOverride — salvamento confirmado permite auto-resync', () => {
  assert.equal(
    isIntentionalBillingOverride('[THIAGO - 03/07/2026, 14:43:00] Salvamento manual confirmado — receita: R$ 2.718,60'),
    false,
  );
});

test('isIntentionalBillingOverride — motivo vazio permite auto-resync', () => {
  assert.equal(isIntentionalBillingOverride(''), false);
  assert.equal(isIntentionalBillingOverride(null), false);
});

test('isIntentionalBillingOverride — edição manual divergente bloqueia auto-resync', () => {
  assert.equal(
    isIntentionalBillingOverride('[USER] Edição manual (sem justificativa) — receita salva: R$ 100 | sistema sugeria: R$ 200'),
    true,
  );
  assert.equal(isIntentionalBillingOverride('[USER] Desconto negociado com o cliente'), true);
});

test('isIntentionalBillingOverride — valor zero confirmado bloqueia', () => {
  assert.equal(isIntentionalBillingOverride('[USER] Valor zero confirmado'), true);
});
