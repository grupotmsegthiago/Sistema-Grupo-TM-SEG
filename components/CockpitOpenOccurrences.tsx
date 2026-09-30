import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR, formatTimeBR } from '../lib/dateUtils';
import { MISSION_LIVE_WINDOW_EVENT } from '../lib/missionLiveBroadcast';
import { buildOpenOccurrenceViews, type OpenOccurrenceMission, type OpenOccurrenceSource, type OpenOccurrenceView } from '../lib/missionOccurrence';
import MissionOccurrenceDialog from './MissionOccurrenceDialog';

const OPEN_LIMIT = 300;

const CockpitOpenOccurrences: React.FC = () => {
  const [rows, setRows] = useState<OpenOccurrenceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [incomplete, setIncomplete] = useState(false);
  const [selected, setSelected] = useState<OpenOccurrenceView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setIncomplete(false);
    const { data, error: queryError, count } = await supabase
      .from('mission_occurrences')
      .select('id, mission_id, description, evidence_url, created_by, created_at, resolved_at', { count: 'exact' })
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(OPEN_LIMIT);
    if (queryError) {
      setRows([]);
      setError(queryError.message);
      setLoading(false);
      return;
    }
    const occurrences = (data || []) as OpenOccurrenceSource[];
    const ids = [...new Set(occurrences.map((row) => String(row.mission_id)))];
    let missions: OpenOccurrenceMission[] = [];
    let missionFailed = false;
    if (ids.length > 0) {
      const missionQuery = await supabase
        .from('missions')
        .select('id, client, origin, destination')
        .in('id', ids);
      if (missionQuery.error) missionFailed = true;
      else missions = (missionQuery.data || []) as OpenOccurrenceMission[];
    }
    setRows(buildOpenOccurrenceViews(occurrences, missions));
    setIncomplete(missionFailed || (count != null && count > occurrences.length));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onLive = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.event === 'occurrence') void load();
    };
    window.addEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
    return () => window.removeEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
  }, [load]);

  return (
    <div className="bg-white border border-orange-200 rounded-2xl p-4 shadow-sm" data-testid="cockpit-open-occurrences">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-600" /> Ocorrências em aberto
          </h3>
          <p className="text-xs text-gray-500 mt-1">Só entra aqui o que ainda não foi marcado como resolvido.</p>
        </div>
        <p className="text-2xl font-black text-orange-700" data-testid="cockpit-open-occurrences-count">{loading ? '…' : rows.length}</p>
      </div>
      {loading && <p className="mt-3 text-xs text-gray-500"><Loader2 size={12} className="inline animate-spin" /> Carregando...</p>}
      {error && <p className="mt-3 text-xs font-bold text-red-600" data-testid="cockpit-open-occurrences-error">ERRO — {error}</p>}
      {incomplete && !error && (
        <p className="mt-3 text-xs font-bold text-amber-800">CONSULTA INCOMPLETA — a lista pode não estar com o conjunto inteiro. Atualize antes de usar estes números.</p>
      )}
      {!loading && !error && rows.length === 0 && <p className="mt-3 text-xs text-gray-500">Nenhuma ocorrência em aberto.</p>}
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] font-black uppercase text-gray-400">
                <th className="py-1 pr-3">OS</th>
                <th className="py-1 pr-3">Cliente</th>
                <th className="py-1 pr-3">Rota</th>
                <th className="py-1 pr-3">Motivo</th>
                <th className="py-1 pr-3">Quem gravou</th>
                <th className="py-1">Quando</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-orange-100 align-top">
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="font-black text-orange-700 underline"
                      data-testid={`cockpit-open-occurrence-${row.missionId}`}
                    >
                      {row.missionId}
                    </button>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-gray-800">{row.client}</td>
                  <td className="py-2 pr-3 text-gray-600">{row.route}</td>
                  <td className="py-2 pr-3 font-semibold text-gray-900 max-w-xs">{row.description}</td>
                  <td className="py-2 pr-3 text-gray-700">{row.createdBy}</td>
                  <td className="py-2 whitespace-nowrap text-gray-600">{formatDateBR(row.createdAt)} {formatTimeBR(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <MissionOccurrenceDialog
          missionId={selected.missionId}
          canWrite
          context={{ os: selected.missionId, cliente: selected.client, rota: selected.route }}
          onClose={() => { setSelected(null); void load(); }}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
};

export default CockpitOpenOccurrences;
