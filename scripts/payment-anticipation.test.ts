import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDaysIso,
  ANTICIPATION_MARKER,
  buildAnticipationNotes,
  buildAnticipationPlan,
  extractAnticipationId,
  extractInvoiceRefs,
  parseAnticipationMoney,
  parsePctInput,
  settlementLabel,
} from '../lib/financial/paymentAnticipation';

describe('paymentAnticipation', () => {
  it('três notas vinculadas com líquido igual ao total ficam PAGO', () => {
    const plan = buildAnticipationPlan({
      nfNumber: 'NF-OP-1',
      operationDate: '2026-09-17',
      averageRatePct: 0,
      netAnticipated: 15000,
      offeredAmount: 15000,
      titleId: 'T1',
      itemId: 'I1',
      paymentDate: '2026-09-17',
      linkedAmounts: [5000, 4000, 6000],
    });
    assert.equal(plan.saldoTotal, 15000);
    assert.equal(plan.juros, 0);
    assert.equal(plan.valorLiquido, 15000);
    assert.equal(plan.residual, 0);
    assert.equal(plan.settlement, 'PAGO');
    assert.equal(settlementLabel(plan), 'PAGO (R$ 0,00)');
  });

  it('juros = ofertado − líquido e ressalva = saldo − líquido com vencimento +15 dias', () => {
    const plan = buildAnticipationPlan({
      nfNumber: 'NF-OP-2',
      operationDate: '2026-09-01',
      averageRatePct: 2,
      netAnticipated: 9700,
      offeredAmount: 10000,
      titleId: 'T2',
      itemId: 'I2',
      paymentDate: '2026-09-02',
      linkedAmounts: [4000, 3000, 3000],
    });
    assert.equal(plan.saldoTotal, 10000);
    assert.equal(plan.juros, 300);
    assert.equal(plan.valorLiquido, 9700);
    assert.equal(plan.residual, 300);
    assert.equal(plan.settlement, 'SALDO_A_RECEBER');
    assert.equal(plan.residualDueDate, '2026-09-17');
    assert.match(settlementLabel(plan), /Saldo a Receber/);
  });

  it('sem líquido informado, calcula a partir da taxa sobre o ofertado', () => {
    const plan = buildAnticipationPlan({
      nfNumber: 'NF-OP-3',
      operationDate: '2026-09-10',
      averageRatePct: 3,
      netAnticipated: 0,
      offeredAmount: 1000,
      titleId: '',
      itemId: '',
      paymentDate: '2026-09-10',
      linkedAmounts: [1000],
    });
    assert.equal(plan.juros, 30);
    assert.equal(plan.valorLiquido, 970);
    assert.equal(plan.residual, 30);
    assert.equal(plan.settlement, 'SALDO_A_RECEBER');
  });

  it('addDaysIso e parsePctInput', () => {
    assert.equal(addDaysIso('2026-09-17', 15), '2026-10-02');
    assert.equal(parsePctInput('2,50%'), 2.5);
    assert.equal(parsePctInput('1.5'), 1.5);
  });

  it('parseAnticipationMoney aceita R$ e formato BR', () => {
    assert.equal(parseAnticipationMoney('R$ 265.194,19'), 265194.19);
    assert.equal(parseAnticipationMoney('270.044,47'), 270044.47);
    assert.equal(parseAnticipationMoney(1000), 1000);
  });

  it('marca e extrai NF das notas do título', () => {
    const notes = buildAnticipationNotes({
      existingNotes: 'Fatura ASAAS-123 | Asaas: pay_1',
      anticipationId: 'abc-uuid',
      fields: {
        nfNumber: '8821',
        operationDate: '2026-09-17',
        averageRatePct: 2,
        netAnticipated: 9700,
        offeredAmount: 10000,
        titleId: 'T9',
        itemId: 'I9',
        paymentDate: '2026-09-17',
      },
      plan: buildAnticipationPlan({
        nfNumber: '8821',
        operationDate: '2026-09-17',
        averageRatePct: 2,
        netAnticipated: 9700,
        offeredAmount: 10000,
        titleId: 'T9',
        itemId: 'I9',
        paymentDate: '2026-09-17',
        linkedAmounts: [10000],
      }),
      linkedSummary: 'NF 100 / NF 101',
    });
    assert.ok(notes.includes(ANTICIPATION_MARKER));
    assert.equal(extractAnticipationId(notes), 'abc-uuid');
    const refs = extractInvoiceRefs('Fatura ASAAS-123 | NF 4455 — CEVA');
    assert.ok(refs.includes('ASAAS-123'));
    assert.ok(refs.includes('4455'));
  });
});
