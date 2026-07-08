import { supabase } from './supabase';

type TablesBundle = { client: unknown[]; provider: unknown[]; loadedAt: number };

let cache: TablesBundle | null = null;
const TTL_MS = 5 * 60 * 1000;

async function fetchTablePages(table: 'client_price_tables' | 'provider_cost_tables'): Promise<unknown[]> {
  let all: unknown[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw error;
    if (data) all = all.concat(data);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Carrega todas as tabelas de preço com cache em memória (5 min). */
export async function loadAllPricingTables(
  force = false,
): Promise<{ client: unknown[]; provider: unknown[] }> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) {
    return { client: cache.client, provider: cache.provider };
  }
  const [client, provider] = await Promise.all([
    fetchTablePages('client_price_tables'),
    fetchTablePages('provider_cost_tables'),
  ]);
  cache = { client, provider, loadedAt: Date.now() };
  return { client, provider };
}

export function invalidatePricingTablesCache(): void {
  cache = null;
}
