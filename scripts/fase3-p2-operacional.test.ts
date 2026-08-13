import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

import {
  fetchParentMissionCandidates,
  PARENT_MISSION_MAX_RESULTS,
  type ParentMissionRow,
} from '../lib/parentMissionSearch.ts';
import { fetchAllPages } from '../lib/supabasePaging.ts';

const CLIENT = 'CLIENTE TESTE';

function makeMotherRows(count: number, start = 9000): ParentMissionRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `GTM-${String(start - i).padStart(4, '0')}`,
    client: CLIENT,
    provider: 'FORN',
    origin: 'A',
    destination: 'B',
    status: 'Concluída',
    parent_mission_id: null,
  }));
}

/** Mock Supabase mínimo para fetchParentMissionCandidates (ordem created_at desc = ordem do array). */
function createParentMissionMock(allRows: ParentMissionRow[], opts?: { excludeId?: string }) {
  return {
    from() {
      const filters: Array<{ col: string; val: string; op: string }> = [];
      let range: { from: number; to: number } | null = null;
      let selectCols = '*';
      const chain: any = {
        select(c: string) {
          selectCols = c;
          return chain;
        },
        eq(col: string, val: string) {
          filters.push({ col, val, op: 'eq' });
          return chain;
        },
        neq(col: string, val: string) {
          filters.push({ col, val, op: 'neq' });
          return chain;
        },
        is(col: string, val: null) {
          filters.push({ col, val: String(val), op: 'is' });
          return chain;
        },
        ilike(col: string, val: string) {
          filters.push({ col, val, op: 'ilike' });
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        range(from: number, to: number) {
          range = { from, to };
          return chain;
        },
        then(resolve: (v: unknown) => void) {
          let data = [...allRows];
          if (opts?.excludeId) data = data.filter((r) => r.id !== opts.excludeId);
          for (const f of filters) {
            if (f.op === 'eq' && f.col === 'client') data = data.filter((r) => r.client === f.val);
            if (f.op === 'eq' && f.col === 'id') data = data.filter((r) => r.id === f.val);
            if (f.op === 'neq' && f.col === 'id') data = data.filter((r) => r.id !== f.val);
            if (f.op === 'eq' && f.col === 'provider') data = data.filter((r) => r.provider === f.val);
            if (f.op === 'is' && f.col === 'parent_mission_id') data = data.filter((r) => r.parent_mission_id == null);
            if (f.op === 'ilike' && f.col === 'id') {
              const key = f.val.replace(/%/g, '').toLowerCase();
              data = data.filter((r) => r.id.toLowerCase().includes(key));
            }
          }
          if (range) data = data.slice(range.from, range.to + 1);
          const out = selectCols === 'id' ? data.map((r) => ({ id: r.id })) : data;
          resolve({ data: out, error: null });
        },
      };
      return chain;
    },
  };
}

describe('P2-01 — AI Chat mantido inativo com status explícito', () => {
  it('App.tsx usa FeatureInactivePanel em ai-support (não return null)', () => {
    const src = fs.readFileSync('App.tsx', 'utf8');
    assert.match(src, /case 'ai-support'/);
    assert.match(src, /FeatureInactivePanel/);
    assert.doesNotMatch(src, /case 'ai-support':\s*return null/);
  });
});

describe('P2-02 — BillingControlCenter órfão confirmado', () => {
  it('componente marcado como órfão e sem rota em App.tsx', () => {
    const billing = fs.readFileSync('components/BillingControlCenter.tsx', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    assert.match(billing, /ÓRFÃO CONFIRMADO/);
    assert.doesNotMatch(app, /BillingControlCenter/);
    assert.doesNotMatch(app, /fin-billing-control/);
  });
});

describe('P2-03 — Gestão Investimento mapeada (sem ativação de cálculos)', () => {
  it('módulo ativo com gate Diretoria e testes Fase 2 existentes', () => {
    const app = fs.readFileSync('App.tsx', 'utf8');
    const ui = fs.readFileSync('components/investimentos/GestaoInvestimento.tsx', 'utf8');
    assert.match(app, /case 'gestao-investimento'/);
    assert.match(ui, /canRecommend|PROFILE_INCOMPLETE_MESSAGE|automation/);
    assert.ok(fs.existsSync('scripts/gestao-investimento-fase2.test.ts'));
  });
});

describe('P2-04 — busca OS mãe paginada (sem limit 50/10)', () => {
  it('MissionForm e UpdateMissionModal usam fetchParentMissionCandidates', () => {
    const form = fs.readFileSync('components/MissionForm.tsx', 'utf8');
    const modal = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(form, /fetchParentMissionCandidates/);
    assert.match(modal, /fetchParentMissionCandidates/);
    assert.doesNotMatch(form, /\.limit\(50\)/);
    assert.doesNotMatch(modal, /\.limit\(50\)/);
    assert.doesNotMatch(modal, /\.limit\(10\)/);
  });

  it('fetchParentMissionCandidates: ID exato e paginação com sentinela', async () => {
    const client = 'CLIENTE';
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: `GTM-${String(9000 - i).padStart(4, '0')}`,
      client,
      provider: 'P',
      origin: 'A',
      destination: 'B',
      status: 'Concluída',
      parent_mission_id: null,
    }));

    const mock = {
      from() {
        const filters: Array<{ col: string; val: string; op: string }> = [];
        let range: { from: number; to: number } | null = null;
        let selectCols = '*';
        const chain: any = {
          select(c: string) { selectCols = c; return chain; },
          eq(col: string, val: string) { filters.push({ col, val, op: 'eq' }); return chain; },
          neq(col: string, val: string) { filters.push({ col, val, op: 'neq' }); return chain; },
          is(col: string, val: null) { filters.push({ col, val: String(val), op: 'is' }); return chain; },
          ilike(col: string, val: string) { filters.push({ col, val, op: 'ilike' }); return chain; },
          order() { return chain; },
          limit() { return chain; },
          range(from: number, to: number) { range = { from, to }; return chain; },
          then(resolve: (v: unknown) => void) {
            let data = [...rows];
            for (const f of filters) {
              if (f.op === 'eq' && f.col === 'client') data = data.filter((r) => r.client === f.val);
              if (f.op === 'eq' && f.col === 'id') data = data.filter((r) => r.id === f.val);
              if (f.op === 'is' && f.col === 'parent_mission_id') data = data.filter((r) => r.parent_mission_id == null);
              if (f.op === 'ilike' && f.col === 'id') {
                const key = f.val.replace(/%/g, '').toLowerCase();
                data = data.filter((r) => r.id.toLowerCase().includes(key));
              }
            }
            if (range) data = data.slice(range.from, range.to + 1);
            const out = selectCols === 'id' ? data.map((r) => ({ id: r.id })) : data;
            resolve({ data: out, error: null });
          },
        };
        return chain;
      },
    };

    const base = await fetchParentMissionCandidates(mock as any, { client, onlyRootMothers: true, maxResults: 200 });
    assert.equal(base.rows.length, 60);
    assert.equal(base.truncated, false);

    const many = Array.from({ length: PARENT_MISSION_MAX_RESULTS + 5 }, (_, i) => ({
      id: `GTM-${i}`,
      client,
      provider: 'P',
      origin: 'A',
      destination: 'B',
      status: 'Concluída',
      parent_mission_id: null,
    }));
    const mockMany = {
      from() {
        let range: { from: number; to: number } | null = null;
        let selectCols = '*';
        const chain: any = {
          select(c: string) { selectCols = c; return chain; },
          eq() { return chain; },
          is() { return chain; },
          order() { return chain; },
          range(from: number, to: number) { range = { from, to }; return chain; },
          then(resolve: (v: unknown) => void) {
            const slice = range ? many.slice(range.from, range.to + 1) : many;
            const out = selectCols === 'id' ? slice.map((r) => ({ id: r.id })) : slice;
            resolve({ data: out, error: null });
          },
        };
        return chain;
      },
    };
    const capped = await fetchParentMissionCandidates(mockMany as any, { client, onlyRootMothers: true });
    assert.equal(capped.rows.length, PARENT_MISSION_MAX_RESULTS);
    assert.equal(capped.truncated, true);
  });

  it('cenários determinísticos Torres: posição, teto, GTM exato, inexistente, especiais', async () => {
    const rows55 = makeMotherRows(55);
    const mock55 = createParentMissionMock(rows55);
    const first50 = await fetchParentMissionCandidates(mock55 as any, { client: CLIENT, onlyRootMothers: true });
    assert.equal(first50.rows.length, 55);
    assert.equal(first50.truncated, false);
    assert.ok(first50.rows.some((r) => r.id === 'GTM-8950'));

    const motherAfter50 = rows55[54];
    const bySearch = await fetchParentMissionCandidates(mock55 as any, {
      client: CLIENT,
      onlyRootMothers: true,
      searchTerm: motherAfter50.id.replace('GTM-', ''),
    });
    assert.ok(bySearch.rows.some((r) => r.id === motherAfter50.id));
    assert.equal(bySearch.truncated, false);

    const rows120 = makeMotherRows(120, 9200);
    const mock120 = createParentMissionMock(rows120);
    const beyond100 = rows120[110];
    const past100 = await fetchParentMissionCandidates(mock120 as any, {
      client: CLIENT,
      onlyRootMothers: true,
      searchTerm: beyond100.id,
    });
    assert.ok(past100.rows.some((r) => r.id === beyond100.id));

    const exact200 = makeMotherRows(200, 9200);
    const mock200 = createParentMissionMock(exact200);
    const atCeiling = await fetchParentMissionCandidates(mock200 as any, { client: CLIENT, onlyRootMothers: true });
    assert.equal(atCeiling.rows.length, 200);
    assert.equal(atCeiling.truncated, false);

    const rows205 = makeMotherRows(205, 9300);
    const mock205 = createParentMissionMock(rows205);
    const aboveCeiling = await fetchParentMissionCandidates(mock205 as any, { client: CLIENT, onlyRootMothers: true });
    assert.equal(aboveCeiling.rows.length, 200);
    assert.equal(aboveCeiling.truncated, true);

    const target = rows205[199];
    const exactGtm = await fetchParentMissionCandidates(mock205 as any, {
      client: CLIENT,
      onlyRootMothers: true,
      searchTerm: target.id,
    });
    assert.ok(exactGtm.rows.some((r) => r.id === target.id));

    const ghost = await fetchParentMissionCandidates(mock205 as any, {
      client: CLIENT,
      onlyRootMothers: true,
      searchTerm: 'GTM-999999',
    });
    assert.equal(ghost.rows.length, 0);
    assert.equal(ghost.truncated, false);

    const special = await fetchParentMissionCandidates(mock205 as any, {
      client: CLIENT,
      onlyRootMothers: true,
      searchTerm: 'GTM-@#$%9299',
    });
    assert.ok(special.rows.some((r) => r.id === 'GTM-9299'));

    const pages: string[] = [];
    const mockPaged = {
      from() {
        let range: { from: number; to: number } | null = null;
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          is() { return chain; },
          order() { return chain; },
          range(from: number, to: number) { range = { from, to }; return chain; },
          then(resolve: (v: unknown) => void) {
            const slice = range ? rows205.slice(range.from, range.to + 1) : rows205;
            pages.push(`${range?.from}-${range?.to}`);
            resolve({ data: slice, error: null });
          },
        };
        return chain;
      },
    };
    const paged = await fetchParentMissionCandidates(mockPaged as any, { client: CLIENT, onlyRootMothers: true });
    const ids = paged.rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 200);
    assert.ok(pages.length >= 4);
  });

  it('fluxo criação/edição: is_same_os exige checkbox; parent_mission_id sozinho não zera custo', () => {
    const form = fs.readFileSync('components/MissionForm.tsx', 'utf8');
    const modal = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(form, /formData\.isSameOs \? \{ is_same_os: true, parent_mission_id/);
    assert.match(form, /cost_value: formData\.isSameOs \? 0/);
    assert.match(modal, /is_same_os: editData\.isSameOs/);
    assert.match(modal, /parent_mission_id: editData\.isSameOs \? \(editData\.parentMissionId/);
    assert.match(form, /formData\.isSameOs \? \{ is_same_os: true, parent_mission_id: formData\.parentMissionId/);
    assert.doesNotMatch(form, /parent_mission_id: formData\.parentMissionId \|\| null,\s*current_location/);
  });
});

describe('P2-05 — banner pedágio sem limit(200) fixo', () => {
  it('PendingTollConfirmationBanner pagina via fetchAllPages', () => {
    const src = fs.readFileSync('components/PendingTollConfirmationBanner.tsx', 'utf8');
    assert.match(src, /fetchAllPages/);
    assert.match(src, /listTruncated/);
    assert.doesNotMatch(src, /\.limit\(200\)/);
  });

  it('fetchAllPages: mais de 200 candidatos com sentinela', async () => {
    const { rows, truncated } = await fetchAllPages(async (from, size) => {
      const total = 250;
      const chunk = [];
      for (let i = from; i < Math.min(from + size, total); i++) chunk.push({ id: i });
      return { data: chunk, error: null };
    }, 100, 2000);
    assert.equal(rows.length, 250);
    assert.equal(truncated, false);
  });

  it('cenários determinísticos: 0, 1, 199, 200, 201, 2000, 2001 — sentinela só acima do teto', async () => {
    const run = async (total: number) => {
      const { rows, truncated } = await fetchAllPages(async (from, size) => {
        const chunk = [];
        for (let i = from; i < Math.min(from + size, total); i++) chunk.push({ id: `OS-${i}` });
        return { data: chunk, error: null };
      }, 100, 2000);
      return { count: rows.length, truncated, ids: rows.map((r) => r.id) };
    };

    const z = await run(0);
    assert.equal(z.count, 0);
    assert.equal(z.truncated, false);

    const one = await run(1);
    assert.equal(one.count, 1);
    assert.equal(one.truncated, false);

    const n199 = await run(199);
    assert.equal(n199.count, 199);
    assert.equal(n199.truncated, false);

    const n200 = await run(200);
    assert.equal(n200.count, 200);
    assert.equal(n200.truncated, false);

    const n201 = await run(201);
    assert.equal(n201.count, 201);
    assert.equal(n201.truncated, false);

    const n2000 = await run(2000);
    assert.equal(n2000.count, 2000);
    assert.equal(n2000.truncated, false);
    assert.equal(new Set(n2000.ids).size, 2000);

    const n2001 = await run(2001);
    assert.equal(n2001.count, 2000);
    assert.equal(n2001.truncated, true);
  });

  it('fluxo banner: carrega candidatos, filtra confirmação, preserva listTruncated', () => {
    const src = fs.readFileSync('components/PendingTollConfirmationBanner.tsx', 'utf8');
    assert.match(src, /setListTruncated\(truncated\)/);
    assert.match(src, /TOLL_CONFIRMATION/);
    assert.match(src, /Conjunto parcial/);
    assert.doesNotMatch(src, /missions\.length === 0.*confirmado/i);
  });
});
