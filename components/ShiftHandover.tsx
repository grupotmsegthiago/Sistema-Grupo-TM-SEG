import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, MessageSquare, MessageSquarePlus, X, Save, ClipboardList } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { MissionStatus } from '../types';

// ==========================================================================
// PASSAGEM DE PLANTÃO
// Espelho SOMENTE LEITURA do controle diário: mostra as OS EM ABERTO de HOJE
// e AMANHÃ com exatamente os mesmos campos da planilha. Único campo editável:
// a OBSERVAÇÃO de passagem por OS (persistida em shift_handover_notes), para a
// troca de informações entre operadores de plantão.
// ==========================================================================

const OPEN_STATUSES: string[] = [
  MissionStatus.SOLICITED,
  MissionStatus.DOCUMENTATION,
  MissionStatus.SCHEDULED,
  MissionStatus.ORIGIN,
  MissionStatus.IN_TRANSIT,
  MissionStatus.PENDING,
];

const TZ = 'America/Sao_Paulo';

const spDateStr = (iso?: string | null): string => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); } catch { return ''; }
};
const fmtDate = (iso?: string | null): string => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ }); } catch { return ''; }
};
const fmtTime = (iso?: string | null): string => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); } catch { return ''; }
};
const fmtDateTimeFull = (iso?: string | null): string => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

interface HandoverRow {
  id: string;
  dataInicial: string;
  horaAgendada: string;
  horaOrigem: string;
  cliente: string;
  rota: string;
  fornecedor: string;
  viatura: string;
  veiculoEscoltado: string;
  dataFinal: string;
  horaFinal: string;
  kmInicial: string;
  kmFinal: string;
  kmRodado: string;
  status: string;
  operador: string;
  escoltistas: string;
  dateKey: string;
}

interface HandoverNote {
  mission_id: string;
  note: string;
  updated_by: string;
  updated_at: string;
}

const statusColor = (status: string): string => {
  switch (status) {
    case MissionStatus.IN_TRANSIT: return 'bg-blue-100 text-blue-800';
    case MissionStatus.ORIGIN: return 'bg-amber-100 text-amber-800';
    case MissionStatus.SCHEDULED: return 'bg-emerald-100 text-emerald-800';
    case MissionStatus.SOLICITED: return 'bg-purple-100 text-purple-800';
    case MissionStatus.DOCUMENTATION: return 'bg-orange-100 text-orange-800';
    case MissionStatus.PENDING: return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const ShiftHandover = () => {
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [notes, setNotes] = useState<Record<string, HandoverNote>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'hoje' | 'amanha'>('hoje');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [editing, setEditing] = useState<HandoverRow | null>(null);
  const [editText, setEditText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const todayKey = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: TZ }), []);
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: TZ }), []);

  const loadNotes = useCallback(async () => {
    try {
      const res = await authFetch('/api/shift-handover-notes');
      if (!res.ok) return;
      const data: HandoverNote[] = await res.json();
      const map: Record<string, HandoverNote> = {};
      (data || []).forEach(n => { map[n.mission_id] = n; });
      setNotes(map);
    } catch {
      /* observações são opcionais — não bloqueia a tela */
    }
  }, []);

  const loadMissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: missionsData, error: mErr } = await supabase
        .from('missions')
        .select('*')
        .in('status', OPEN_STATUSES)
        .order('start_time', { ascending: true });

      if (mErr) throw mErr;
      const missions = missionsData || [];

      // Mantém só HOJE e AMANHÃ (start_time, com fallback para created_at).
      const inWindow = missions.filter((m: any) => {
        const key = spDateStr(m.start_time) || spDateStr(m.created_at);
        return key === todayKey || key === tomorrowKey;
      });

      const vehicleIds = [...new Set(inWindow.map((m: any) => m.vehicle_id).filter(Boolean))];
      const clientVehicleIds = [...new Set(inWindow.map((m: any) => m.client_vehicle).filter(Boolean))];

      const fetchInChunks = async (table: string, columns: string, ids: any[], chunkSize = 500) => {
        if (ids.length === 0) return [] as any[];
        const chunks: any[][] = [];
        for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
        const results = await Promise.all(chunks.map(c => supabase.from(table).select(columns).in('id', c)));
        return results.flatMap(r => r.data || []);
      };

      const [vehiclesRows, clientVehiclesRows, clientsRes, providersRes] = await Promise.all([
        fetchInChunks('vehicles', 'id, plate', vehicleIds),
        fetchInChunks('client_vehicles', 'id, plate', clientVehicleIds),
        supabase.from('clients').select('name, trading_name'),
        supabase.from('providers').select('name, trading_name'),
      ]);

      const vehicleMap: Record<string, any> = {};
      vehiclesRows.forEach((v: any) => { vehicleMap[v.id] = v; });
      const clientVehicleMap: Record<string, any> = {};
      clientVehiclesRows.forEach((v: any) => { clientVehicleMap[v.id.toString()] = v; });
      const clientNameMap: Record<string, string> = {};
      (clientsRes.data || []).forEach((c: any) => {
        if (c.trading_name && c.trading_name.trim() !== '') clientNameMap[(c.name || '').trim().toUpperCase()] = c.trading_name.trim();
      });
      const providerNameMap: Record<string, string> = {};
      (providersRes.data || []).forEach((p: any) => {
        if (p.trading_name && p.trading_name.trim() !== '') providerNameMap[(p.name || '').trim().toUpperCase()] = p.trading_name.trim();
      });

      const mapped: HandoverRow[] = inWindow.map((m: any) => {
        const clientKey = (m.client || '').trim().toUpperCase();
        const providerKey = (m.provider || '').trim().toUpperCase();
        const veh = m.vehicle_id ? vehicleMap[m.vehicle_id] : null;
        const cargoId = m.client_vehicle?.toString();
        const cargo = cargoId ? clientVehicleMap[cargoId] : null;
        const origin = (m.origin || '').trim();
        const destination = (m.destination || '').trim();
        const startKm = m.start_km;
        const endKm = m.end_km;
        const kmRodado = (typeof startKm === 'number' && typeof endKm === 'number' && endKm >= startKm)
          ? String(endKm - startKm) : '';
        const agents = [m.agent1, m.agent2].filter((a: any) => a && a !== '---');
        return {
          id: m.id,
          dataInicial: fmtDate(m.start_time) || fmtDate(m.created_at),
          horaAgendada: fmtTime(m.start_time),
          horaOrigem: fmtTime(m.start_time),
          cliente: clientNameMap[clientKey] || m.client || '',
          rota: origin && destination ? `${origin} X ${destination}` : (origin || destination || ''),
          fornecedor: providerNameMap[providerKey] || m.provider || '',
          viatura: veh ? veh.plate : (m.vehicle_id || ''),
          veiculoEscoltado: cargo ? cargo.plate : (cargoId ? `ID: ${cargoId}` : ''),
          dataFinal: fmtDate(m.end_time),
          horaFinal: fmtTime(m.end_time),
          kmInicial: (typeof startKm === 'number') ? String(startKm) : '',
          kmFinal: (typeof endKm === 'number') ? String(endKm) : '',
          kmRodado,
          status: m.status || '',
          operador: m.updated_by || m.created_by || '',
          escoltistas: agents.join(' X '),
          dateKey: spDateStr(m.start_time) || spDateStr(m.created_at),
        };
      });

      mapped.sort((a, b) => (a.horaAgendada || '').localeCompare(b.horaAgendada || ''));
      setRows(mapped);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar as missões.');
    } finally {
      setIsLoading(false);
    }
  }, [todayKey, tomorrowKey]);

  useEffect(() => {
    loadMissions();
    loadNotes();
  }, [loadMissions, loadNotes]);

  const visibleRows = useMemo(() => {
    const key = activeTab === 'hoje' ? todayKey : tomorrowKey;
    return rows.filter(r => r.dateKey === key);
  }, [rows, activeTab, todayKey, tomorrowKey]);

  const countHoje = useMemo(() => rows.filter(r => r.dateKey === todayKey).length, [rows, todayKey]);
  const countAmanha = useMemo(() => rows.filter(r => r.dateKey === tomorrowKey).length, [rows, tomorrowKey]);

  const openObs = (row: HandoverRow) => {
    setEditing(row);
    setEditText(notes[row.id]?.note || '');
  };

  const saveObs = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      const res = await authFetch('/api/shift-handover-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: editing.id, note: editText }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Falha ao salvar a observação.');
      }
      const saved: HandoverNote = await res.json();
      setNotes(prev => ({ ...prev, [editing.id]: saved }));
      setEditing(null);
    } catch (e: any) {
      alert(e?.message || 'Não foi possível salvar a observação.');
    } finally {
      setIsSaving(false);
    }
  };

  const headers = [
    'OS', 'DATA INICIAL', 'HORA AGENDADA', 'HORA ORIGEM', 'CLIENTE', 'ROTA', 'FORNECEDOR',
    'VIATURA', 'VEÍCULO ESCOLTADO', 'DATA FINAL', 'HORA FINAL', 'KM INICIAL', 'KM FINAL',
    'KM RODADO', 'STATUS', 'OPERADOR', 'ESCOLTISTAS', 'OBSERVAÇÃO',
  ];

  return (
    <div className="p-4 md:p-6 max-w-full" data-testid="page-shift-handover">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <ClipboardList className="text-red-700" size={26} />
            Passagem de Plantão
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Espelho somente leitura do controle diário — missões em aberto de hoje e amanhã.
            {lastUpdated && (
              <span className="ml-2 text-gray-400">Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { loadMissions(); loadNotes(); }}
          disabled={isLoading}
          className="self-start md:self-auto inline-flex items-center gap-2 bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-800 transition-all active:scale-95 disabled:opacity-60"
          data-testid="button-refresh-handover"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('hoje')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'hoje' ? 'bg-red-700 text-white shadow' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'}`}
          data-testid="tab-hoje"
        >
          Hoje <span className="ml-1 opacity-80">({countHoje})</span>
        </button>
        <button
          onClick={() => setActiveTab('amanha')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'amanha' ? 'bg-red-700 text-white shadow' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'}`}
          data-testid="tab-amanha"
        >
          Amanhã <span className="ml-1 opacity-80">({countAmanha})</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4" data-testid="text-handover-error">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-800 text-white">
              {headers.map(h => (
                <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={headers.length} className="px-3 py-10 text-center text-gray-400" data-testid="text-handover-loading">Carregando...</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-3 py-10 text-center text-gray-400" data-testid="text-handover-empty">Nenhuma missão em aberto para {activeTab === 'hoje' ? 'hoje' : 'amanhã'}.</td></tr>
            ) : (
              visibleRows.map((r) => {
                const hasNote = !!(notes[r.id]?.note && notes[r.id].note.trim());
                return (
                  <tr key={r.id} className="hover:bg-gray-50" data-testid={`row-handover-${r.id}`}>
                    <td className="px-3 py-2 font-bold text-gray-800 whitespace-nowrap">{r.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.dataInicial}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.horaAgendada}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.horaOrigem}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{r.cliente}</td>
                    <td className="px-3 py-2 min-w-[220px]">{r.rota}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.fornecedor}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.viatura}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.veiculoEscoltado}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.dataFinal}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.horaFinal}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{r.kmInicial}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{r.kmFinal}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{r.kmRodado}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.operador}</td>
                    <td className="px-3 py-2 min-w-[160px]">{r.escoltistas}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => openObs(r)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${hasNote ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        data-testid={`button-obs-${r.id}`}
                        title={hasNote ? notes[r.id].note : 'Adicionar observação de passagem'}
                      >
                        {hasNote ? <MessageSquare size={13} /> : <MessageSquarePlus size={13} />}
                        {hasNote ? 'Ver / Editar' : 'Observação'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !isSaving && setEditing(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()} data-testid="modal-handover-obs">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-black text-gray-800 flex items-center gap-2">
                <MessageSquare size={18} className="text-red-700" />
                Observação de Passagem — {editing.id}
              </h3>
              <button onClick={() => !isSaving && setEditing(null)} className="text-gray-400 hover:text-gray-600" data-testid="button-close-obs"><X size={20} /></button>
            </div>
            <div className="p-5">
              <div className="text-[11px] text-gray-500 mb-2">
                {editing.cliente} • {editing.rota}
              </div>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={6}
                placeholder="Anote aqui o que o próximo operador precisa saber sobre esta OS..."
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-y"
                data-testid="input-obs-text"
                autoFocus
              />
              {notes[editing.id]?.updated_at && (
                <p className="text-[10px] text-gray-400 mt-2">
                  Última atualização por {notes[editing.id].updated_by || 'operador'} em {fmtDateTimeFull(notes[editing.id].updated_at)}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setEditing(null)} disabled={isSaving} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-60" data-testid="button-cancel-obs">Cancelar</button>
              <button onClick={saveObs} disabled={isSaving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-red-700 text-white hover:bg-red-800 disabled:opacity-60" data-testid="button-save-obs">
                <Save size={15} />
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftHandover;
