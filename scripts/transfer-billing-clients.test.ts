import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isBankTransferBillingClient,
  transferBillingDueDays,
} from '../lib/billing/transferBillingClients';

describe('transferBillingClients', () => {
  it('CEVA e DHL são transferência (sem boleto)', () => {
    assert.equal(isBankTransferBillingClient('CEVA LOGISTICS LTDA'), true);
    assert.equal(isBankTransferBillingClient('DHL EXPRESS'), true);
    assert.equal(isBankTransferBillingClient(null, 'DHL GLOBAL'), true);
    assert.equal(isBankTransferBillingClient('PRESTEX ENCOMENDAS'), false);
  });

  it('CEVA 70 dias, demais transferência 30', () => {
    assert.equal(transferBillingDueDays('CEVA LOGISTICS'), 70);
    assert.equal(transferBillingDueDays('DHL EXPRESS'), 30);
  });
});
