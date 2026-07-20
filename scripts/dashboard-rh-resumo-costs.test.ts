import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

describe('Cockpit RH Resumo alinhado a Funcionários', () => {
  it('useDashboardDiretoriaData usa fetchEmployeeCostSummary (companyCost)', () => {
    const src = readFileSync(join(root, 'lib/dashboardDiretoria/useDashboardDiretoriaData.ts'), 'utf8');
    assert.match(src, /fetchEmployeeCostSummary/);
    assert.match(src, /companyCost/);
    assert.doesNotMatch(src, /rh_salary_configs'\)\.select\('base_salary'\)/);
  });

  it('UI do Resumo mostra Custo equipe', () => {
    const src = readFileSync(join(root, 'components/dashboard/DashboardDiretoria.tsx'), 'utf8');
    assert.match(src, /Custo equipe/);
    assert.match(src, /Premiações \/ bônus/);
  });
});
