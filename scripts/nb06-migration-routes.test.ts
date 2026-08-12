import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

import addMissionHandler from '../api/migration-add-mission-columns.ts';
import providerOpsHandler from '../api/migrations-provider-ops-columns.ts';

function mockRes() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
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

async function invoke(handler: (req: any, res: any) => Promise<void>, method: string, headers: Record<string, string> = {}) {
  const { res, state } = mockRes();
  await handler({ method, headers }, res);
  return state;
}

describe('NB-06 — migration handlers leves (auth antes de payload)', () => {
  it('add-mission-columns: sem token → 401', async () => {
    const state = await invoke(addMissionHandler, 'POST');
    assert.equal(state.statusCode, 401);
    assert.match(String((state.body as any)?.error || ''), /Não autorizado/i);
  });

  it('add-mission-columns: token inválido → 403', async () => {
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
