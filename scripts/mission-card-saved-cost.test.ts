import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasPersistedProviderCost,
  resolveDisplayedProviderCost,
} from '../lib/financialUtils';

describe('Monitoramento — Fornecedor salvo vs projetado', () => {
  it('GTM-7704: OS zerada na auditoria não volta para o projetado em Em Viagem', () => {
    const reason = '[THIAGO MOREIRA DOS SANTOS - 09/09/2026, 13:36] ZERADA A OS, PORQUE A G8 NÃO CHEGOU NO LOCAL E O VEICULO SEGUIU SEM ESCOLTA';
    assert.equal(hasPersistedProviderCost({
      billing_approved: false,
      billing_verified_by: null,
      cost_value: -28.8,
      cost_edit_reason: reason,
    }), true);

    const shown = resolveDisplayedProviderCost({
      costValue: -28.8,
      tollValueProvider: 28.8,
      displacementValueProvider: 0,
      billingApproved: false,
      billingVerifiedBy: null,
      costEditReason: reason,
      status: 'Em Viagem',
      projectedProviderTotal: 567.2,
    });
    assert.equal(shown, 0);
  });

  it('sem motivo e custo 0 em viagem continua projetado', () => {
    const shown = resolveDisplayedProviderCost({
      costValue: 0,
      tollValueProvider: 0,
      billingApproved: false,
      billingVerifiedBy: null,
      costEditReason: '',
      status: 'Em Viagem',
      projectedProviderTotal: 567.2,
    });
    assert.equal(shown, 567.2);
  });

  it('custo salvo > 0 usa o banco mesmo em viagem', () => {
    const shown = resolveDisplayedProviderCost({
      costValue: 500,
      tollValueProvider: 80,
      billingApproved: false,
      billingVerifiedBy: null,
      costEditReason: '',
      status: 'Em Viagem',
      projectedProviderTotal: 999,
    });
    assert.equal(shown, 580);
  });
});
