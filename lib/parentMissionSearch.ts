/**
 * Busca paginada de candidatas a OS mãe — evita limit(50)/limit(10) fixos.
 * Preserva regra financeira: vínculo exige is_same_os + parent_mission_id na gravação.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ParentMissionRow = {
  id: string;
  client: string;
  provider: string;
  origin: string;
  destination: string;
  status: string;
  start_time?: string;
  parent_mission_id?: string | null;
};

export const PARENT_MISSION_PAGE_SIZE = 50;
export const PARENT_MISSION_MAX_RESULTS = 200;

const SELECT_FIELDS = 'id, client, provider, origin, destination, start_time, status, parent_mission_id';

export function normalizeGtmId(term: string): string {
  const t = term.trim().toUpperCase();
  if (!t) return '';
  return t.startsWith('GTM-') ? t : `GTM-${t.replace(/^GTM-?/i, '')}`;
}

/** Busca uma OS por ID (qualquer cliente) para vínculo mãe/filha na auditoria. */
export async function fetchMissionById(
  supabase: SupabaseClient,
  missionId: string,
): Promise<(ParentMissionRow & { is_same_os?: boolean }) | null> {
  const id = normalizeGtmId(missionId);
  if (!id) return null;
  const { data, error } = await supabase
    .from('missions')
    .select(`${SELECT_FIELDS}, is_same_os`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ParentMissionRow & { is_same_os?: boolean }) || null;
}

export type ParentMissionSearchOptions = {
  client: string;
  excludeMissionId?: string;
  provider?: string;
  /** Somente OS que podem ser mãe (sem parent_mission_id). MissionForm usa true. */
  onlyRootMothers?: boolean;
  searchTerm?: string;
  pageSize?: number;
  maxResults?: number;
};

export async function fetchParentMissionCandidates(
  supabase: SupabaseClient,
  opts: ParentMissionSearchOptions,
): Promise<{ rows: ParentMissionRow[]; truncated: boolean }> {
  const pageSize = opts.pageSize ?? PARENT_MISSION_PAGE_SIZE;
  const maxResults = opts.maxResults ?? PARENT_MISSION_MAX_RESULTS;
  const client = String(opts.client || '').trim();
  if (!client) return { rows: [], truncated: false };

  const byId = new Map<string, ParentMissionRow>();

  const applyFilters = (q: any) => {
    let query = q.eq('client', client);
    if (opts.excludeMissionId) query = query.neq('id', opts.excludeMissionId);
    if (opts.provider) query = query.eq('provider', opts.provider);
    if (opts.onlyRootMothers) query = query.is('parent_mission_id', null);
    return query;
  };

  const term = String(opts.searchTerm || '').trim();
  if (term.length >= 2) {
    const exactId = normalizeGtmId(term);
    if (/^GTM-[A-Z0-9-]+$/i.test(exactId) && exactId.length >= 6) {
      let exactQ = applyFilters(supabase.from('missions').select(SELECT_FIELDS).eq('id', exactId).limit(1));
      const { data: exactRow } = await exactQ;
      if (exactRow?.[0]) byId.set(exactRow[0].id, exactRow[0] as ParentMissionRow);
    }

    const searchKey = term.replace(/^gtm-?/i, '').replace(/[^a-z0-9-]/gi, '');
    if (searchKey.length >= 2) {
      let from = 0;
      let exhausted = false;
      while (byId.size < maxResults) {
        const take = Math.min(pageSize, maxResults - byId.size);
        let q = applyFilters(
          supabase.from('missions').select(SELECT_FIELDS).ilike('id', `%${searchKey}%`).order('created_at', { ascending: false }),
        ).range(from, from + take - 1);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) byId.set(row.id, row as ParentMissionRow);
        if (data.length < take) {
          exhausted = true;
          break;
        }
        from += data.length;
      }
      const rows = Array.from(byId.values());
      let truncated = false;
      if (!exhausted && rows.length >= maxResults) {
        let sentinelQ = applyFilters(
          supabase.from('missions').select('id').ilike('id', `%${searchKey}%`).order('created_at', { ascending: false }),
        ).range(maxResults, maxResults);
        const { data: sentinel, error: sentinelError } = await sentinelQ;
        if (sentinelError) throw sentinelError;
        truncated = !!(sentinel && sentinel.length > 0);
      }
      return { rows, truncated };
    }
  }

  let from = 0;
  let exhausted = false;
  while (byId.size < maxResults) {
    const take = Math.min(pageSize, maxResults - byId.size);
    let q = applyFilters(
      supabase.from('missions').select(SELECT_FIELDS).order('created_at', { ascending: false }),
    ).range(from, from + take - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) byId.set(row.id, row as ParentMissionRow);
    if (data.length < take) {
      exhausted = true;
      break;
    }
    from += data.length;
  }

  const rows = Array.from(byId.values());
  let truncated = false;
  if (!exhausted && rows.length >= maxResults) {
    let sentinelQ = applyFilters(
      supabase.from('missions').select('id').order('created_at', { ascending: false }),
    ).range(maxResults, maxResults);
    const { data: sentinel, error: sentinelError } = await sentinelQ;
    if (sentinelError) throw sentinelError;
    truncated = !!(sentinel && sentinel.length > 0);
  }

  return { rows, truncated };
}
