import { useCallback, useEffect, useState } from 'react';
import { formatIsoDateBR } from './dateUtils';
import { fetchTimeClockEntriesFromApi } from './timeclock/fetchEntriesApi';
import { buildTeamPunchLookup, type TeamPunchLookup } from './timeclock/teamPunchBoard';
import type { TimeClockEntry } from './timeclock/types';
import { useRealtimeRefresh } from './RealtimeProvider';

/**
 * Batidas de ponto do dia para TODA a equipe (Diretoria/RH via API).
 * Alimenta o quadro "Equipe no sistema" mesmo quando o funcionário está offline.
 */
export function useTeamPunchToday(enabled = true) {
  const [punchLookup, setPunchLookup] = useState<TeamPunchLookup>(() => ({
    byUserId: new Map(),
    byName: new Map(),
  }));
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!enabled) {
      setPunchLookup({ byUserId: new Map(), byName: new Map() });
      return;
    }
    setLoading(true);
    try {
      const today = formatIsoDateBR();
      const entries = await fetchTimeClockEntriesFromApi({
        startDate: today,
        endDate: today,
      });
      setPunchLookup(buildTeamPunchLookup(entries));
    } catch (err) {
      console.warn('[useTeamPunchToday] Falha ao carregar ponto da equipe:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtimeRefresh('time_clock', () => {
    void fetchAll();
  });

  useEffect(() => {
    if (!enabled) return;
    const onRealtime = () => void fetchAll();
    window.addEventListener('supabase:time_clock:realtime', onRealtime);
    return () => window.removeEventListener('supabase:time_clock:realtime', onRealtime);
  }, [enabled, fetchAll]);

  return { punchLookup, loading, refresh: fetchAll };
}
