import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computePaymentSettlement,
  getTransactionOpenAmount,
  isPartialPaymentNote,
} from '../lib/financial/partialPayments';

describe('isPartialPaymentNote', () => {
  it('reconhece variações de valor parcial', () => {
    assert.equal(isPartialPaymentNote('valor parcial'), true);
    assert.equal(isPartialPaymentNote('Valor Parcial do boleto'), true);
    assert.equal(isPartialPaymentNote('pagamento parcial'), true);
    assert.equal(isPartialPaymentNote('parcialmente pago'), true);
    assert.equal(isPartialPaymentNote('quitado integral'), false);
    assert.equal(isPartialPaymentNote(''), false);
  });
});

describe('computePaymentSettlement', () => {
  it('sem pagamentos fica pendente com aberto = título', () => {
    const s = computePaymentSettlement(1000, []);
    assert.equal(s.paid, 0);
    assert.equal(s.open, 1000);
    assert.equal(s.suggestedStatus, 'PENDING');
  });

  it('pagamento parcial marca PARTIALLY_PAID e mantém em aberto', () => {
    const s = computePaymentSettlement(1000, [{ amount: 400, notes: 'valor parcial' }]);
    assert.equal(s.paid, 400);
    assert.equal(s.open, 600);
    assert.equal(s.suggestedStatus, 'PARTIALLY_PAID');
    assert.equal(s.hasPartialNote, true);
  });

  it('soma vários pagamentos até quitar', () => {
    const s = computePaymentSettlement(1000, [
      { amount: 400, notes: 'valor parcial' },
      { amount: 600, notes: 'complemento' },
    ]);
    assert.equal(s.paid, 1000);
    assert.equal(s.open, 0);
    assert.equal(s.suggestedStatus, 'PAID');
  });
});

describe('getTransactionOpenAmount', () => {
  it('usa amount_open quando existir', () => {
    assert.equal(getTransactionOpenAmount({ amount: 1000, status: 'PARTIALLY_PAID', amount_open: 250 }), 250);
  });

  it('PAID tem aberto zero', () => {
    assert.equal(getTransactionOpenAmount({ amount: 1000, status: 'PAID' }), 0);
  });
});
