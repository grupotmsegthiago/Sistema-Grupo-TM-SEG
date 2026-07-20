import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

describe('Flag lançado no banco (Contas a Pagar)', () => {
  it('migration e script SQL criam bank_posted', () => {
    const migration = readFileSync(join(root, 'migrations/2026_07_16_financial_bank_posted.sql'), 'utf8');
    const script = readFileSync(join(root, 'scripts/financial-bank-posted.sql'), 'utf8');
    for (const src of [migration, script]) {
      assert.match(src, /bank_posted/);
      assert.match(src, /BOOLEAN/);
      assert.match(src, /financial_transactions/);
    }
  });

  it('tipo FinancialTransaction inclui bank_posted', () => {
    const src = readFileSync(join(root, 'types.ts'), 'utf8');
    assert.match(src, /bank_posted\?:\s*boolean/);
  });

  it('lista Contas a Pagar tem coluna Banco e toggle bank_posted', () => {
    const src = readFileSync(join(root, 'components/FinancialTransactionList.tsx'), 'utf8');
    assert.match(src, /btn-bank-posted-/);
    assert.match(src, /bank_posted/);
    assert.match(src, />Banco</);
    assert.match(src, /Lançado no banco/);
  });
});
