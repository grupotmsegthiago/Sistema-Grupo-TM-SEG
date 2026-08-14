import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

describe('SEC-02 — /api/supabase/* exige auth admin', () => {
  const routes = fs.readFileSync('server/routes.ts', 'utf8');

  const adminRoutes = [
    '/api/supabase/status',
    '/api/supabase/db-metrics',
    '/api/supabase/storage-usage',
    '/api/supabase/billing-links',
    '/api/supabase/health-check',
  ];

  for (const route of adminRoutes) {
    it(`${route} usa requireAuth + requireRole diretoria/admin/ceo`, () => {
      const getPat = route.includes('billing-links')
        ? new RegExp(`app\\.get\\("${route.replace(/\//g, '\\/')}", requireAuth, requireRole\\('diretoria', 'administrador', 'ceo'\\)`)
        : new RegExp(`app\\.get\\("${route.replace(/\//g, '\\/')}", requireAuth, requireRole\\('diretoria', 'administrador', 'ceo'\\), async`);
      assert.match(routes, getPat);
    });
  }

  it('POST /api/supabase/init-invoices exige financeiro+', () => {
    assert.match(
      routes,
      /app\.post\("\/api\/supabase\/init-invoices", requireAuth, requireRole\('diretoria', 'administrador', 'ceo', 'financeiro', 'controller'\)/,
    );
  });
});

describe('SEC-01 — investment/* exige assertAsaasApiAccess', () => {
  const routes = fs.readFileSync('server/routes.ts', 'utf8');
  const securedHandlers = [
    'api/investment-init.ts',
    'api/investment-snapshots.ts',
    'api/investment-snapshots-all.ts',
    'api/investment-snapshot-delete.ts',
  ];

  for (const file of securedHandlers) {
    it(`${file} chama denyInvestmentApiUnlessAuthorized`, () => {
      const src = fs.readFileSync(file, 'utf8');
      assert.match(src, /denyInvestmentApiUnlessAuthorized/);
    });
  }

  it('investment-accounts já protegido (preservado)', () => {
    const src = fs.readFileSync('api/investment-accounts.ts', 'utf8');
    assert.match(src, /assertAsaasApiAccess/);
  });

  const expressRoutes = [
    'app.post("/api/investment/init", requireAuth, requireInvestmentApiAccess()',
    'app.get("/api/investment/snapshots/:accountId", requireAuth, requireInvestmentApiAccess()',
    'app.get("/api/investment/snapshots-all", requireAuth, requireInvestmentApiAccess()',
    'app.post("/api/investment/snapshots", requireAuth, requireInvestmentApiAccess()',
    'app.delete("/api/investment/snapshots/:id", requireAuth, requireInvestmentApiAccess()',
    'app.post("/api/investment/accounts", requireAuth, requireInvestmentApiAccess()',
    'app.patch("/api/investment/accounts/:id", requireAuth, requireInvestmentApiAccess()',
    'app.delete("/api/investment/accounts/:id", requireAuth, requireInvestmentApiAccess()',
  ];

  for (const snippet of expressRoutes) {
    it(`Express ${snippet.slice(0, 45)}…`, () => {
      assert.match(routes, new RegExp(snippet.replace(/[()]/g, '\\$&')));
    });
  }
});
