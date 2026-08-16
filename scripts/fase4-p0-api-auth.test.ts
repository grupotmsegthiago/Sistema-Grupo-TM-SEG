import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  authorizeF4ApiRequest,
  canAccessF4ClientScope,
  F4_ADMIN_ROLES,
} from '../lib/auth/f4ApiAccess.js';
import type { ResolvedPrincipal } from '../lib/auth/resolvePrincipal.js';

const routes = fs.readFileSync('server/routes.ts', 'utf8');

describe('F4-P0 — RED/GREEN das rotas administrativas residuais', () => {
  const adminRoutes = [
    ['GET', '/api/db/capacity'],
    ['POST', '/api/db/vacuum'],
    ['GET', '/api/platform/costs'],
    ['POST', '/api/platform/costs/overrides'],
    ['POST', '/api/client-registries/init'],
    ['DELETE', '/api/client-registries/:id'],
  ] as const;

  for (const [method, path] of adminRoutes) {
    it(`${method} ${path} exige principal ativo + role administrativa antes do handler`, () => {
      const verb = method.toLowerCase();
      assert.ok(
        routes.includes(`app.${verb}("${path}", requireF4AdminAccess, async`),
        `${method} ${path} deve usar requireF4AdminAccess`,
      );
    });
  }

  const scopedRoutes = [
    ['GET', '/api/missions/:id/operational-report'],
    ['GET', '/api/client-registries/:clientId/:type'],
    ['POST', '/api/client-registries'],
    ['GET', '/api/client-mission-notes/:missionId'],
    ['POST', '/api/client-mission-notes'],
    ['GET', '/api/client-mission-notes/bulk/:clientId'],
  ] as const;

  for (const [method, path] of scopedRoutes) {
    it(`${method} ${path} valida principal ativo antes de acessar Supabase admin`, () => {
      const verb = method.toLowerCase();
      assert.ok(
        routes.includes(`app.${verb}("${path}", requireF4ActivePrincipal, async`),
        `${method} ${path} deve usar requireF4ActivePrincipal`,
      );
    });
  }

  it('PATCH relatório operacional exige role interna autorizada', () => {
    assert.ok(
      routes.includes(
        'app.patch("/api/missions/:id/operational-report", requireF4OperationalWriteAccess, async',
      ),
    );
  });

  it('mantém áreas protegidas fora do escopo F4-P0', () => {
    const protectedPaths = [
      'api/asaas-webhook.ts',
      'lib/asaasWebhookCore.ts',
      'components/FinancialInvoiceControl.tsx',
      'lib/missionFinancialsCanonical.ts',
      'components/FinancialDRE.tsx',
    ];
    for (const path of protectedPaths) assert.equal(fs.existsSync(path), true);
  });
});

const principal = (
  role: string,
  overrides: Partial<ResolvedPrincipal> = {},
): ResolvedPrincipal => ({
  id: 'user-1',
  name: 'Usuário Teste',
  email: 'teste@example.com',
  role,
  clientId: null,
  permissions: [],
  ...overrides,
});

describe('F4-P0 — autorização fail-closed compartilhada', () => {
  it('sem autenticação → 401 e resolver não é chamado', async () => {
    let resolverCalled = false;
    const result = await authorizeF4ApiRequest(
      { headers: {} },
      F4_ADMIN_ROLES,
      async () => {
        resolverCalled = true;
        return principal('diretoria');
      },
    );
    assert.deepEqual(result, { ok: false, status: 401, error: 'Não autorizado' });
    assert.equal(resolverCalled, false);
  });

  it('token inválido/inativo → 401', async () => {
    const result = await authorizeF4ApiRequest(
      { headers: { authorization: 'Bearer token-invalido' } },
      F4_ADMIN_ROLES,
      async () => null,
    );
    assert.deepEqual(result, { ok: false, status: 401, error: 'Não autorizado' });
  });

  it('role não autorizada → 403', async () => {
    const result = await authorizeF4ApiRequest(
      { headers: { 'x-auth-token': 'token-valido' } },
      F4_ADMIN_ROLES,
      async () => principal('operador'),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  it('role autorizada → operação pode ser alcançada', async () => {
    const result = await authorizeF4ApiRequest(
      { headers: { authorization: 'Bearer token-valido' } },
      F4_ADMIN_ROLES,
      async () => principal('diretoria'),
    );
    assert.equal(result.ok, true);
  });

  it('require active (*) aceita qualquer principal válido e permissão global preserva admin', async () => {
    const active = await authorizeF4ApiRequest(
      { headers: { authorization: 'token-valido' } },
      ['*'],
      async () => principal('cliente', { clientId: '10' }),
    );
    const global = await authorizeF4ApiRequest(
      { headers: { authorization: 'token-valido' } },
      F4_ADMIN_ROLES,
      async () => principal('perfil-custom', { permissions: ['*'] }),
    );
    assert.equal(active.ok, true);
    assert.equal(global.ok, true);
  });

  it('escopo cliente permite próprio ID/client_view e bloqueia outro cliente', () => {
    assert.equal(
      canAccessF4ClientScope(principal('cliente', { clientId: '10' }), '10'),
      true,
    );
    assert.equal(
      canAccessF4ClientScope(
        principal('comercial-restrito', { permissions: ['client_view:20'] }),
        '20',
      ),
      true,
    );
    assert.equal(
      canAccessF4ClientScope(principal('cliente', { clientId: '10' }), '11'),
      false,
    );
    assert.equal(canAccessF4ClientScope(principal('diretoria'), '99'), true);
  });

  it('runtime equivalente responde 401/403 rápido e só alcança operação com role correta', async () => {
    const app = express();
    let operationCalls = 0;
    const resolve = async (token: string) => {
      if (token === 'diretoria-ok') return principal('diretoria');
      if (token === 'operador-ok') return principal('operador');
      return null;
    };
    app.get('/admin', async (req, res) => {
      const auth = await authorizeF4ApiRequest(req, F4_ADMIN_ROLES, resolve);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      operationCalls += 1;
      return res.status(200).json({ ok: true });
    });

    const server = app.listen(0);
    await new Promise<void>((resolveListen) => server.once('listening', resolveListen));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const startedAt = Date.now();
      const noAuth = await fetch(`${base}/admin`);
      const invalid = await fetch(`${base}/admin`, {
        headers: { authorization: 'Bearer token-invalido' },
      });
      const wrongRole = await fetch(`${base}/admin`, {
        headers: { authorization: 'Bearer operador-ok' },
      });
      const allowed = await fetch(`${base}/admin`, {
        headers: { authorization: 'Bearer diretoria-ok' },
      });

      assert.equal(noAuth.status, 401);
      assert.equal(invalid.status, 401);
      assert.equal(wrongRole.status, 403);
      assert.equal(allowed.status, 200);
      assert.equal(operationCalls, 1);
      assert.ok(Date.now() - startedAt < 2_000);
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    }
  });
});
