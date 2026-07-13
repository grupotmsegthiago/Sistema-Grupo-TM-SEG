import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternalGroupTransfer,
  textMentionsGroupCompany,
  INTERNAL_TRANSFER_NOTE_TAG,
} from '../lib/financialInternalTransfer';
import { computeCashKpis } from '../lib/dashboardDiretoria/aggregations';

describe('financialInternalTransfer', () => {
  it('reconhece empresas do grupo TM SEG / Security / Gestão', () => {
    assert.equal(textMentionsGroupCompany('TM GESTÃO'), true);
    assert.equal(textMentionsGroupCompany('TM Security'), true);
    assert.equal(textMentionsGroupCompany('TM SEGURANÇA'), true);
    assert.equal(textMentionsGroupCompany('TM SEG'), true);
    assert.equal(textMentionsGroupCompany('Cliente ABC Ltda'), false);
  });

  it('marca transferência quando entity_name é empresa do grupo', () => {
    assert.equal(
      isInternalGroupTransfer({
        description: 'TED recebido',
        entity_name: 'TM GESTÃO',
        type: 'INCOME',
      } as any),
      true,
    );
  });

  it('marca transferência pelo tag nas notes', () => {
    assert.equal(
      isInternalGroupTransfer({
        description: 'Movimento',
        notes: `${INTERNAL_TRANSFER_NOTE_TAG} origem TM SECURITY`,
      }),
      true,
    );
  });

  it('marca transferência por descrição explícita', () => {
    assert.equal(
      isInternalGroupTransfer({
        description: 'Transferência interna TM SEGURANÇA → TM GESTÃO',
      }),
      true,
    );
    assert.equal(
      isInternalGroupTransfer({
        description: 'Repasse TM SEG — TM GESTÃO',
      }),
      true,
    );
  });

  it('não trata recebimento de cliente externo como transferência', () => {
    assert.equal(
      isInternalGroupTransfer({
        description: 'Pagamento NF 1234',
        entity_name: 'DHL Supply Chain',
        category_name: 'Receita de serviços',
      }),
      false,
    );
  });
});

describe('computeCashKpis exclui transferências internas do Entrou/Saiu', () => {
  it('não infla Entrou com crédito entre contas do grupo', () => {
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const now = new Date(2026, 6, 20, 12, 0, 0);
    const transactions = [
      {
        id: 'client',
        type: 'INCOME',
        status: 'PAID',
        amount: 1000,
        due_date: '2026-07-10',
        payment_date: '2026-07-10',
        category_id: 'c0',
        entity_name: 'Cliente Externo',
        description: 'NF cliente',
      },
      {
        id: 'transfer-in',
        type: 'INCOME',
        status: 'PAID',
        amount: 5000,
        due_date: '2026-07-12',
        payment_date: '2026-07-12',
        category_id: 'c0',
        entity_name: 'TM GESTÃO',
        description: 'Transferência interna TM GESTÃO → TM SECURITY',
        notes: INTERNAL_TRANSFER_NOTE_TAG,
        account_id: 'a-sec',
      },
      {
        id: 'transfer-out',
        type: 'EXPENSE',
        status: 'PAID',
        amount: 5000,
        due_date: '2026-07-12',
        payment_date: '2026-07-12',
        category_id: 'c1',
        entity_name: 'TM SECURITY',
        description: 'Transferência interna TM GESTÃO → TM SECURITY',
        notes: INTERNAL_TRANSFER_NOTE_TAG,
        account_id: 'a-gest',
      },
    ] as any[];

    const cash = computeCashKpis(transactions, transactions, [], [
      { id: 'a-sec', initial_balance: 0 },
      { id: 'a-gest', initial_balance: 10000 },
    ], period, now);

    assert.equal(cash.incomePaid, 1000);
    assert.equal(cash.expensePaid, 0);
    assert.equal(cash.totalCash, 10000);
  });

  it('exclui rendimento de investimento do Entrou', () => {
    const period = { mode: 'month' as const, year: 2026, month: 6 };
    const now = new Date(2026, 6, 20, 12, 0, 0);
    const categories = [{ id: 'inv', name: 'Investimentos', type: 'INCOME', group: 'INVESTIMENTOS' }] as any[];
    const transactions = [
      {
        id: 'client',
        type: 'INCOME',
        status: 'PAID',
        amount: 1000,
        due_date: '2026-07-10',
        payment_date: '2026-07-10',
        category_id: 'c0',
        entity_name: 'Cliente Externo',
        description: 'NF cliente',
      },
      {
        id: 'yield',
        type: 'INCOME',
        status: 'PAID',
        amount: 1074544.45,
        due_date: '2026-07-12',
        payment_date: '2026-07-12',
        category_id: 'inv',
        category_name: 'AJUSTE DE SALDO',
        description: 'Rendimento de Investimento',
        account_id: 'a-inv',
      },
    ] as any[];
    const cash = computeCashKpis(transactions, transactions, categories, [{ id: 'a-inv', initial_balance: 0 }], period, now);
    assert.equal(cash.incomePaid, 1000);
  });
});
