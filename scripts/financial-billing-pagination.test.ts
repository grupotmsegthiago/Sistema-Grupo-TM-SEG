import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

import {
  BillingDatasetIncompleteError,
  fetchBillingMissionUniverse,
} from '../lib/billing/fetchBillingMissionUniverse.ts';
import {
  SupabasePagingIntegrityError,
  fetchAllKeysetPages,
  fetchAllPages,
} from '../lib/supabasePaging.ts';

type Row = {
  id: string;
  client: string;
  provider: string;
  status: string;
  start_time: string | null;
  billing_period_override: string | null;
  financial_value?: number;
};

function makeRows(total: number): Row[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `GTM-${String(index + 1).padStart(6, '0')}`,
    client: 'CLIENTE TESTE',
    provider: 'FORNECEDOR TESTE',
    status: 'Concluída',
    start_time: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
    billing_period_override: null,
  }));
}

function createSupabaseMock(
  sourceRows: Row[],
  fail?: { column: 'start_time' | 'billing_period_override'; afterId: string | null },
  mutateAfterQuery?: (
    context: {
      periodColumn: 'start_time' | 'billing_period_override';
      afterId: string | null;
      selectColumns: string;
      head: boolean;
    },
    rows: Row[],
  ) => void,
) {
  const calls: Array<{
    table: string;
    filterColumns: string[];
    orderColumns: string[];
    afterId: string | null;
    limit: number;
    selectColumns: string;
    head: boolean;
  }> = [];

  return {
    calls,
    from(table: string) {
      const filters: Array<{ op: string; column: string; value: any }> = [];
      const orderColumns: string[] = [];
      let limitValue = sourceRows.length;
      let exactCount = false;
      let head = false;
      let selectColumns = '*';
      const chain: any = {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          selectColumns = columns;
          exactCount = options?.count === 'exact';
          head = options?.head === true;
          return chain;
        },
        in(column: string, value: unknown[]) {
          filters.push({ op: 'in', column, value });
          return chain;
        },
        neq(column: string, value: unknown) {
          filters.push({ op: 'neq', column, value });
          return chain;
        },
        not(column: string) {
          filters.push({ op: 'not-null', column, value: null });
          return chain;
        },
        gte(column: string, value: unknown) {
          filters.push({ op: 'gte', column, value });
          return chain;
        },
        lte(column: string, value: unknown) {
          filters.push({ op: 'lte', column, value });
          return chain;
        },
        order(column: string) {
          orderColumns.push(column);
          return chain;
        },
        gt(column: string, value: unknown) {
          filters.push({ op: 'gt', column, value });
          return chain;
        },
        limit(value: number) {
          limitValue = value;
          return chain;
        },
        range(from: number, to: number) {
          filters.push({ op: 'range', column: '', value: { from, to } });
          return chain;
        },
        then(resolve: (result: { data: Row[] | null; error: Error | null; count?: number | null }) => void) {
          const periodColumn = filters.some((item) => item.column === 'billing_period_override')
            ? 'billing_period_override'
            : 'start_time';
          const afterId = (filters.find((item) => item.op === 'gt' && item.column === 'id')?.value as string | undefined) ?? null;
          calls.push({
            table,
            filterColumns: filters.map((item) => item.column),
            orderColumns: [...orderColumns],
            afterId,
            limit: limitValue,
            selectColumns,
            head,
          });
          if (fail?.column === periodColumn && fail.afterId === afterId) {
            resolve({ data: null, error: new Error(`falha ${periodColumn} ${afterId || 'início'}`) });
            return;
          }

          let rows = [...sourceRows];
          for (const filter of filters) {
            if (filter.op === 'in') {
              rows = rows.filter((row) => (filter.value as unknown[]).includes((row as any)[filter.column]));
            } else if (filter.op === 'neq') {
              rows = rows.filter((row) => (row as any)[filter.column] !== filter.value);
            } else if (filter.op === 'not-null') {
              rows = rows.filter((row) => (row as any)[filter.column] != null);
            } else if (filter.op === 'gte') {
              rows = rows.filter((row) => String((row as any)[filter.column]) >= String(filter.value));
            } else if (filter.op === 'lte') {
              rows = rows.filter((row) => String((row as any)[filter.column]) <= String(filter.value));
            } else if (filter.op === 'gt') {
              rows = rows.filter((row) => String((row as any)[filter.column]) > String(filter.value));
            }
          }
          rows.sort((a, b) => {
            for (const column of orderColumns) {
              const diff = String((a as any)[column] ?? '').localeCompare(String((b as any)[column] ?? ''));
              if (diff) return diff;
            }
            return 0;
          });
          const data = head
            ? []
            : rows.slice(0, limitValue).map((row) =>
                selectColumns === 'id' ? ({ id: row.id } as Row) : row,
              );
          const result = {
            data,
            error: null,
            count: exactCount ? rows.length : null,
          };
          mutateAfterQuery?.({ periodColumn, afterId, selectColumns, head }, sourceRows);
          resolve(result);
        },
      };
      return chain;
    },
  };
}

describe('Financeiro Fase 1A — helper de paginação integral', () => {
  async function load(total: number) {
    return fetchAllPages(
      async (from, size) => ({
        data: makeRows(total).slice(from, from + size),
        error: null,
      }),
      1000,
      10_000,
      { getRowKey: (row) => row.id },
    );
  }

  for (const total of [999, 1000, 1001, 2001, 2505]) {
    it(`${total} registros → retorna todos sem truncar`, async () => {
      const result = await load(total);
      assert.equal(result.rows.length, total);
      assert.equal(result.complete, true);
      assert.equal(result.truncated, false);
      assert.equal(new Set(result.rows.map((row) => row.id)).size, total);
    });
  }

  it('zero registros → sucesso vazio, não erro', async () => {
    const result = await load(0);
    assert.deepEqual(result.rows, []);
    assert.equal(result.complete, true);
    assert.equal(result.truncated, false);
    assert.equal(result.pagesLoaded, 1);
  });

  it('última página menor que page size encerra corretamente', async () => {
    const result = await load(1001);
    assert.equal(result.pagesLoaded, 2);
    assert.equal(result.rows[result.rows.length - 1]?.id, 'GTM-001001');
  });

  it('erro na primeira página → fail-closed', async () => {
    await assert.rejects(
      () => fetchAllPages(async () => ({ data: null, error: new Error('falha página 1') })),
      /falha página 1/,
    );
  });

  it('erro intermediário → fail-closed e não retorna parcial', async () => {
    let resolved = false;
    await assert.rejects(
      () => fetchAllPages(async (from, size) => {
        if (from === 1000) return { data: null, error: new Error('falha página 2') };
        return { data: makeRows(size), error: null };
      }, 1000, 10_000).then((result) => {
        resolved = true;
        return result;
      }),
      /falha página 2/,
    );
    assert.equal(resolved, false);
  });

  it('sobreposição entre ranges → detecta duplicidade e rejeita', async () => {
    const rows = makeRows(1500);
    await assert.rejects(
      () => fetchAllPages(async (from, size) => ({
        data: rows.slice(from === 0 ? 0 : from - 1, from + size),
        error: null,
      }), 1000, 10_000, { getRowKey: (row) => row.id }),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError && error.code === 'DUPLICATE_ROW',
    );
  });

  it('contagem conhecida diferente do carregado → rejeita universo incompleto', async () => {
    await assert.rejects(
      () => fetchAllPages(async (from) => ({
        data: from === 0 ? makeRows(900) : [],
        error: null,
        count: from === 0 ? 1000 : null,
      }), 1000, 10_000, { getRowKey: (row) => row.id }),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError && error.code === 'ROW_COUNT_MISMATCH',
    );
  });
});

describe('Financeiro Fase 1A — paginação keyset estável', () => {
  async function load(total: number) {
    const rows = makeRows(total);
    return fetchAllKeysetPages(
      async (afterId, size) => ({
        data: rows.filter((row) => afterId === null || row.id > afterId).slice(0, size),
        error: null,
        count: afterId === null ? rows.length : null,
      }),
      1000,
      10_000,
      { getRowKey: (row) => row.id },
    );
  }

  for (const total of [999, 1000, 1001, 2001, 2505]) {
    it(`${total} registros → keyset retorna o universo integral`, async () => {
      const result = await load(total);
      assert.equal(result.rows.length, total);
      assert.equal(result.complete, true);
      assert.equal(result.expectedRows, total);
      assert.equal(new Set(result.rows.map((row) => row.id)).size, total);
    });
  }

  it('zero registros → keyset completo e vazio', async () => {
    const result = await load(0);
    assert.deepEqual(result.rows, []);
    assert.equal(result.complete, true);
    assert.equal(result.expectedRows, 0);
  });
});

describe('Financeiro Fase 1A — consumidor do boletim', () => {
  const params = {
    filterColumn: 'client' as const,
    canonicalNames: ['CLIENTE TESTE'],
    rangeStart: '2026-08-01T00:00:00.000Z',
    rangeEnd: '2026-08-31T23:59:59.999Z',
    pageSize: 1000,
    maxRows: 10_000,
  };

  it('pagina consulta base e override, preserva filtros e ordem determinística', async () => {
    const base = makeRows(1001);
    const override: Row = {
      ...makeRows(1)[0],
      id: 'GTM-OVERRIDE',
      start_time: '2026-07-15T12:00:00.000Z',
      billing_period_override: '2026-08-15T12:00:00.000Z',
    };
    const mock = createSupabaseMock([...base, override]);
    const result = await fetchBillingMissionUniverse<Row>(mock as any, params);

    assert.equal(result.rows.length, 1002);
    assert.equal(result.recordsLoaded, 1002);
    assert.equal(result.complete, true);
    assert.ok(result.pagesLoaded >= 3);
    assert.equal(new Set(result.rows.map((row) => row.id)).size, 1002);
    assert.ok(mock.calls.every((call) => call.table === 'missions'));
    assert.ok(mock.calls.every((call) => call.filterColumns.includes('status')));
    assert.ok(mock.calls.every((call) => call.filterColumns.includes('client')));
    assert.ok(mock.calls.filter((call) => !call.head).every((call) => call.orderColumns[call.orderColumns.length - 1] === 'id'));
    assert.ok(mock.calls.some((call) => call.afterId === 'GTM-001000'));
    assert.equal(result.pagesLoaded, 6);
  });

  it('erro na paginação de override → não devolve universo base parcial', async () => {
    const overrides = makeRows(1500).map((row) => ({
      ...row,
      start_time: '2026-07-15T12:00:00.000Z',
      billing_period_override: '2026-08-15T12:00:00.000Z',
    }));
    const mock = createSupabaseMock(overrides, {
      column: 'billing_period_override',
      afterId: 'GTM-001000',
    });
    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, params),
      /falha billing_period_override GTM-001000/,
    );
  });

  it('teto de segurança atingido → CONSULTA INCOMPLETA', async () => {
    const mock = createSupabaseMock(makeRows(2001));
    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, {
        ...params,
        maxRows: 2000,
      }),
      (error: unknown) => error instanceof BillingDatasetIncompleteError,
    );
  });

  it('concorrência A — INSERT no meio nunca omite OS com complete=true', async () => {
    const rows = makeRows(2000);
    let mutated = false;
    const mock = createSupabaseMock(rows, undefined, (context, source) => {
      if (!mutated && context.periodColumn === 'start_time' && context.selectColumns.startsWith('*') && context.afterId === null) {
        mutated = true;
        source.push({ ...makeRows(1)[0], id: 'GTM-001500A' });
      }
    });

    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, params),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError ||
        error instanceof BillingDatasetIncompleteError,
    );
  });

  it('concorrência B — INSERT no final não contamina snapshot silenciosamente', async () => {
    const rows = makeRows(2000);
    let mutated = false;
    const mock = createSupabaseMock(rows, undefined, (context, source) => {
      if (!mutated && context.periodColumn === 'start_time' && context.selectColumns.startsWith('*') && context.afterId === null) {
        mutated = true;
        source.push({ ...makeRows(1)[0], id: 'GTM-999999' });
      }
    });

    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, params),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError ||
        error instanceof BillingDatasetIncompleteError,
    );
  });

  it('concorrência C — cancelamento de OS ainda não lida falha fechado', async () => {
    const rows = makeRows(2000);
    let mutated = false;
    const mock = createSupabaseMock(rows, undefined, (context, source) => {
      if (!mutated && context.periodColumn === 'start_time' && context.selectColumns.startsWith('*') && context.afterId === null) {
        mutated = true;
        const index = source.findIndex((row) => row.id === 'GTM-001500');
        source[index] = { ...source[index], status: 'Recusada' };
      }
    });

    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, params),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError ||
        error instanceof BillingDatasetIncompleteError,
    );
  });

  it('concorrência D — mudança de start_time que retira OS do período falha fechado', async () => {
    const rows = makeRows(2000);
    let mutated = false;
    const mock = createSupabaseMock(rows, undefined, (context, source) => {
      if (!mutated && context.periodColumn === 'start_time' && context.selectColumns.startsWith('*') && context.afterId === null) {
        mutated = true;
        const index = source.findIndex((row) => row.id === 'GTM-001500');
        source[index] = { ...source[index], start_time: '2026-07-15T12:00:00.000Z' };
      }
    });

    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, params),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError ||
        error instanceof BillingDatasetIncompleteError,
    );
  });

  it('concorrência D — mudança de billing_period_override falha fechado na segunda fonte', async () => {
    const rows = makeRows(2000).map((row) => ({
      ...row,
      start_time: '2026-07-15T12:00:00.000Z',
      billing_period_override: '2026-08-15T12:00:00.000Z',
    }));
    let mutated = false;
    const mock = createSupabaseMock(rows, undefined, (context, source) => {
      if (!mutated && context.periodColumn === 'billing_period_override' && context.selectColumns.startsWith('*') && context.afterId === null) {
        mutated = true;
        const index = source.findIndex((row) => row.id === 'GTM-001500');
        source[index] = { ...source[index], billing_period_override: '2026-07-15T12:00:00.000Z' };
      }
    });

    await assert.rejects(
      () => fetchBillingMissionUniverse<Row>(mock as any, params),
      (error: unknown) =>
        error instanceof SupabasePagingIntegrityError ||
        error instanceof BillingDatasetIncompleteError,
    );
  });

  it('concorrência E — update financeiro preserva identidade do snapshot', async () => {
    const rows = makeRows(1001);
    rows[499] = { ...rows[499], financial_value: 10 };
    let mutated = false;
    const mock = createSupabaseMock(rows, undefined, (context, source) => {
      if (!mutated && context.periodColumn === 'start_time' && context.selectColumns.startsWith('*') && context.afterId === null) {
        mutated = true;
        const index = source.findIndex((row) => row.id === 'GTM-000500');
        source[index] = { ...source[index], financial_value: 99 };
      }
    });

    const result = await fetchBillingMissionUniverse<Row>(mock as any, params);
    assert.equal(result.complete, true);
    assert.equal(result.rows.length, 1001);
    assert.equal(result.rows.find((row) => row.id === 'GTM-000500')?.financial_value, 10);
  });

  it('ClientBillingReport usa o universo paginado e bloqueia consolidação incompleta', () => {
    const source = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    const generateBlock = source.slice(
      source.indexOf('const handleGenerate = async'),
      source.indexOf('handleGenerateRef.current = handleGenerate'),
    );

    assert.match(generateBlock, /fetchBillingMissionUniverse/);
    assert.doesNotMatch(generateBlock, /\.from\('missions'\)/);
    assert.match(source, /billingDataset\.status === 'incomplete'/);
    assert.match(source, /data-testid="billing-dataset-incomplete"/);
    assert.match(source, /if \(!assertBillingDatasetComplete\(\)\) return;/);
    assert.match(source, /const canSubmitInvoice =\s*billingDatasetComplete/);
    assert.match(source, /const blocked = !billingDatasetComplete \|\| pendCount > 0/);
  });

  it('tabela/Excel/PDF usam rowsData; grandTotal permanece documentado sobre missions', () => {
    const source = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(source, /const dataRows = rowsData\.map/);
    assert.match(source, /generateMedicaoPdfBlob\('print-area'\)/);
    assert.match(source, /const grandTotal = useMemo\(\(\) => \{\s*return missions\.reduce/);
  });
});
