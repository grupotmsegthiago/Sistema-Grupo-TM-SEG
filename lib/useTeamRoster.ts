import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useRealtimeRefresh } from './RealtimeProvider';
import { fetchTeamRoster } from './services/teamRosterService';
import type { TeamRosterMember } from './timeclock/teamPunchBoard';

export type { TeamRosterMember };

/**
 * Carrega a lista de usuários INTERNOS ativos para o quadro fixo.
 * Delega ao teamRosterService (fonte única).
 */
export function useTeamRoster(enabled = true): TeamRosterMember[] {
  const [roster, setRoster] = useState<TeamRosterMember[]>([]);

  const fetchRoster = useCallback(async () => {
    if (!enabled) {
      setRoster([]);
      return;
    }
    try {
      const merged = await fetchTeamRoster(supabase);
      setRoster(merged);
    } catch {
      // mantém o último roster conhecido em caso de falha de rede
    }
  }, [enabled]);

  useEffect(() => {
    void fetchRoster();
  }, [fetchRoster]);

  useRealtimeRefresh('system_users', () => {
    void fetchRoster();
  });

  return roster;
}
