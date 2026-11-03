import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { erroColunaUpdatedByAusente, semUpdatedBy } from '../lib/rh/updatedByColumn';

describe('coluna updated_by ausente no RH', () => {
  it('reconhece o erro do schema cache em rh_awards', () => {
    assert.equal(erroColunaUpdatedByAusente({
      code: 'PGRST204',
      message: "Could not find the 'updated_by' column of 'rh_awards' in the schema cache",
    }), true);
    assert.equal(erroColunaUpdatedByAusente({
      code: '42703',
      message: 'column rh_bonuses.updated_by does not exist',
    }), true);
  });

  it('não trata outro erro de gravação como coluna ausente', () => {
    assert.equal(erroColunaUpdatedByAusente(null), false);
    assert.equal(erroColunaUpdatedByAusente({
      code: '23502',
      message: 'null value in column "name" violates not-null constraint',
    }), false);
  });

  it('tira updated_by e mantém o restante da premiação', () => {
    const limpo = semUpdatedBy({
      name: 'PREMIAÇÃO SALARIAL',
      amount: 1000,
      employee_id: 'abc',
      updated_by: 'Beatriz Machado',
    });
    assert.deepEqual(limpo, {
      name: 'PREMIAÇÃO SALARIAL',
      amount: 1000,
      employee_id: 'abc',
    });
  });
});
