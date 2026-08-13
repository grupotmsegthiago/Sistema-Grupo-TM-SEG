/**
 * Busca server-side de OS na Central — substitui .limit(300) fixo.
 * Não carrega o banco inteiro no navegador: pagina por termo + teto configurável.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MissionSearchClientScope =
  | { type: 'empty' }
  | { type: 'eq'; value: string }
  | { type: 'in'; values: string[] };

export const MISSION_SEARCH_PAGE_SIZE = 100;
export const MISSION_SEARCH_MAX_RESULTS = 500;

export function sanitizeMissionSearchTerm(term: string): string {
  return term.trim().replace(/[%,().,]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildMissionSearchOrFilter(term: string): string {
  const like = `%${sanitizeMissionSearchTerm(term)}%`;
  return `id.ilike.${like},client.ilike.${like},provider.ilike.${like},driver_name.ilike.${like},dhl_se_number.ilike.${like}`;
}

function applyClientScope<T extends { eq: Function; in: Function }>(q: T, scope: MissionSearchClientScope): T {
  if (scope.type === 'eq') return q.eq('client', scope.value!) as T;
  if (scope.type === 'in') return q.in('client', scope.values!) as T;
  return q;
}

/** Tenta ID exato (GTM-xxx) antes da busca textual ampla. */
export async function searchMissionsByTerm(
  supabase: SupabaseClient,
  rawTerm: string,
  scope: MissionSearchClientScope,
  options?: { pageSize?: number; maxResults?: number },
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean; exactIdAttempted: boolean }> {
  if (scope.type === 'empty') return { rows: [], truncated: false, exactIdAttempted: false };

  const pageSize = options?.pageSize ?? MISSION_SEARCH_PAGE_SIZE;
  const maxResults = options?.maxResults ?? MISSION_SEARCH_MAX_RESULTS;
  const term = sanitizeMissionSearchTerm(rawTerm);
  if (term.length < 2) return { rows: [], truncated: false, exactIdAttempted: false };

  const byId = new Map<string, Record<string, unknown>>();
  let exactIdAttempted = false;

  const normalizedId = term.toUpperCase().startsWith('GTM-') ? term.toUpperCase() : `GTM-${term.replace(/^gtm-?/i, '')}`;
  if (/^GTM-[A-Z0-9-]+$/i.test(normalizedId) && normalizedId.length >= 6) {
    exactIdAttempted = true;
    let exactQ = supabase.from('missions').select('*').eq('id', normalizedId).limit(1);
    exactQ = applyClientScope(exactQ, scope);
    const { data: exactRow } = await exactQ;
    if (exactRow?.[0]) byId.set(String(exactRow[0].id), exactRow[0] as Record<string, unknown>);
  }

  let from = 0;
  let exhausted = false;
  while (byId.size < maxResults) {
    const take = Math.min(pageSize, maxResults - byId.size);
    let q = supabase
      .from('missions')
      .select('*')
      .order('created_at', { ascending: false })
      .or(buildMissionSearchOrFilter(rawTerm))
      .range(from, from + take - 1);
    q = applyClientScope(q, scope);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const id = String((row as { id?: string }).id || '');
      if (id) byId.set(id, row as Record<string, unknown>);
    }
    if (data.length < take) {
      exhausted = true;
      break;
    }
    from += data.length;
  }

  const rows = Array.from(byId.values());
  let truncated = false;
  if (!exhausted && rows.length >= maxResults) {
    let sentinelQ = supabase
      .from('missions')
      .select('id')
      .order('created_at', { ascending: false })
      .or(buildMissionSearchOrFilter(rawTerm))
      .range(maxResults, maxResults);
    sentinelQ = applyClientScope(sentinelQ, scope);
    const { data: sentinel, error: sentinelError } = await sentinelQ;
    if (sentinelError) throw sentinelError;
    truncated = !!(sentinel && sentinel.length > 0);
  }

  return { rows, truncated, exactIdAttempted };
}
