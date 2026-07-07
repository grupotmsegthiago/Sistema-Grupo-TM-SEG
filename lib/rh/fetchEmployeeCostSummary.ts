import { authFetch } from '../authFetch';
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
  const res = await authFetch(`/api/rh/employees/cost-summary?${qs}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Falha HTTP ${res.status}`);
  }
  if (!Array.isArray(json?.items)) {
    throw new Error('Resposta inválida do servidor (custos não retornados). Confirme se o deploy está atualizado.');
  }
  const items = json.items as RhEmployeeCostBreakdown[];
  return {
    ok: true,
    referenceMonth: json.referenceMonth || month,
    items,
    totals: json.totals || sumCostBreakdowns(items),
  };
}
