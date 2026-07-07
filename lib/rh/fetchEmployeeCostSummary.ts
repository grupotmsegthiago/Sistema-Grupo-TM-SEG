import { authFetch } from '../authFetch';
import { supabase } from '../supabase';
import { sumCostBreakdowns } from './employeeCostSummary';
import type { RhEmployeeCostBreakdown } from './employeeCostSummary';

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
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok !== false && Array.isArray(json?.items)) {
      const items = json.items as RhEmployeeCostBreakdown[];
      return {
        ok: true,
        referenceMonth: json.referenceMonth || month,
        items,
        totals: json.totals || sumCostBreakdowns(items),
      };
    }
  } catch {
    /* fallback direto no Supabase */
  }

  const { loadEmployeeCostSummary } = await import('./loadEmployeeCostSummary');
  const result = await loadEmployeeCostSummary(supabase, month);
  return {
    ok: true,
    referenceMonth: result.referenceMonth,
    items: result.items,
    totals: result.totals,
  };
}
