import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

import {
  buildMissionSearchOrFilter,
  MISSION_SEARCH_MAX_RESULTS,
  MISSION_SEARCH_PAGE_SIZE,
  sanitizeMissionSearchTerm,
  searchMissionsByTerm,
} from '../lib/missionTableSearch.ts';
import { fetchAllPages } from '../lib/supabasePaging.ts';
import { isLinkedChildMission } from '../lib/missionLinkage.ts';
import { buildParentMissionsSummary } from '../lib/dashboardDiretoria/aggregations.ts';
import { computeCanonicalRevenueCost } from '../lib/missionFinancialsCanonical.ts';

describe('P1-01 — busca OS sem limit(300) fixo na MissionTable', () => {
  it('MissionTable usa searchMissionsByTerm (não .limit(300) na busca)', () => {
    const src = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(src, /searchMissionsByTerm/);
    assert.doesNotMatch(src, /q\.limit\(300\)/);
  });

  it('sanitizeMissionSearchTerm remove caracteres PostgREST perigosos', () => {
    assert.equal(sanitizeMissionSearchTerm('CEVA,(test)%'), 'CEVA test');
  });

  it('buildMissionSearchOrFilter cobre campos oficiais da busca', () => {
    const f = buildMissionSearchOrFilter('logitech');
    assert.match(f, /id\.ilike/);
    assert.match(f, /client\.ilike/);
    assert.match(f, /provider\.ilike/);
    assert.match(f, /driver_name\.ilike/);
    assert.match(f, /dhl_se_number\.ilike/);
  });

  it('paginação configurada (pageSize < maxResults)', () => {
    assert.ok(MISSION_SEARCH_PAGE_SIZE < MISSION_SEARCH_MAX_RESULTS);
  });

  it('aviso Torres quando conjunto truncado', () => {
    const src = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(src, /searchMatchesTruncated/);
    assert.match(src, /Conjunto de busca incompleto/);
  });

  it('busca: 499/500 não truncado; 501 truncado; ID exato independente do teto', async () => {
    const scope = { type: 'eq' as const, value: 'CLIENTE' };
    const makeRows = (total: number) =>
      Array.from({ length: total }, (_, i) => ({
        id: `GTM-${String(9000 - i).padStart(4, '0')}`,
        client: 'CLIENTE',
        created_at: '2026-01-01',
      }));

    const mockSupabase = (total: number) => ({
      from() {
        const filters: Array<{ col: string; val: string }> = [];
        let range: { from: number; to: number } | null = null;
        let selectCols = '*';
        const rows = makeRows(total);
        const chain: any = {
          select(cols: string) { selectCols = cols; return chain; },
          eq(col: string, val: string) { filters.push({ col, val }); return chain; },
          order() { return chain; },
          or() { return chain; },
          in() { return chain; },
          limit() { return chain; },
          range(from: number, to: number) { range = { from, to }; return chain; },
          then(resolve: (v: unknown) => void) {
            let data = rows;
            for (const f of filters) {
              if (f.col === 'id') data = data.filter((r) => r.id === f.val);
              if (f.col === 'client') data = data.filter((r) => r.client === f.val);
            }
            if (range) {
              const size = range.to - range.from + 1;
              data = data.slice(range.from, range.from + size);
            }
            const out = selectCols === 'id' ? data.map((r) => ({ id: r.id })) : data;
            resolve({ data: out, error: null });
          },
        };
        return chain;
      },
    });

    for (const [total, expectTruncated] of [[499, false], [500, false], [501, true]] as const) {
      const r = await searchMissionsByTerm(mockSupabase(total) as any, 'CLIENTE', scope, { pageSize: 100, maxResults: 500 });
      assert.equal(r.rows.length, Math.min(total, 500), `total=${total} rows`);
      assert.equal(r.truncated, expectTruncated, `total=${total} truncated`);
    }

    const oldId = 'GTM-OLD-9999';
    const sbExact = {
      from() {
        const filters: Array<{ col: string; val: string }> = [];
        let range: { from: number; to: number } | null = null;
        let selectCols = '*';
        const rows = [...makeRows(600), { id: oldId, client: 'CLIENTE', created_at: '2020-01-01' }];
        const chain: any = {
          select(cols: string) { selectCols = cols; return chain; },
          eq(col: string, val: string) { filters.push({ col, val }); return chain; },
          order() { return chain; },
          or() { return chain; },
          in() { return chain; },
          limit() { return chain; },
          range(from: number, to: number) { range = { from, to }; return chain; },
          then(resolve: (v: unknown) => void) {
            let data = rows as Array<{ id: string; client: string; created_at: string }>;
            for (const f of filters) {
              if (f.col === 'id') data = data.filter((r) => r.id === f.val);
              if (f.col === 'client') data = data.filter((r) => r.client === f.val);
            }
            if (range) {
              const size = range.to - range.from + 1;
              data = data.slice(range.from, range.from + size);
            }
            const out = selectCols === 'id' ? data.map((r) => ({ id: r.id })) : data;
            resolve({ data: out, error: null });
          },
        };
        return chain;
      },
    };
    const exact = await searchMissionsByTerm(sbExact as any, oldId, scope, { pageSize: 100, maxResults: 500 });
    assert.ok(exact.rows.some((m) => m.id === oldId), 'ID exato fora do top 500');
    assert.equal(exact.exactIdAttempted, true);
  });
});

describe('P1-02 — realtime missions UPDATE dispara refreshMissions', () => {
  it('RealtimeProvider inclui UPDATE em refreshMissions', () => {
    const src = fs.readFileSync('lib/RealtimeProvider.tsx', 'utf8');
    assert.match(src, /eventType === 'INSERT' \|\| eventType === 'UPDATE' \|\| eventType === 'DELETE'/);
  });

  it('ExecutiveDashboard escuta supabase:missions via useRealtimeRefresh', () => {
    const src = fs.readFileSync('components/ExecutiveDashboard.tsx', 'utf8');
    assert.match(src, /useRealtimeRefresh\('missions'/);
  });

  it('FinancialDRE já escuta missions', () => {
    const src = fs.readFileSync('components/FinancialDRE.tsx', 'utf8');
    assert.match(src, /useRealtimeRefresh\(\[.*'missions'/);
  });
});

describe('P1-03 — export_relatorio/financialUtils é adaptador SSOT', () => {
  it('reexporta lib/financialUtils oficial', () => {
    const src = fs.readFileSync('export_relatorio/financialUtils.ts', 'utf8');
    assert.match(src, /export \* from '\.\.\/lib\/financialUtils'/);
    assert.doesNotMatch(src, /function calculateMissionFinancials/);
  });

  it('ClientBillingReport do export usa lib oficial', () => {
    const src = fs.readFileSync('export_relatorio/ClientBillingReport.tsx', 'utf8');
    assert.match(src, /from '\.\.\/lib\/financialUtils'/);
  });
});

describe('P1-04 — quotes Diretoria sem limit(500) fixo', () => {
  it('useDashboardDiretoriaData pagina quotes via fetchAllPages', () => {
    const src = fs.readFileSync('lib/dashboardDiretoria/useDashboardDiretoriaData.ts', 'utf8');
    assert.match(src, /fetchAllPages\([\s\S]*quotes/);
    assert.doesNotMatch(src, /\.from\('quotes'\)[\s\S]*\.limit\(500\)/);
  });

  it('fetchAllPages suporta teto maxRows', async () => {
    let calls = 0;
    const { rows, truncated } = await fetchAllPages(async (from, size) => {
      calls += 1;
      const chunk = Array.from({ length: size }, (_, i) => from + i);
      return { data: chunk, error: null };
    }, 10, 25);
    assert.equal(rows.length, 25);
    assert.equal(truncated, true);
    assert.ok(calls >= 3);
  });

  it('fetchAllPages: 9.999 → completo; 10.000 sem página extra → completo; >10.000 → truncado', async () => {
    for (const total of [9999, 10000, 10001]) {
      const { rows, truncated } = await fetchAllPages(async (from, size) => {
        const chunk = [];
        for (let i = from; i < Math.min(from + size, total); i++) chunk.push({ id: i });
        return { data: chunk, error: null };
      }, 500, 10_000);
      const ids = rows.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, `duplicata em total=${total}`);
      if (total <= 10000) {
        assert.equal(rows.length, total, `total=${total}`);
        assert.equal(truncated, false, `total=${total}`);
      } else {
        assert.equal(rows.length, 10_000);
        assert.equal(truncated, true);
      }
    }
  });

  it('fetchAllPages: erro em página intermediária propaga (não retorna parcial como completo)', async () => {
    await assert.rejects(
      () => fetchAllPages(async (from, size) => {
        if (from >= 500) return { data: null, error: new Error('falha página 2') };
        return { data: Array.from({ length: size }, (_, i) => from + i), error: null };
      }, 500, 10_000),
      /falha página 2/,
    );
  });

  it('useDashboardDiretoriaData expõe quotesTruncated até a UI', () => {
    const hook = fs.readFileSync('lib/dashboardDiretoria/useDashboardDiretoriaData.ts', 'utf8');
    const types = fs.readFileSync('lib/dashboardDiretoria/types.ts', 'utf8');
    const ui = fs.readFileSync('components/dashboard/DashboardDiretoria.tsx', 'utf8');
    assert.match(hook, /quotesTruncated/);
    assert.match(hook, /setQuotesTruncated\(!!quotesRes\.truncated\)/);
    assert.match(types, /quotesTruncated:\s*boolean/);
    assert.match(ui, /data\.quotesTruncated/);
    assert.match(ui, /Conjunto parcial de cotações/);
  });
});

describe('P1-05 — is_same_os / parent_mission_id (cenários A–D)', () => {
  const base = { revenue_value: 1000, cost_value: 400, toll_value: 50, toll_value_provider: 30 };

  it('A — OS independente: custo fornecedor normal', () => {
    const r = computeCanonicalRevenueCost({ ...base, is_same_os: false });
    assert.equal(r.costBase, 400);
  });

  it('B — OS mãe: custo fornecedor normal', () => {
    const r = computeCanonicalRevenueCost({ ...base, is_same_os: false, parent_mission_id: null });
    assert.equal(r.costBase, 400);
  });

  it('C — filha is_same_os=true: custo fornecedor zerado', () => {
    const r = computeCanonicalRevenueCost({ ...base, is_same_os: true, parent_mission_id: 'GTM-100' });
    assert.equal(r.costBase, 0);
  });

  it('D — parent_mission_id sem is_same_os: NÃO zera custo (obrigatório)', () => {
    const r = computeCanonicalRevenueCost({ ...base, is_same_os: false, parent_mission_id: 'GTM-100' });
    assert.equal(r.costBase, 400);
    assert.notEqual(r.costBase, 0);
  });

  it('isLinkedChildMission exige is_same_os=true', () => {
    assert.equal(isLinkedChildMission({ parent_mission_id: 'GTM-1', is_same_os: true }), true);
    assert.equal(isLinkedChildMission({ parent_mission_id: 'GTM-1', is_same_os: false }), false);
    assert.equal(isLinkedChildMission({ parent_mission_id: 'GTM-1' }), false);
  });

  it('buildParentMissionsSummary ignora parent sem is_same_os', () => {
    const missions = [
      { id: 'GTM-1', status: 'Em Viagem', parent_mission_id: null, is_same_os: false },
      { id: 'GTM-2', status: 'Concluída', parent_mission_id: 'GTM-1', is_same_os: false },
      { id: 'GTM-3', status: 'Em Viagem', parent_mission_id: 'GTM-1', is_same_os: true },
    ];
    const s = buildParentMissionsSummary(missions);
    assert.equal(s.total, 1);
  });
});

describe('P1 — paridade canônica (Torres: mesma OS, mesma verdade)', () => {
  it('computeCanonicalRevenueCost é SSOT para receita/custo base', () => {
    const m = { revenue_value: 800, cost_value: 200, is_same_os: true, billing_approved: true };
    const a = computeCanonicalRevenueCost(m);
    const b = computeCanonicalRevenueCost({ ...m });
    assert.deepEqual(a, b);
  });
});
