import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConfirmReceivablePayPlan,
  buildResidualDescription,
  extractParentTransactionId,
  parseMoneyInput,
  RESIDUAL_PARENT_MARKER,
} from '../lib/financial/confirmReceivablePay';

describe('confirmReceivablePay', () => {
  it('pagamento parcial gera residual e alerta', () => {
    const plan = buildConfirmReceivablePayPlan({
      titleAmount: 700,
      principalPaid: 600,
      interest: 0,
      fine: 0,
      dueDate: '2026-07-31',
      today: '2026-07-30',
    });
    assert.equal(plan.principalApplied, 600);
    assert.equal(plan.residual, 100);
    assert.equal(plan.isPartial, true);
    assert.equal(plan.residualStatus, 'PENDING');
    assert.equal(plan.totalReceived, 600);
    assert.ok(plan.alerts.some((a) => /residual/i.test(a)));
  });

  it('residual vencido quando due_date < hoje', () => {
    const plan = buildConfirmReceivablePayPlan({
      titleAmount: 700,
      principalPaid: 600,
      dueDate: '2026-07-20',
      today: '2026-07-30',
    });
    assert.equal(plan.residualStatus, 'OVERDUE');
  });

  it('juros e multa entram no total recebido com alerta', () => {
    const plan = buildConfirmReceivablePayPlan({
      titleAmount: 700,
      principalPaid: 700,
      interest: 25.5,
      fine: 10,
      dueDate: '2026-07-31',
      today: '2026-07-30',
    });
    assert.equal(plan.isPartial, false);
    assert.equal(plan.totalReceived, 735.5);
    assert.ok(plan.alerts.some((a) => /juros/i.test(a)));
    assert.ok(plan.alerts.some((a) => /multa/i.test(a)));
  });

  it('parseMoneyInput aceita formato BR', () => {
    assert.equal(parseMoneyInput('600,00'), 600);
    assert.equal(parseMoneyInput('1.200,50'), 1200.5);
    assert.equal(parseMoneyInput('600.5'), 600.5);
  });

  it('marca e descrição do residual', () => {
    const desc = buildResidualDescription('Ref. ao mês completo de Julho/2026');
    assert.match(desc, /^↳ Saldo residual —/);
    const notes = `${RESIDUAL_PARENT_MARKER}abc-123 | Saldo residual`;
    assert.equal(extractParentTransactionId(notes), 'abc-123');
  });
});
