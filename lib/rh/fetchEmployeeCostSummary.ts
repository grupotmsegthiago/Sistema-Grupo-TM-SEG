import { authFetch } from '../authFetch';
import type { RhEmployeeCostBreakdown } from './employeeCostSummary';

export interface RhEmployeeCostSummaryResponse {
  ok: boolean;
  referenceMonth: string;
  items: RhEmployeeCostBreakdown[];
  totals: ReturnType<typeof import('./employeeCostSummary').sumCostBreakdowns>;
  error?: string;
}

export async function fetchEmployeeCostSummary(referenceMonth?: string): Promise<RhEmployeeCostSummaryResponse> {
  const month = referenceMonth || new Date().toISOString().slice(0, 7);
  const qs = new URLSearchParams({ month });
  const res = await authFetch(`/api/rh/employees/cost-summary?${qs}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Falha HTTP ${res.status}`);
  }
  return json as RhEmployeeCostSummaryResponse;
}
