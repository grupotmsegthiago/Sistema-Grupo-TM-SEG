import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

describe('RH employee costs — carga estável', () => {
  it('fetchEmployeeCostSummary não usa import() dinâmico (evita chunk 404)', () => {
    const src = readFileSync(join(root, 'lib/rh/fetchEmployeeCostSummary.ts'), 'utf8');
    assert.match(src, /import \{ loadEmployeeCostSummary \}/);
    assert.doesNotMatch(src, /await import\(['"]\.\/loadEmployeeCostSummary/);
  });

  it('handlers RH usam createSupabaseAdminClient (sem decodeRef estrito)', () => {
    for (const file of ['api/rh-employee-costs.ts', 'api/rh-employee-list.ts']) {
      const src = readFileSync(join(root, file), 'utf8');
      assert.match(src, /createSupabaseAdminClient/);
      assert.doesNotMatch(src, /decodeRef\(key\) !== TMSEG_REF/);
    }
  });

  it('auth RH aceita fallback de headers x-tmseg-role', () => {
    const src = readFileSync(join(root, 'lib/rh/apiEmployeesAuth.ts'), 'utf8');
    assert.match(src, /x-tmseg-role/);
    assert.match(src, /safeResolveUserRoleFromToken/);
    assert.match(src, /extractAuthToken/);
  });

  it('lista de funcionários trata ok:false do summary', () => {
    const src = readFileSync(join(root, 'components/rh/RhEmployeeList.tsx'), 'utf8');
    assert.match(src, /from 'react'/);
    assert.match(src, /!data\.ok && data\.error/);
  });
});
