import type { SupabaseClient } from '@supabase/supabase-js';
import { formatIsoDateBR, getBrazilDayBounds } from '../dateUtils';
import {
  buildTeamPunchLookup,
  type TeamPunchLookup,
} from '../timeclock/teamPunchBoard';
import type { TimeClockEntry } from '../timeclock/types';

export type SerializedTeamPunchLookup = {
  byUserId: Record<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]>;
  byName: Record<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]>;
};

export function serializeTeamPunchLookup(lookup: TeamPunchLookup): SerializedTeamPunchLookup {
  const byUserId: SerializedTeamPunchLookup['byUserId'] = {};
  const byName: SerializedTeamPunchLookup['byName'] = {};

  for (const [uid, entries] of lookup.byUserId) {
    byUserId[uid] = entries;
  }
  for (const [name, entries] of lookup.byName) {
    byName[name] = entries;
  }

  return { byUserId, byName };
}

export function deserializeTeamPunchLookup(raw: SerializedTeamPunchLookup): TeamPunchLookup {
  const byUserId = new Map(Object.entries(raw.byUserId || {}));
  const byName = new Map(Object.entries(raw.byName || {}));
  return { byUserId, byName };
}

/**
 * Busca todas as batidas do dia via Supabase (service_role).
 * Agrupa por user_id — uma entrada por funcionário, estado derivado de todas as batidas do dia.
 */
export async function fetchTodayTeamPunchLookup(sb: SupabaseClient): Promise<TeamPunchLookup> {
  try {
    const today = formatIsoDateBR();
    const { start, end } = getBrazilDayBounds(today);

    const { data, error } = await sb
      .from('time_clock')
      .select('user_id, user_name, type, timestamp')
      .gte('timestamp', start)
      .lte('timestamp', end)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    return buildTeamPunchLookup((data || []) as Pick<TimeClockEntry, 'user_id' | 'user_name' | 'type' | 'timestamp'>[]);
  } catch (err) {
    console.warn('[teamPunchService] Falha ao carregar ponto do dia:', err);
    return { byUserId: new Map(), byName: new Map() };
  }
}
