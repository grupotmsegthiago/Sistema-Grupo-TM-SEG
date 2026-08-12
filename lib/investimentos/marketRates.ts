/**
 * Taxas macro públicas (BrasilAPI) para o consultor de investimentos.
 * Fonte: https://brasilapi.com.br/api/taxas/v1
 */
export type MacroRates = {
  selicPct: number | null;
  cdiPct: number | null;
  ipcaPct: number | null;
  fetchedAt: string;
  source: 'brasilapi' | 'fallback';
};

const FALLBACK: MacroRates = {
  selicPct: null,
  cdiPct: null,
  ipcaPct: null,
  fetchedAt: new Date().toISOString(),
  source: 'fallback',
};

let cache: { at: number; data: MacroRates } | null = null;
const TTL_MS = 15 * 60 * 1000;

export async function fetchMacroRates(): Promise<MacroRates> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6_000);
    const res = await fetch('https://brasilapi.com.br/api/taxas/v1', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`taxas HTTP ${res.status}`);
    const rows = (await res.json()) as Array<{ nome?: string; valor?: number }>;
    const find = (name: string) => {
      const hit = rows.find((r) => String(r.nome || '').toLowerCase() === name);
      const v = Number(hit?.valor);
      return Number.isFinite(v) ? v : null;
    };
    const data: MacroRates = {
      selicPct: find('selic'),
      cdiPct: find('cdi'),
      ipcaPct: find('ipca'),
      fetchedAt: new Date().toISOString(),
      source: 'brasilapi',
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return FALLBACK;
  }
}

export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}
