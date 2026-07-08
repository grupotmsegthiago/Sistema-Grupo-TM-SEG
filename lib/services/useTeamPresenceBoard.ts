import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { fetchTeamPresenceBoardFromApi } from './fetchTeamPresenceBoardApi';
import { fetchTeamRoster } from './teamRosterService';
import { fetchTodayTeamPunchLookup } from './teamPunchService';
import type { TeamPunchLookup } from '../timeclock/teamPunchBoard';
import type { TeamRosterMember } from '../timeclock/teamPunchBoard';
import { useRealtimeRefresh } from '../RealtimeProvider';

const EMPTY_LOOKUP: TeamPunchLookup = { byUserId: new Map(), byName: new Map() };

async function loadBoardClientSide(): Promise<{
  roster: TeamRosterMember[];
  punchLookup: TeamPunchLookup;
}> {
  const [roster, punchLookup] = await Promise.all([
    fetchTeamRoster(supabase),
    fetchTodayTeamPunchLookup(supabase),
  ]);
  return { roster, punchLookup };
}

/**
 * Hook unificado: roster fixo + ponto do dia.
 * Tenta API server-side; se falhar (ex.: cold start Vercel), usa Supabase client
 * com RLS aberto em time_clock (política Allow all).
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
      try {
        const data = await fetchTeamPresenceBoardFromApi();
        setRoster(data.roster);
        setPunchLookup(data.punchLookup);
      } catch (apiErr) {
        console.warn('[useTeamPresenceBoard] API indisponível, usando Supabase client:', apiErr);
        const local = await loadBoardClientSide();
        setRoster(local.roster);
        setPunchLookup(local.punchLookup);
      }
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
