import React, { useEffect, useMemo, useState } from 'react';
import { History, User, Users, Loader2, Download, PencilLine } from 'lucide-react';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';
import {
  formatCivilDateBR,
  formatDateTimeBR,
  formatIsoDateBR,
  formatIsoDateFromTimestampBR,
  formatTimeBR,
} from '../../lib/dateUtils';
import {
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
  TIME_CLOCK_STAGE_SHORT,
  getTimeClockEntryForStage,
} from '../../lib/timeclock/stages';
import type { TimeClockEntry } from '../../lib/timeclock/types';
import {
  fetchCltEmployeesForHistory,
  fetchTimeClockHistory,
  groupHistoryByEmployee,
  type CltEmployeeOption,
} from '../../lib/timeclock/history';
import { canAdjustTimeclock } from '../../lib/rh/permissions';
import RhTimeclockAdjustModal, { type TimeclockAdjustPreset } from './RhTimeclockAdjustModal';

type Tab = 'geral' | 'funcionario';

function groupByDay(entries: TimeClockEntry[]): { date: string; items: TimeClockEntry[] }[] {
  const map = new Map<string, TimeClockEntry[]>();
  for (const e of entries) {
    // Dia civil em Brasília (não UTC — evita +1 dia após ~21h).
    const date = formatIsoDateFromTimestampBR(e.timestamp);
    const list = map.get(date) || [];
    list.push(e);
    map.set(date, list);
  }
  return Array.from(map.entries())
    .map(([date, items]) => ({ date, items: items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const RhTimeclockHistory: React.FC = () => {
  const [tab, setTab] = useState<Tab>('geral');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<TimeClockEntry[]>([]);
  const [employees, setEmployees] = useState<CltEmployeeOption[]>([]);
  const [selectedEmployeeUserId, setSelectedEmployeeUserId] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatIsoDateBR(d);
  });
  const [endDate, setEndDate] = useState(() => formatIsoDateBR());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustPreset, setAdjustPreset] = useState<TimeclockAdjustPreset | null>(null);
  const canAdjust = canAdjustTimeclock();

  const loadEmployees = async () => {
    try {
      const list = await fetchCltEmployeesForHistory();
      setEmployees(list);
      if (!selectedEmployeeUserId) {
        const firstWithUser = list.find((e) => e.user_id);
        if (firstWithUser?.user_id) setSelectedEmployeeUserId(firstWithUser.user_id);
      }
    } catch {
      setEmployees([]);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTimeClockHistory({
        startDate,
        endDate,
        userId: tab === 'funcionario' && selectedEmployeeUserId ? selectedEmployeeUserId : undefined,
      });
      setLogs(data);
    } catch (e: any) {
      setLogs([]);
      setError(e?.message || 'Falha ao carregar histórico de ponto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [startDate, endDate, tab, selectedEmployeeUserId]);

  useRealtimeRefresh('time_clock', () => {
    void loadLogs();
  });

  const byEmployee = useMemo(() => groupHistoryByEmployee(logs), [logs]);
  const byDay = useMemo(() => groupByDay(logs), [logs]);

  const exportCsv = () => {
    const headers = ['Data/Hora', 'Colaborador', 'Tipo', 'Latitude', 'Longitude'];
    const rows = logs.map((l) => [
      formatDateTimeBR(l.timestamp),
      l.user_name,
      TIME_CLOCK_STAGE_LABELS[l.type],
      l.latitude ?? '',
      l.longitude ?? '',
    ]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map((r) => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `historico_ponto_${startDate}_${endDate}.csv`;
    link.click();
  };

  const selectedEmployee = employees.find((e) => e.user_id === selectedEmployeeUserId);

  const openAdjust = (preset?: TimeclockAdjustPreset) => {
    setAdjustPreset(preset || null);
    setAdjustOpen(true);
  };

  const adjustButton = (preset?: TimeclockAdjustPreset) =>
    canAdjust ? (
      <button
        type="button"
        onClick={() => openAdjust(preset)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
      >
        <PencilLine size={12} /> Editar
      </button>
    ) : null;

  return (
    <div className="space-y-4 pb-10">
      <RhTimeclockAdjustModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onSaved={() => void loadLogs()}
        preset={adjustPreset}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('geral')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === 'geral' ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
        >
          <Users size={14} /> Histórico geral
        </button>
        <button
          type="button"
          onClick={() => setTab('funcionario')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === 'funcionario' ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
        >
          <User size={14} /> Por funcionário
        </button>
        <button type="button" onClick={exportCsv} className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
          <Download size={14} /> CSV
        </button>
        {canAdjust && (
          <button
            type="button"
            onClick={() => openAdjust(tab === 'funcionario' && selectedEmployeeUserId ? { userId: selectedEmployeeUserId, userName: selectedEmployee?.full_name, date: endDate } : undefined)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
          >
            <PencilLine size={14} /> Ajustar ponto
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400">Início</label>
          <input type="date" className="w-full mt-1 p-2.5 border rounded-xl text-xs font-bold" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400">Fim</label>
          <input type="date" className="w-full mt-1 p-2.5 border rounded-xl text-xs font-bold" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {tab === 'funcionario' && (
          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase text-gray-400">Funcionário CLT</label>
            <select
              className="w-full mt-1 p-2.5 border rounded-xl text-xs font-bold uppercase"
              value={selectedEmployeeUserId}
              onChange={(e) => setSelectedEmployeeUserId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {employees
                .filter((e) => e.user_id)
                .map((e) => (
                  <option key={e.id} value={e.user_id!}>
                    {e.full_name} {e.matricula ? `(${e.matricula})` : ''}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="animate-spin mx-auto text-red-600" />
        </div>
      ) : tab === 'geral' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 text-white rounded-xl p-4">
              <p className="text-[10px] uppercase font-bold text-gray-400">Total batidas</p>
              <p className="text-2xl font-black">{logs.length}</p>
            </div>
            <div className="bg-indigo-600 text-white rounded-xl p-4">
              <p className="text-[10px] uppercase font-bold text-indigo-200">Colaboradores</p>
              <p className="text-2xl font-black">{byEmployee.length}</p>
            </div>
            <div className="bg-green-600 text-white rounded-xl p-4 md:col-span-2">
              <p className="text-[10px] uppercase font-bold text-green-100">Período</p>
              <p className="text-sm font-black">{formatCivilDateBR(startDate)} — {formatCivilDateBR(endDate)}</p>
            </div>
          </div>

          {byEmployee.map((group) => (
            <div key={group.userId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                <p className="text-sm font-black uppercase text-gray-900">{group.userName}</p>
                <span className="text-[10px] font-bold text-gray-500">{group.entries.length} batidas</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-gray-400 border-b">
                      <th className="px-4 py-2 text-left">Data</th>
                      {TIME_CLOCK_STAGE_ORDER.map((s) => (
                        <th key={s} className="px-3 py-2 text-center">{TIME_CLOCK_STAGE_SHORT[s]}</th>
                      ))}
                      {canAdjust && <th className="px-3 py-2 text-center">Ajuste</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groupByDay(group.entries).map((day) => {
                      const rowEntries = day.items;
                      return (
                        <tr key={day.date} className="border-b border-gray-50">
                          <td className="px-4 py-2 font-mono">{formatCivilDateBR(day.date)}</td>
                          {TIME_CLOCK_STAGE_ORDER.map((stage) => {
                            const entry = getTimeClockEntryForStage(rowEntries, stage);
                            return (
                              <td key={stage} className="px-3 py-2 text-center font-mono text-gray-700">
                                {entry ? formatTimeBR(entry.timestamp, '--:--') : '--:--'}
                              </td>
                            );
                          })}
                          {canAdjust && (
                            <td className="px-3 py-2 text-center">
                              {adjustButton({ userId: group.userId, userName: group.userName, date: day.date })}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-900 text-white text-[10px] font-black uppercase flex items-center gap-2">
              <History size={14} /> Linha do tempo geral
            </div>
            <div className="divide-y max-h-[420px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-500">Nenhuma batida no período.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-black uppercase text-gray-900">{log.user_name}</p>
                      <p className="text-gray-500 font-mono">{formatDateTimeBR(log.timestamp)}</p>
                    </div>
                    <span className="px-2 py-1 rounded bg-gray-100 font-black uppercase text-[10px]">
                      {TIME_CLOCK_STAGE_LABELS[log.type]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!selectedEmployeeUserId ? (
            <p className="text-sm text-gray-500 font-bold p-8 text-center bg-white rounded-2xl border">
              Selecione um funcionário CLT com login vinculado.
            </p>
          ) : (
            <>
              <div className="bg-slate-900 text-white rounded-2xl p-4">
                <p className="text-[10px] uppercase font-bold text-slate-400">Funcionário</p>
                <p className="text-lg font-black uppercase">{selectedEmployee?.full_name || logs[0]?.user_name || '—'}</p>
                <p className="text-xs text-slate-300 mt-1">{logs.length} batidas no período</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 text-white text-[10px] uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Data</th>
                      {TIME_CLOCK_STAGE_ORDER.map((s) => (
                        <th key={s} className="px-3 py-3 text-center">{TIME_CLOCK_STAGE_LABELS[s]}</th>
                      ))}
                      {canAdjust && <th className="px-3 py-3 text-center">Ajuste</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {groupByDay(logs).map((day) => (
                      <tr key={day.date}>
                        <td className="px-4 py-3 font-mono font-bold">{formatCivilDateBR(day.date)}</td>
                        {TIME_CLOCK_STAGE_ORDER.map((stage) => {
                          const entry = getTimeClockEntryForStage(day.items, stage);
                          return (
                            <td key={stage} className="px-3 py-3 text-center font-mono">
                              {entry ? formatTimeBR(entry.timestamp, '--:--') : '--:--'}
                            </td>
                          );
                        })}
                        {canAdjust && selectedEmployeeUserId && (
                          <td className="px-3 py-3 text-center">
                            {adjustButton({
                              userId: selectedEmployeeUserId,
                              userName: selectedEmployee?.full_name,
                              date: day.date,
                            })}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl divide-y max-h-[360px] overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="px-4 py-3 flex justify-between items-center text-xs">
                    <span className="font-mono text-gray-600">{formatDateTimeBR(log.timestamp)}</span>
                    <span className="font-black uppercase">{TIME_CLOCK_STAGE_LABELS[log.type]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RhTimeclockHistory;
