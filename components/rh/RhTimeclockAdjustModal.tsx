import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Loader2, Clock, User } from 'lucide-react';
import { formatIsoDateBR, formatTimeBR } from '../../lib/dateUtils';
import {
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
  getTimeClockEntryForStage,
} from '../../lib/timeclock/stages';
import type { TimeClockStage } from '../../lib/timeclock/types';
import { fetchTimeClockEntriesFromApi } from '../../lib/timeclock/fetchEntriesApi';
import { adjustTimeClockEntriesApi } from '../../lib/timeclock/adjustEntriesApi';
import { fetchCltEmployeesForHistory } from '../../lib/timeclock/history';
import { useNotification } from '../../lib/NotificationContext';

export type TimeclockAdjustPreset = {
  userId: string;
  userName?: string;
  date: string;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  preset?: TimeclockAdjustPreset | null;
}

const emptyTimes = (): Record<TimeClockStage, string> => ({
  IN: '',
  BREAK_START: '',
  BREAK_END: '',
  OUT: '',
});

const RhTimeclockAdjustModal: React.FC<Props> = ({ isOpen, onClose, onSaved, preset }) => {
  const { showNotification } = useNotification();
  const [employees, setEmployees] = useState<{ id: string; user_id: string; full_name: string }[]>([]);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(formatIsoDateBR());
  const [times, setTimes] = useState(emptyTimes);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const list = await fetchCltEmployeesForHistory();
        setEmployees(
          list
            .filter((e) => e.user_id)
            .map((e) => ({ id: e.id, user_id: e.user_id!, full_name: e.full_name })),
        );
      } catch {
        setEmployees([]);
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (preset?.userId) setUserId(preset.userId);
    if (preset?.date) setDate(preset.date);
    if (!preset) {
      setUserId('');
      setDate(formatIsoDateBR());
      setTimes(emptyTimes());
      setNote('');
    }
  }, [isOpen, preset?.userId, preset?.date]);

  useEffect(() => {
    if (!isOpen || !userId || !date) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    void (async () => {
      try {
        const entries = await fetchTimeClockEntriesFromApi({ startDate: date, endDate: date, userId });
        if (cancelled) return;
        const next = emptyTimes();
        for (const stage of TIME_CLOCK_STAGE_ORDER) {
          const entry = getTimeClockEntryForStage(entries, stage);
          next[stage] = entry ? formatTimeBR(entry.timestamp, '') : '';
        }
        setTimes(next);
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Falha ao carregar batidas do dia');
          setTimes(emptyTimes());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, date]);

  const selectedName = useMemo(() => {
    if (preset?.userName && preset.userId === userId) return preset.userName;
    return employees.find((e) => e.user_id === userId)?.full_name || '';
  }, [employees, userId, preset]);

  const handleSave = async () => {
    if (!userId) {
      showNotification('Ajuste de ponto', 'Selecione o colaborador.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await adjustTimeClockEntriesApi({
        userId,
        date,
        times,
        note: note.trim() || undefined,
      });
      showNotification('Ajuste de ponto', 'Horários atualizados com sucesso.', 'success');
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      showNotification('Erro', e instanceof Error ? e.message : 'Falha ao salvar ajuste', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Clock size={18} />
            <div>
              <p className="text-sm font-black uppercase">Ajustar ponto</p>
              <p className="text-[10px] text-slate-300 font-bold">Entrada, almoço, retorno e saída</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400">Colaborador</label>
            <div className="relative mt-1">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-xs font-bold uppercase"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {employees.map((e) => (
                  <option key={e.user_id} value={e.user_id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            {selectedName && <p className="text-[10px] text-gray-500 mt-1 font-bold">{selectedName}</p>}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-400">Data</label>
            <input
              type="date"
              className="w-full mt-1 p-2.5 border rounded-xl text-xs font-bold"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {loadError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
              {loadError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {TIME_CLOCK_STAGE_ORDER.map((stage) => (
              <div key={stage}>
                <label className="text-[10px] font-black uppercase text-gray-400">{TIME_CLOCK_STAGE_LABELS[stage]}</label>
                <input
                  type="time"
                  className="w-full mt-1 p-2.5 border rounded-xl text-xs font-mono font-bold"
                  value={times[stage]}
                  onChange={(e) => setTimes((prev) => ({ ...prev, [stage]: e.target.value }))}
                  disabled={loading || !userId}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-400">Observação (opcional)</label>
            <input
              type="text"
              className="w-full mt-1 p-2.5 border rounded-xl text-xs font-bold"
              placeholder="Ex.: esqueceu de bater saída do almoço"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
            Deixe o horário em branco para remover a batida daquele tipo no dia. Apenas Diretoria e RH podem ajustar.
          </p>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border text-xs font-black uppercase text-gray-600 hover:bg-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading || !userId}
            className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar ajuste
          </button>
        </div>
      </div>
    </div>
  );
};

export default RhTimeclockAdjustModal;
