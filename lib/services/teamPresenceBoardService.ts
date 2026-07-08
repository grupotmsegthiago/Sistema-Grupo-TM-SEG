import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTeamRoster } from './teamRosterService';
import {
  fetchTodayTeamPunchLookup,
  serializeTeamPunchLookup,
  type SerializedTeamPunchLookup,
} from './teamPunchService';
import type { TeamRosterMember } from '../timeclock/teamPunchBoard';

export type TeamPresenceBoardPayload = {
  roster: TeamRosterMember[];
  punchLookup: SerializedTeamPunchLookup;
  fetchedAt: string;
};

/**
 * Payload unificado para o quadro "Equipe no sistema".
 * Roster deduplicado + batidas do dia agrupadas por funcionário (read-only).
 */
export async function loadTeamPresenceBoardData(
  sb: SupabaseClient,
): Promise<TeamPresenceBoardPayload> {
  const [roster, punchLookup] = await Promise.all([
    fetchTeamRoster(sb),
    fetchTodayTeamPunchLookup(sb),
  ]);

  return {
    roster,
    punchLookup: serializeTeamPunchLookup(punchLookup),
    fetchedAt: new Date().toISOString(),
  };
}
