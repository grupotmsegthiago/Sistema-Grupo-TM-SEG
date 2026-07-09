import { useCallback, useEffect, useState } from 'react';
import { enrichUserWithCltData } from '../timeclock/cltEmployee';
import { requiresTimeclockUser } from '../timeclock/eligibility';
import {
  TIME_CLOCK_STAGE_LABELS,
  getNextTimeClockStage,
} from '../timeclock/stages';
import type { TimeClockEntry, TimeClockUserContext } from '../timeclock/types';
import { fetchTodayTimeClockEntries } from '../timeclock/registerPunch';
import { useRealtimeRefresh } from '../RealtimeProvider';

export interface TimeClockButtonState {
  ready: boolean;
  user: TimeClockUserContext | null;
  history: TimeClockEntry[];
  label: string;
  refresh: () => Promise<void>;
}

/** Estado compartilhado do botão de ponto (header e demais superfícies). */
export function useTimeClockButton(): TimeClockButtonState {
  const [user, setUser] = useState<TimeClockUserContext | null>(null);
  const [history, setHistory] = useState<TimeClockEntry[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
      if (!raw?.id) {
        setReady(false);
        setUser(null);
        return;
      }

      const enriched = await enrichUserWithCltData(raw);
      localStorage.setItem('userData', JSON.stringify(enriched));

      if (!requiresTimeclockUser(enriched)) {
        setReady(false);
        setUser(null);
        setHistory([]);
        return;
      }

      setUser(enriched);
      const entries = await fetchTodayTimeClockEntries(enriched.id, {
        shiftType: enriched.shiftType,
      });
      setHistory(entries);
      setReady(true);
    } catch (e) {
      console.error('[useTimeClockButton] Falha ao carregar ponto:', e);
      setReady(false);
      setUser(null);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeRefresh('time_clock', () => {
    void refresh();
  });

  const nextStage = getNextTimeClockStage(history);
  const label =
    nextStage === 'DONE'
      ? 'Jornada concluída'
      : TIME_CLOCK_STAGE_LABELS[nextStage];

  return { ready, user, history, label, refresh };
}
