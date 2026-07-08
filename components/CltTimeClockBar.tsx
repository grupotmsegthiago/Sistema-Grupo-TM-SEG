import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Fingerprint } from 'lucide-react';
import TimeClockModal from './TimeClockModal';
import { formatNowTimeBR } from '../lib/dateUtils';
import { enrichUserWithCltData } from '../lib/timeclock/cltEmployee';
import { requiresTimeclockUser } from '../lib/timeclock/eligibility';
import {
  TIME_CLOCK_STAGE_LABELS,
  getNextTimeClockStage,
} from '../lib/timeclock/stages';
import type { TimeClockEntry, TimeClockUserContext } from '../lib/timeclock/types';
import { fetchTodayTimeClockEntries } from '../lib/timeclock/registerPunch';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';

const CltTimeClockBar: React.FC = () => {
  const [user, setUser] = useState<TimeClockUserContext | null>(null);
  const [history, setHistory] = useState<TimeClockEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
      if (!raw?.id) {
        setReady(false);
        return;
      }

      const enriched = await enrichUserWithCltData(raw);
      localStorage.setItem('userData', JSON.stringify(enriched));

      if (!requiresTimeclockUser(enriched)) {
        setReady(false);
        setUser(null);
        return;
      }

      setUser(enriched);
      const entries = await fetchTodayTimeClockEntries(enriched.id);
      setHistory(entries);
      setReady(true);
    } catch (e) {
      console.error('[CltTimeClockBar] Falha ao carregar ponto CLT:', e);
      setReady(false);
      setUser(null);
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar ponto');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeRefresh('time_clock', () => {
    void refresh();
  });

  if (!ready || !user) {
    if (loadError) {
      console.warn('[CltTimeClockBar]', loadError);
    }
    return null;
  }

  const nextStage = getNextTimeClockStage(history);
  const label =
    nextStage === 'DONE'
      ? 'Jornada concluída'
      : TIME_CLOCK_STAGE_LABELS[nextStage];

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-[90] px-3 pb-3 pt-2 pointer-events-none lg:pl-24">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 active:scale-[0.99] transition-transform"
            data-testid="button-bater-ponto-missao"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-red-700 shrink-0">
                <Fingerprint size={18} />
              </div>
              <div className="text-left min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">Bater ponto</p>
                <p className="text-sm font-black uppercase truncate">{label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[10px] font-bold uppercase text-slate-300">
              <Clock size={14} />
              {formatNowTimeBR()}
            </div>
          </button>
        </div>
      </div>

      <TimeClockModal
        open={open}
        onClose={() => setOpen(false)}
        onRegistered={() => void refresh()}
      />
    </>
  );
};

export default CltTimeClockBar;
