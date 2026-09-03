import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteFinancialCategorySafely } from '../lib/financialCategories';
import { FINANCIAL_PAYMENT_METHODS } from '../lib/financial/paymentMethods';
import { isPureMedicaoReceivable } from '../lib/billing/medicaoVisibility';

function categoryClient(inUseCount: number) {
  let deleteCalls = 0;
  return {
    client: {
      from(table: string) {
        if (table === 'financial_transactions') {
          return {
            select: () => ({
              eq: async () => ({ count: inUseCount, error: null }),
            }),
          };
        }
        if (table === 'financial_categories') {
          return {
            delete: () => ({
              eq: async () => {
                deleteCalls += 1;
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`Tabela inesperada: ${table}`);
      },
    },
    deleteCalls: () => deleteCalls,
  };
}

describe('Categorias financeiras e débito automático', () => {
  it('T01 — categoria sem lançamentos pode ser excluída', async () => {
    const mock = categoryClient(0);
    const result = await deleteFinancialCategorySafely(mock.client, 'cat-1');
    assert.deepEqual(result, { deleted: true, inUseCount: 0 });
    assert.equal(mock.deleteCalls(), 1);
  });

  it('T02 — categoria em uso não é excluída', async () => {
    const mock = categoryClient(3);
    const result = await deleteFinancialCategorySafely(mock.client, 'cat-1');
    assert.deepEqual(result, { deleted: false, inUseCount: 3 });
    assert.equal(mock.deleteCalls(), 0);
  });

  it('T03 — formulário oferece excluir categoria com feedback seguro', () => {
    const source = fs.readFileSync('components/FinancialTransactionForm.tsx', 'utf8');
    assert.match(source, /data-testid="btn-delete-category"/);
    assert.match(source, /deleteFinancialCategorySafely\(supabase, category\.id\)/);
    assert.match(source, /lançamento\(s\) ainda usam esta categoria/);
  });

  it('T04 — gerenciador existente reutiliza exclusão segura', () => {
    const source = fs.readFileSync('components/FinancialCategoryManager.tsx', 'utf8');
    assert.match(source, /deleteFinancialCategorySafely\(supabase, id\)/);
    assert.doesNotMatch(source, /from\('financial_categories'\)\.delete\(\)\.eq\('id', id\)/);
  });

  it('T05 — débito automático existe no formulário, lista, filtro e tipo', () => {
    const form = fs.readFileSync('components/FinancialTransactionForm.tsx', 'utf8');
    const list = fs.readFileSync('components/FinancialTransactionList.tsx', 'utf8');
    const types = fs.readFileSync('types.ts', 'utf8');
    assert.deepEqual(
      FINANCIAL_PAYMENT_METHODS.at(-1),
      { value: 'DEBITO_AUTOMATICO', label: 'Déb. Automático' },
    );
    assert.match(form, /FINANCIAL_PAYMENT_METHODS\.map/);
    assert.match(list, /\.\.\.FINANCIAL_PAYMENT_METHODS/);
    assert.match(list, /FINANCIAL_PAYMENT_METHODS\.map/);
    assert.match(types, /FinancialPaymentMethod/);
  });

  it('T06 — débito automático é reconhecido como forma real de recebimento', () => {
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Medição período X',
        notes: 'Boletim de Medição enviado ao cliente',
        payment_method: 'DEBITO_AUTOMATICO',
      }),
      false,
    );
  });
});
