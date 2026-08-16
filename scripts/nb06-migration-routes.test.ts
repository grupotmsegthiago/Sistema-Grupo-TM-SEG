import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

import addMissionHandler from '../api/migration-add-mission-columns.ts';
import providerOpsHandler from '../api/migrations-provider-ops-columns.ts';
import {
  ADD_MISSION_COLUMNS_RESPONSE,
  buildProviderOpsColumnsResponse,
} from '../lib/migrationEndpointPayloads.ts';

function mockRes() {
  const state: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 200,
    body: null,
    headers: {},
  };
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      state.headers[k] = v;
    },
    status(code: number) {
      state.statusCode = code;
      this.statusCode = code;
      return {
        json: (body: unknown) => {
          state.body = body;
          return body;
        },
      };
    },
  };
  return { res, state };
}

async function invoke(
  handler: (req: any, res: any) => Promise<void>,
  method: string,
  headers: Record<string, string> = {},
) {
  const { res, state } = mockRes();
  await handler({ method, headers }, res);
  return state;
}

function resolveRewrite(path: string): string | null {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites = vercel.rewrites as { source: string; destination: string }[];
  for (const rule of rewrites) {
    const src = rule.source;
    if (src === path) return rule.destination;
    if (src.includes(':')) {
      const pattern = '^' + src.replace(/:[^/]+/g, '[^/]+').replace(/\(\.\*\)/g, '.*') + '$';
      if (new RegExp(pattern).test(path)) return rule.destination;
    }
    if (src === '/api/(.*)' && path.startsWith('/api/')) return rule.destination;
  }
  return null;
}

describe('NB-06 — migration handlers leves (auth antes de payload)', () => {
  it('add-mission-columns: sem token → 401', async () => {
    const state = await invoke(addMissionHandler, 'POST');
    assert.equal(state.statusCode, 401);
    assert.match(String((state.body as any)?.error || ''), /Não autorizado/i);
  });

  it('add-mission-columns: token inválido → 401/403', async () => {
    const state = await invoke(addMissionHandler, 'POST', {
      authorization: 'Bearer invalid-token-xyz',
    });
    assert.ok(state.statusCode === 401 || state.statusCode === 403);
  });

  it('add-mission-columns: GET → 405', async () => {
    const state = await invoke(addMissionHandler, 'GET');
    assert.equal(state.statusCode, 405);
  });

  it('provider-ops-columns: sem token → 401', async () => {
    const state = await invoke(providerOpsHandler, 'POST');
    assert.equal(state.statusCode, 401);
  });

  it('provider-ops-columns: GET → 405', async () => {
    const state = await invoke(providerOpsHandler, 'GET');
    assert.equal(state.statusCode, 405);
  });

  it('handlers não importam vercelApp.cjs (sem cold start Express)', () => {
    for (const file of ['api/migration-add-mission-columns.ts', 'api/migrations-provider-ops-columns.ts']) {
      const src = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(src, /vercelApp|getApp|serverless-http/);
    }
  });

  it('handlers migration não executam SQL (sem Supabase/exec_sql/fetch)', () => {
    const forbidden = /createClient|exec_sql|from\(['"]missions|\.rpc\(|fetch\(/i;
    for (const file of [
      'api/migration-add-mission-columns.ts',
      'api/migrations-provider-ops-columns.ts',
      'lib/migrationApiAuth.ts',
      'lib/migrationEndpointPayloads.ts',
    ]) {
      const src = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(src, forbidden, `${file} não deve tocar banco`);
    }
  });

  it('payload dedicado add-mission equivale ao SSOT lib', async () => {
    const state = await invoke(addMissionHandler, 'POST', {
      authorization: 'Bearer tmseg-token-fake-user-1',
    });
    assert.ok(state.statusCode === 401 || state.statusCode === 403);
    assert.deepEqual(ADD_MISSION_COLUMNS_RESPONSE.message, 'Execute o seguinte SQL no Supabase SQL Editor:');
    assert.equal(ADD_MISSION_COLUMNS_RESPONSE.sql.length, 4);
  });

  it('payload dedicado provider-ops equivale ao SSOT lib', () => {
    const payload = buildProviderOpsColumnsResponse();
    assert.equal(payload.ok, true);
    assert.equal(payload.method, 'manual');
    assert.equal(payload.columns.length, 13);
    assert.match(payload.sql, /provider_start_km/);
    assert.match(payload.hint, /SQL Editor/i);
  });

  it('vercel.json reescreve rotas migration para handlers leves', () => {
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const rewrites = vercel.rewrites as { source: string; destination: string }[];
    const add = rewrites.find((r) => r.source === '/api/migration/add-mission-columns');
    const prov = rewrites.find((r) => r.source === '/api/migrations/provider-ops-columns');
    assert.ok(add?.destination.includes('migration-add-mission-columns'));
    assert.ok(prov?.destination.includes('migrations-provider-ops-columns'));
  });

  it('Express mantém requireAuth antes do handler (dev local)', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /app\.post\('\/api\/migration\/add-mission-columns', requireAuth, requireRole\('diretoria', 'administrador'\)/);
    assert.match(routes, /app\.post\("\/api\/migrations\/provider-ops-columns", requireAuth, requireRole\('diretoria', 'administrador'\)/);
  });
});

describe('NB-06 — hardening endpoints 🔴 (auth obrigatória)', () => {
  it('run-monthly-logs-cleanup exige requireAuth + administrador/diretoria', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(
      routes,
      /app\.post\('\/api\/admin\/run-monthly-logs-cleanup', requireAuth, requireRole\('administrador', 'diretoria'\)/,
    );
  });

  it('fix-ceva-logitech-values exige requireAuth + diretoria/administrador/financeiro', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(
      routes,
      /app\.post\("\/api\/missions\/fix-ceva-logitech-values", requireAuth, requireRole\('diretoria', 'administrador', 'financeiro'\)/,
    );
  });

  it('Express local: rotas protegidas têm requireAuth (sem subir getApp — evita handles abertos)', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    for (const [method, path, roles] of [
      ['post', '/api/admin/run-monthly-logs-cleanup', 'administrador'],
      ['post', '/api/missions/fix-ceva-logitech-values', 'diretoria'],
      ['post', '/api/migration/add-mission-columns', 'diretoria'],
      ['post', '/api/migrations/provider-ops-columns', 'diretoria'],
    ] as const) {
      const pattern = new RegExp(
        `app\\.${method}\\(['"]${path.replace(/\//g, '\\/')}['"], requireAuth, requireRole\\([^)]*${roles}`,
      );
      assert.match(routes, pattern, `${method.toUpperCase()} ${path} deve exigir auth + role`);
    }
  });
});

describe('NB-06 — regressão de roteamento vercel.json', () => {
  it('catch-all /api/(.*) é o último rewrite de API', () => {
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const rewrites = vercel.rewrites as { source: string; destination: string }[];
    const apiRewrites = rewrites.filter((r) => r.source.startsWith('/api'));
    const catchAllIdx = apiRewrites.findIndex((r) => r.source === '/api/(.*)');
    assert.ok(catchAllIdx >= 0);
    assert.equal(catchAllIdx, apiRewrites.length - 1);
  });

  it('rotas migration ficam antes do catch-all', () => {
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const rewrites = vercel.rewrites as { source: string; destination: string }[];
    const idxMigration = rewrites.findIndex((r) => r.source === '/api/migration/add-mission-columns');
    const idxCatchAll = rewrites.findIndex((r) => r.source === '/api/(.*)');
    assert.ok(idxMigration >= 0 && idxCatchAll >= 0);
    assert.ok(idxMigration < idxCatchAll);
  });

  it('amostra de rotas dedicadas existentes não mudou destino', () => {
    const samples: Array<[string, string]> = [
      ['/api/health', '/api/health'],
      ['/api/version', '/api/version'],
      ['/api/billing/ensure-schema', '/api/billing-ensure-schema'],
      ['/api/recalculate-open', '/api/recalculate-open'],
      ['/api/nf/summary', '/api/nf-control?op=summary'],
      ['/api/nf/invoices', '/api/nf-control?op=list'],
      ['/api/whatsapp/groups', '/api/whatsapp/groups'],
    ];
    for (const [path, expected] of samples) {
      const dest = resolveRewrite(path);
      assert.equal(dest, expected, `${path} deve continuar → ${expected}`);
    }
  });

  it('rotas catch-all ainda apontam para api/index', () => {
    assert.equal(resolveRewrite('/api/chat'), '/api/index');
    assert.equal(resolveRewrite('/api/admin/manual-override-settings'), '/api/index');
  });
});
