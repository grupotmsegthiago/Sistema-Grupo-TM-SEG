import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRhInitRequest } from '../api/rh-init.ts';

const principal = {
  id: 'user-rh-1',
  name: 'Pessoa RH',
  email: 'rh@grupotmseg.com.br',
  role: 'rh',
  clientId: null,
  permissions: [],
};

const validRequest = {
  method: 'POST',
  headers: { authorization: 'Bearer tmseg-token-user-rh-1-123456' },
};

function responseMock() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
}

function accessDeps(role: string | null = 'rh', hasServiceRole = true) {
  return {
    hasServiceRole: () => hasServiceRole,
    resolvePrincipal: async () => (
      role ? { ...principal, role } : null
    ),
  };
}

describe('P0 — segurança do bootstrap /api/rh/init', () => {
  it('POST e GET sem autenticação retornam 401 sem bootstrap', async () => {
    for (const method of ['POST', 'GET']) {
      let ensureCalls = 0;
      const res = responseMock();
      await handleRhInitRequest(
        { method, headers: {} },
        res,
        {
          accessDeps: accessDeps(),
          ensure: async () => {
            ensureCalls += 1;
            return { method: 'test', tables: [] };
          },
        },
      );
      assert.equal(res.statusCode, 401);
      assert.equal(ensureCalls, 0);
    }
  });

  it('token inválido retorna 401 sem consultar bootstrap', async () => {
    let ensureCalls = 0;
    const res = responseMock();
    await handleRhInitRequest(
      { ...validRequest, headers: { authorization: 'Bearer inválido' } },
      res,
      {
        accessDeps: accessDeps(),
        ensure: async () => {
          ensureCalls += 1;
          return { method: 'test', tables: [] };
        },
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(ensureCalls, 0);
  });

  it('role sem permissão retorna 403 sem bootstrap', async () => {
    let ensureCalls = 0;
    const res = responseMock();
    await handleRhInitRequest(validRequest, res, {
      accessDeps: accessDeps('operacional'),
      ensure: async () => {
        ensureCalls += 1;
        return { method: 'test', tables: [] };
      },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(ensureCalls, 0);
  });

  it('service_role ausente retorna 503 sem bootstrap', async () => {
    let ensureCalls = 0;
    const res = responseMock();
    await handleRhInitRequest(validRequest, res, {
      accessDeps: accessDeps('rh', false),
      ensure: async () => {
        ensureCalls += 1;
        return { method: 'test', tables: [] };
      },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(ensureCalls, 0);
  });

  it('RH e Diretoria reais preservam o POST legítimo', async () => {
    for (const role of ['rh', 'diretoria']) {
      let ensureCalls = 0;
      const res = responseMock();
      await handleRhInitRequest(validRequest, res, {
        accessDeps: accessDeps(role),
        ensure: async () => {
          ensureCalls += 1;
          return { method: 'exec_sql', tables: ['rh_employees'] };
        },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(ensureCalls, 1);
      assert.deepEqual(res.body, {
        ok: true,
        method: 'exec_sql',
        tables: ['rh_employees'],
      });
    }
  });

  it('GET autenticado mantém contrato 405', async () => {
    const res = responseMock();
    await handleRhInitRequest(
      { ...validRequest, method: 'GET' },
      res,
      { accessDeps: accessDeps() },
    );
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'POST');
  });

  it('double-submit compartilha uma inicialização em voo', async () => {
    let ensureCalls = 0;
    let release: ((value: { method: string; tables: string[] }) => void) | null = null;
    const pending = new Promise<{ method: string; tables: string[] }>((resolve) => {
      release = resolve;
    });
    const first = responseMock();
    const second = responseMock();
    const deps = {
      accessDeps: accessDeps(),
      ensure: async () => {
        ensureCalls += 1;
        return pending;
      },
    };

    const firstCall = handleRhInitRequest(validRequest, first, deps);
    const secondCall = handleRhInitRequest(validRequest, second, deps);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(ensureCalls, 1);

    release?.({ method: 'exec_sql', tables: ['rh_employees'] });
    await Promise.all([firstCall, secondCall]);
    assert.deepEqual(first.body, second.body);
  });

  it('erro limpa single-flight e permite nova execução', async () => {
    let ensureCalls = 0;
    const failed = responseMock();
    await handleRhInitRequest(validRequest, failed, {
      accessDeps: accessDeps(),
      ensure: async () => {
        ensureCalls += 1;
        throw new Error('falha controlada');
      },
    });
    assert.equal(failed.statusCode, 500);

    const retried = responseMock();
    await handleRhInitRequest(validRequest, retried, {
      accessDeps: accessDeps(),
      ensure: async () => {
        ensureCalls += 1;
        return { method: 'exec_sql', tables: [] };
      },
    });
    assert.equal(retried.statusCode, 200);
    assert.equal(ensureCalls, 2);
  });
});
