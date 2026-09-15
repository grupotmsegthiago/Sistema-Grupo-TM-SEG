import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolverPeriodoVencimento } from '../lib/financial/transactionPeriod';

describe('periodo de vencimento — Contas a Pagar/Receber', () => {
  it('personalizado devolve o intervalo escolhido e corrige invertido', () => {
    const ago = resolverPeriodoVencimento({
      viewPeriod: 'CUSTOM',
      today: '2026-09-15',
      customStart: '2026-08-01',
      customEnd: '2026-08-31',
    });
    assert.deepEqual(ago, { start: '2026-08-01', end: '2026-08-31' });
    const invertido = resolverPeriodoVencimento({
      viewPeriod: 'CUSTOM',
      today: '2026-09-15',
      customStart: '2026-08-31',
      customEnd: '2026-08-01',
    });
    assert.deepEqual(invertido, { start: '2026-08-01', end: '2026-08-31' });
  });

  it('mês atual e dia não vazam para outro período; Tudo não recorta', () => {
    const mes = resolverPeriodoVencimento({ viewPeriod: 'MONTH', today: '2026-09-15' });
    assert.deepEqual(mes, { start: '2026-09-01', end: '2026-09-30' });
    const dia = resolverPeriodoVencimento({ viewPeriod: 'DAY', today: '2026-09-15' });
    assert.deepEqual(dia, { start: '2026-09-15', end: '2026-09-15' });
    assert.equal(resolverPeriodoVencimento({ viewPeriod: 'ALL', today: '2026-09-15' }), null);
  });

  it('a tela consulta due_date no banco pelo período (não só no que já veio)', () => {
    const src = readFileSync('components/FinancialTransactionList.tsx', 'utf8');
    assert.match(src, /from 'react'/);
    assert.match(src, /resolverPeriodoVencimento/);
    assert.match(src, /\.gte\('due_date', periodoVencimento\.start\)/);
    assert.match(src, /\.lte\('due_date', periodoVencimento\.end\)/);
    assert.match(src, /fetchOverdueUniverse/);
  });
});
