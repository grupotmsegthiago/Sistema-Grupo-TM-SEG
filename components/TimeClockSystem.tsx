
import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, History, ShieldCheck } from 'lucide-react';
import { formatDateBR, formatNowTimeBR, formatTimeBR } from '../lib/dateUtils';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import TimeClockModal from './TimeClockModal';
import {
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
  getNextTimeClockStage,
  getTimeClockEntryForStage,
} from '../lib/timeclock/stages';
import type { TimeClockEntry } from '../lib/timeclock/types';
import { fetchTodayTimeClockEntries } from '../lib/timeclock/registerPunch';

const TimeClockSystem: React.FC = () => {
  const [history, setHistory] = useState<TimeClockEntry[]>([]);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    if (!user?.id) return;
    setLoadError('');
    try {
      const entries = await fetchTodayTimeClockEntries(user.id);
      setHistory(entries);
    } catch (e: any) {
      setHistory([]);
      setLoadError(e?.message || 'Falha ao carregar registros de hoje');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeRefresh('time_clock', () => {
    void refresh();
  });

  const nextStage = getNextTimeClockStage(history);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 p-4">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg">
            <Fingerprint size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase">Jornada de Trabalho</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest flex items-center gap-2">
              <ShieldCheck size={14} className="text-green-600" /> Selfie + assinatura digital
            </p>
          </div>
        </div>
        <div className="bg-slate-900 px-6 py-2 rounded-xl text-center">
          <p className="text-[9px] text-gray-500 font-bold uppercase">Hora Local</p>
          <p className="text-xl font-black text-white font-mono">{formatNowTimeBR()}</p>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold">
          {loadError}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 bg-gray-900 text-white flex justify-between items-center">
          <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <History size={14} className="text-red-500" /> Ciclo de Hoje
          </h3>
          <span className="text-[10px] font-bold text-gray-400">{formatDateBR(new Date())}</span>
        </div>
        <div className="p-4 space-y-3 bg-gray-50/50">
          {TIME_CLOCK_STAGE_ORDER.map((type) => {
            const entry = getTimeClockEntryForStage(history, type);
            return (
              <div
                key={type}
                className={`p-4 rounded-2xl border ${entry ? 'bg-white border-green-200' : 'bg-gray-100/50 border-gray-200 opacity-60'}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black uppercase text-gray-400">{TIME_CLOCK_STAGE_LABELS[type]}</p>
                    <p className="text-sm font-black text-gray-900">{entry ? formatTimeBR(entry.timestamp, '--:--') : '--:--'}</p>
                  </div>
                  {entry?.photo_url && (
                    <img src={entry.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow-sm" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={nextStage === 'DONE'}
            className="w-full py-4 rounded-2xl bg-red-700 text-white font-black uppercase text-sm disabled:opacity-50"
          >
            {nextStage === 'DONE' ? 'Jornada concluída' : `Bater ponto — ${TIME_CLOCK_STAGE_LABELS[nextStage]}`}
          </button>
        </div>
      </div>

      <TimeClockModal open={open} onClose={() => setOpen(false)} onRegistered={() => void refresh()} />
    </div>
  );
};

export default TimeClockSystem;
