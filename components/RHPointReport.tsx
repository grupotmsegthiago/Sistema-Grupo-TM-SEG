
import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { Search, Download, Calendar, User, FileText, Loader2, MapPin, Printer } from 'lucide-react';
import { formatDateBR, formatTimeBR } from '../lib/dateUtils';
import {
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
  getTimeClockEntryForStage,
} from '../lib/timeclock/stages';
import type { TimeClockEntry } from '../lib/timeclock/types';

type FolhaRow = {
  key: string;
  date: string;
  userId: string;
  userName: string;
  entries: TimeClockEntry[];
};

function groupLogsForFolha(logs: TimeClockEntry[]): FolhaRow[] {
  const map = new Map<string, FolhaRow>();
  for (const log of logs) {
    const date = log.timestamp.slice(0, 10);
    const key = `${log.user_id}_${date}`;
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(log);
    } else {
      map.set(key, {
        key,
        date,
        userId: log.user_id,
        userName: log.user_name,
        entries: [log],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

const RHPointReport: React.FC = () => {
    const [logs, setLogs] = useState<TimeClockEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState('ALL');
    const [viewMode, setViewMode] = useState<'folha' | 'detalhado'>('folha');

    useEffect(() => {
        fetchUsers();
        fetchLogs();
    }, [startDate, endDate, selectedUser]);

    useRealtimeRefresh('time_clock', () => fetchLogs());

    const folhaRows = useMemo(() => groupLogsForFolha(logs), [logs]);

    const fetchUsers = async () => {
        const { data } = await supabase.from('system_users').select('id, name').order('name');
        if (data) setUsers(data);
    };

    const fetchLogs = async () => {
        setLoading(true);
        let query = supabase.from('time_clock').select('*').gte('timestamp', `${startDate}T00:00:00`).lte('timestamp', `${endDate}T23:59:59`);
        if (selectedUser !== 'ALL') query = query.eq('user_id', selectedUser);
        
        const { data } = await query.order('timestamp', { ascending: false });
        if (data) setLogs(data as TimeClockEntry[]);
        setLoading(false);
    };

    const exportCSV = () => {
        const headers = [
          'Data',
          'Colaborador',
          'Entrada',
          'Saída almoço',
          'Retorno almoço',
          'Fim expediente',
          'Latitude',
          'Longitude',
        ];
        const rows = folhaRows.map((row) => {
          const getTime = (stage: typeof TIME_CLOCK_STAGE_ORDER[number]) => {
            const entry = getTimeClockEntryForStage(row.entries, stage);
            return entry ? formatTimeBR(entry.timestamp, '') : '';
          };
          const first = row.entries[0];
          return [
            formatDateBR(row.date),
            row.userName,
            getTime('IN'),
            getTime('BREAK_START'),
            getTime('BREAK_END'),
            getTime('OUT'),
            first?.latitude ?? '',
            first?.longitude ?? '',
          ];
        });
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `folha_ponto_${startDate}_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3"><FileText className="text-red-700"/> Folha de Ponto CLT</h2>
                    <p className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-widest">Relatório padrão — entrada, almoço, retorno e saída</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={exportCSV} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 border border-indigo-100 hover:bg-indigo-100 transition-all"><Download size={16}/> CSV</button>
                    <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg"><Printer size={16}/> PDF</button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-5 gap-4 no-print">
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</label>
                    <select className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold uppercase" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                        <option value="ALL">TODOS</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Início</label>
                    <input type="date" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fim</label>
                    <input type="date" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Visualização</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setViewMode('folha')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase border ${viewMode === 'folha' ? 'bg-red-700 text-white border-red-800' : 'bg-gray-50 border-gray-200'}`}>Folha padrão</button>
                      <button type="button" onClick={() => setViewMode('detalhado')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase border ${viewMode === 'detalhado' ? 'bg-red-700 text-white border-red-800' : 'bg-gray-50 border-gray-200'}`}>Detalhado</button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    {viewMode === 'folha' ? (
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                          <tr>
                            <th className="px-4 py-4">Data</th>
                            <th className="px-4 py-4">Colaborador</th>
                            {TIME_CLOCK_STAGE_ORDER.map((stage) => (
                              <th key={stage} className="px-4 py-4 text-center">{TIME_CLOCK_STAGE_LABELS[stage]}</th>
                            ))}
                            <th className="px-4 py-4 text-center">Assinatura</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {loading ? (
                            <tr><td colSpan={7} className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-red-600" /></td></tr>
                          ) : folhaRows.length === 0 ? (
                            <tr><td colSpan={7} className="p-12 text-center text-sm text-gray-500 font-bold">Nenhum registro no período</td></tr>
                          ) : folhaRows.map((row) => {
                            const lastSigned = [...row.entries].reverse().find((e) => e.signature_url);
                            return (
                              <tr key={row.key} className="hover:bg-gray-50 text-xs font-medium">
                                <td className="px-4 py-4 font-mono">{formatDateBR(row.date)}</td>
                                <td className="px-4 py-4 font-black uppercase text-gray-900">{row.userName}</td>
                                {TIME_CLOCK_STAGE_ORDER.map((stage) => {
                                  const entry = getTimeClockEntryForStage(row.entries, stage);
                                  return (
                                    <td key={stage} className="px-4 py-4 text-center font-mono text-gray-700">
                                      {entry ? formatTimeBR(entry.timestamp, '--:--') : '--:--'}
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-4 text-center">
                                  {lastSigned?.signature_url ? (
                                    <img src={lastSigned.signature_url} alt="Assinatura" className="h-8 mx-auto object-contain" />
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Data/Hora</th>
                                <th className="px-6 py-4">Usuário</th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                                <th className="px-6 py-4">GPS (Local)</th>
                                <th className="px-6 py-4 text-center">Selfie</th>
                                <th className="px-6 py-4 text-center">Assinatura</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr><td colSpan={6} className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-red-600" /></td></tr>
                            ) : logs.map(l => (
                                <tr key={l.id} className="hover:bg-gray-50 transition-all text-xs font-medium">
                                    <td className="px-6 py-4 font-mono text-gray-500">{new Date(l.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-black uppercase text-gray-900">{l.user_name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-1 rounded text-[10px] font-black uppercase border bg-gray-50 border-gray-200">
                                            {TIME_CLOCK_STAGE_LABELS[l.type]}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {l.latitude != null && l.longitude != null ? (
                                          <a href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer" className="text-blue-600 flex items-center gap-1 hover:underline font-bold uppercase text-[10px]"><MapPin size={12}/> Mapa</a>
                                        ) : '—'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {l.photo_url ? <button type="button" onClick={() => window.open(l.photo_url!)} className="p-1"><img src={l.photo_url} className="w-8 h-8 rounded object-cover border" alt="" /></button> : '—'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {l.signature_url ? <img src={l.signature_url} className="h-8 mx-auto object-contain" alt="" /> : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RHPointReport;
