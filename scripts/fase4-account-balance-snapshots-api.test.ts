import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  createBalanceSnapshot,
  listBalanceSnapshots,
} from '../lib/investment/snapshotClient.ts';
import { requireSnapshotsAdminClient } from '../lib/investment/accountBalanceSnapshots.ts';
import { handleInvestmentSnapshotsListRequest } from '../api/investment-snapshots-all.ts';
import { handleInvestmentSnapshotsCreateRequest } from '../api/investment-snapshots.ts';

const read = (file: string) => fs.readFileSync(file, 'utf8');

function walkRuntimeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkRuntimeFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function installAuthStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        if (key === 'authToken') return 'tmseg-token-user-1-123';
        if (key === 'userData') {
          return JSON.stringify({
            id: 'user-1',
            role: 'Diretoria',
            permissions: ['finance-group'],
          });
        }
        return null;
      },
    },
  });
}

function mockResponse() {
  const state = { status: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

describe('F4-P0-RLS — consumidores account_balance_snapshots via API', () => {
  it('frontend runtime não acessa account_balance_snapshots via Supabase direto', () => {
    const hits = [
      ...walkRuntimeFiles('components'),
      ...walkRuntimeFiles('lib'),
    ].filter((file) => {
      if (file.endsWith('accountBalanceSnapshots.ts')) return false;
      return /from\(['"]account_balance_snapshots['"]\)/.test(read(file));
    });
    assert.deepEqual(hits, []);
  });

  it('Diretoria, Contas a Pagar e Investment usam o client autenticado', () => {
    const diretoria = read('lib/dashboardDiretoria/useDashboardDiretoriaData.ts');
    const contas = read('components/FinancialTransactionList.tsx');
    const investment = read('components/FinancialAccountManager.tsx');

    for (const src of [diretoria, contas, investment]) {
      assert.match(src, /listBalanceSnapshots/);
      assert.doesNotMatch(src, /listBalanceSnapshotsDirect/);
      assert.doesNotMatch(src, /insertBalanceSnapshotDirect/);
    }
    assert.match(investment, /createBalanceSnapshot/);
  });

  it('lista mantém período, ordenação e normalização; [] é resposta legítima', async () => {
    installAuthStorage();
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify([
          {
            id: 7,
            account_id: 'acc-1',
            balance: '123.45',
            notes: '',
            created_by: 'Teste',
            recorded_at: '2026-08-17T10:00:00.000Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const rows = await listBalanceSnapshots(3650);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/investment\/snapshots-all\?days=3650/);
    assert.equal(rows[0].balance, 123.45);
    assert.equal(rows[0].recorded_at, '2026-08-17T10:00:00.000Z');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    assert.deepEqual(await listBalanceSnapshots(3650), []);
  });

  it('erro da API não aciona segunda consulta nem fallback anon', async () => {
    installAuthStorage();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'Supabase admin indisponível' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await assert.rejects(
      () => listBalanceSnapshots(3650),
      /Supabase admin indisponível/,
    );
    assert.equal(calls, 1);
  });

  it('create idêntico em voo gera um único POST', async () => {
    installAuthStorage();
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async () => {
      calls += 1;
      await pending;
      return new Response(
        JSON.stringify({
          id: 9,
          account_id: 'acc-1',
          balance: 200,
          notes: '',
          created_by: 'Teste',
          recorded_at: '2026-08-17T11:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const input = { account_id: 'acc-1', balance: 200, created_by: 'Teste' };
    const first = createBalanceSnapshot(input);
    const second = createBalanceSnapshot(input);
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await first, await second);
    assert.equal(calls, 1);
  });

  it('backend falha fechado sem service_role', () => {
    let clientCreated = false;
    assert.throws(
      () =>
        requireSnapshotsAdminClient({
          getServiceRoleKey: () => '',
          createAdminClient: () => {
            clientCreated = true;
            return {} as never;
          },
        }),
      /Supabase admin indisponível/,
    );
    assert.equal(clientCreated, false);
  });

  it('API distingue 401, 403, vazio legítimo e erro backend', async () => {
    for (const [denied, status] of [
      ['Não autorizado', 401],
      ['Permissão negada', 403],
    ] as const) {
      const { res, state } = mockResponse();
      await handleInvestmentSnapshotsListRequest(
        { method: 'GET', query: {}, headers: {} },
        res,
        { authorize: async () => denied },
      );
      assert.equal(state.status, status);
    }

    const empty = mockResponse();
    await handleInvestmentSnapshotsListRequest(
      { method: 'GET', query: { days: '3650' }, headers: {} },
      empty.res,
      { authorize: async () => null, list: async () => [] },
    );
    assert.equal(empty.state.status, 200);
    assert.deepEqual(empty.state.body, []);

    const failed = mockResponse();
    await handleInvestmentSnapshotsListRequest(
      { method: 'GET', query: {}, headers: {} },
      failed.res,
      {
        authorize: async () => null,
        list: async () => {
          throw new Error('Supabase admin indisponível');
        },
      },
    );
    assert.equal(failed.state.status, 503);

    let creates = 0;
    const created = mockResponse();
    await handleInvestmentSnapshotsCreateRequest(
      {
        method: 'POST',
        headers: {},
        body: { account_id: 'acc-1', balance: 10 },
      },
      created.res,
      {
        authorize: async () => null,
        create: async (input) => {
          creates += 1;
          return { id: 1, ...input };
        },
      },
    );
    assert.equal(created.state.status, 200);
    assert.equal(creates, 1);
  });

  it('bootstrap e CLI não recriam a policy permissiva', async () => {
    const backend = read('lib/investment/accountBalanceSnapshots.ts');
    const cli = read('scripts/apply-account-balance-snapshots-migration.mjs');
    const historical = read('migrations/2026_07_08_account_balance_snapshots.sql');
    const { selectStructuralSnapshotStatements } = await import(
      './apply-account-balance-snapshots-migration.mjs'
    );
    const selected = selectStructuralSnapshotStatements(historical).join(';\n');

    assert.match(historical, /CREATE POLICY "Allow all for account_balance_snapshots"/);
    assert.doesNotMatch(backend, /CREATE POLICY "Allow all for account_balance_snapshots"/);
    assert.doesNotMatch(backend, /DROP POLICY IF EXISTS "Allow all for account_balance_snapshots"/);
    assert.match(cli, /selectStructuralSnapshotStatements/);
    assert.match(cli, /create\|drop/);
    assert.match(selected, /CREATE TABLE IF NOT EXISTS public\.account_balance_snapshots/);
    assert.doesNotMatch(selected, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(selected, /\bDROP\s+POLICY\b/i);
  });

  it('Express e Vercel reutilizam a SSOT backend', () => {
    const server = read('server/routes.ts');
    const listApi = read('api/investment-snapshots-all.ts');
    const createApi = read('api/investment-snapshots.ts');
    const deleteApi = read('api/investment-snapshot-delete.ts');

    assert.match(server, /listAllSnapshots/);
    assert.match(server, /insertSnapshot/);
    assert.match(server, /deleteSnapshot/);
    assert.doesNotMatch(server, /SELECT \* FROM account_balance_snapshots/);
    assert.match(listApi, /listAllSnapshots/);
    assert.match(createApi, /insertSnapshot/);
    assert.match(deleteApi, /deleteSnapshot/);
    assert.match(listApi, /Supabase admin indisponível\|service_role/);
  });
});
