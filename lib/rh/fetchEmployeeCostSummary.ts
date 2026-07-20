import { authFetch } from '../authFetch';
import { supabase } from '../supabase';
import { sumCostBreakdowns } from './employeeCostSummary';
import type { RhEmployeeCostBreakdown } from './employeeCostSummary';
// Import estático: evita chunk dinâmico (loadEmployeeCostSummary-XXXX.js) que 404
// após redeploy quando a aba/cache ainda aponta para o hash antigo.
import { loadEmployeeCostSummary } from './loadEmployeeCostSummary';

export interface RhEmployeeCostSummaryResponse {
  ok: boolean;
  referenceMonth: string;
  items: RhEmployeeCostBreakdown[];
  totals: ReturnType<typeof sumCostBreakdowns>;
  error?: string;
}

export async function fetchEmployeeCostSummary(referenceMonth?: string): Promise<RhEmployeeCostSummaryResponse> {
  const month = referenceMonth || new Date().toISOString().slice(0, 7);
  const qs = new URLSearchParams({ month });

  try {
    const res = await authFetch(`/api/rh/employees/cost-summary?${qs}`);
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.ok && json?.ok !== false && Array.isArray(json?.items)) {
      const items = json.items as RhEmployeeCostBreakdown[];
      return {
        ok: true,
        referenceMonth: String(json.referenceMonth || month),
        items,
        totals: (json.totals as ReturnType<typeof sumCostBreakdowns>) || sumCostBreakdowns(items),
      };
    }
    // API respondeu erro — tenta fallback local antes de falhar
    console.warn('[rh-costs] API falhou, fallback Supabase:', res.status, (json as any)?.error);
  } catch (e) {
    console.warn('[rh-costs] API indisponível, fallback Supabase:', e);
  }

  try {
    const result = await loadEmployeeCostSummary(supabase, month);
    return {
      ok: true,
      referenceMonth: result.referenceMonth,
      items: result.items,
      totals: result.totals,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Falha ao carregar custos';
    return {
      ok: false,
      referenceMonth: month,
      items: [],
      totals: sumCostBreakdowns([]),
      error: message,
    };
  }
}
