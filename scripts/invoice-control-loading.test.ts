import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Controle de Faturas — loading não bloqueia em init-invoices', () => {
  it('FinancialInvoiceControl carrega financial_invoices antes do init API', () => {
    const src = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const start = src.indexOf('const fetchInvoices = useCallback');
    const end = src.indexOf('}, []);', start) + '}, []);'.length;
    const fetchFn = src.slice(start, end);
    assert.match(fetchFn, /from\('financial_invoices'\)/);
    assert.match(fetchFn, /setLoading\(false\)/);
    const selectIdx = fetchFn.indexOf("from('financial_invoices')");
    const initIdx = fetchFn.indexOf('/api/supabase/init-invoices');
    assert.ok(selectIdx >= 0, 'deve selecionar financial_invoices');
    assert.ok(initIdx > selectIdx, 'select deve vir antes do init-invoices');
    assert.match(fetchFn, /AbortController/);
    assert.match(fetchFn, /signal:/);
    assert.match(src, /from 'react'/);
  });

  it('registerRoutes não await migrations de startup (boot Express)', () => {
    const src = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(src, /startup migrations timeout/);
    assert.match(src, /NÃO podem bloquear registerRoutes/);
    // Batch em void IIFE — registerDhlIntakeRoutes vem depois do fechamento
    const batchStart = src.indexOf('void (async () => {\n    const startupMigTimeoutMs');
    const routesAfter = src.indexOf('registerDhlIntakeRoutes(app, requireAuth, requireRole');
    assert.ok(batchStart >= 0 && routesAfter > batchStart);
  });
});
