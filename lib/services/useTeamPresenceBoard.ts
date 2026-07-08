import { useCallback, useEffect, useState } from 'react';
import { fetchTeamPresenceBoardFromApi } from './fetchTeamPresenceBoardApi';
import type { TeamPunchLookup } from '../timeclock/teamPunchBoard';
import type { TeamRosterMember } from '../timeclock/teamPunchBoard';
import { useRealtimeRefresh } from '../RealtimeProvider';

const EMPTY_LOOKUP: TeamPunchLookup = { byUserId: new Map(), byName: new Map() };

/**
 * Hook unificado: roster fixo + ponto do dia via API server-side (service_role).
 * Uma fonte da verdade — sem duplicar funcionários no front-end.
 */
export function useTeamPresenceBoard(enabled = true) {
  const [roster, setRoster] = useState<TeamRosterMember[]>([]);
  const [punchLookup, setPunchLookup] = useState<TeamPunchLookup>(EMPTY_LOOKUP);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setRoster([]);
      setPunchLookup(EMPTY_LOOKUP);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchTeamPresenceBoardFromApi();
      setRoster(data.roster);
      setPunchLookup(data.punchLookup);
    } catch (err) {
      console.warn('[useTeamPresenceBoard] Falha ao carregar quadro:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeRefresh('time_clock', () => {
    void refresh();
  });

  useRealtimeRefresh('system_users', () => {
    void refresh();
  });

  useEffect(() => {
    if (!enabled) return;
    const onRealtime = () => void refresh();
    window.addEventListener('supabase:time_clock:realtime', onRealtime);
    return () => window.removeEventListener('supabase:time_clock:realtime', onRealtime);
  }, [enabled, refresh]);

  return { roster, punchLookup, loading, refresh };
}
