import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR, formatTimeBR } from '../lib/dateUtils';
import { marcarOcorrenciaResolvida } from '../lib/marcarOcorrenciaResolvida';
import { MISSION_LIVE_WINDOW_EVENT } from '../lib/missionLiveBroadcast';
import { buildOpenOccurrenceViews, ROTULO_O_QUE_FOI_FEITO, ROTULO_RESOLVER_OCORRENCIA, type OpenOccurrenceMission, type OpenOccurrenceSource, type OpenOccurrenceView } from '../lib/missionOccurrence';
import MissionOccurrenceDialog from './MissionOccurrenceDialog';

const OPEN_LIMIT = 300;

function readUserName(): string {
  try {
    const raw = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(raw?.name || 'Financeiro');
  } catch {
    return 'Financeiro';
  }
}

const CockpitOpenOccurrences: React.FC = () => {
  const [rows, setRows] = useState<OpenOccurrenceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [incomplete, setIncomplete] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [selected, setSelected] = useState<OpenOccurrenceView | null>(null);
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroResolucao, setErroResolucao] = useState('');

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

  const confirmar = async (row: OpenOccurrenceView) => {
    setSalvando(true);
    setErroResolucao('');
    const result = await marcarOcorrenciaResolvida({
      occurrenceId: row.id,
      missionId: row.missionId,
      note: nota,
      author: readUserName(),
    });
    if (!result.ok) {
      setErroResolucao(result.error);
      if (result.already) {
        setResolvendoId(null);
        setNota('');
        await load();
      }
      setSalvando(false);
      return;
    }
    setRows((atual) => atual.filter((item) => item.id !== row.id));
    setResolvendoId(null);
    setNota('');
    if (result.auditFailed) setErroResolucao('A resolução ficou salva na OS. O histórico da auditoria não registrou desta vez.');
    setSalvando(false);
    void load();
  };

  return (
    <div className="bg-white border border-orange-200 rounded-2xl p-4 shadow-sm" data-testid="cockpit-open-occurrences">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={aberto}
        data-testid="cockpit-open-occurrences-toggle"
      >
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
            {aberto ? <ChevronDown size={16} className="text-orange-600" /> : <ChevronRight size={16} className="text-orange-600" />}
            <AlertTriangle size={16} className="text-orange-600" /> Ocorrências em aberto
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {aberto ? 'Só entra aqui o que ainda não foi marcado como resolvido.' : 'Minimizado. Clique para abrir.'}
          </p>
        </div>
        <p className="text-2xl font-black text-orange-700" data-testid="cockpit-open-occurrences-count">{loading ? '…' : rows.length}</p>
      </button>
      {aberto && (
        <>
          {loading && <p className="mt-3 text-xs text-gray-500"><Loader2 size={12} className="inline animate-spin" /> Carregando...</p>}
          {error && <p className="mt-3 text-xs font-bold text-red-600" data-testid="cockpit-open-occurrences-error">ERRO — {error}</p>}
          {incomplete && !error && (
            <p className="mt-3 text-xs font-bold text-amber-800">CONSULTA INCOMPLETA — a lista pode não estar com o conjunto inteiro. Atualize antes de usar estes números.</p>
          )}
          {!loading && !error && rows.length === 0 && <p className="mt-3 text-xs text-gray-500">Nenhuma ocorrência em aberto.</p>}
          {rows.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full table-fixed text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-gray-400">
                    <th className="w-[5.6rem] py-1 pr-2">OS</th>
                    <th className="w-[16%] py-1 pr-2">Cliente</th>
                    <th className="w-[24%] py-1 pr-2">Rota</th>
                    <th className="py-1 pr-2">Motivo</th>
                    <th className="w-[7.5rem] py-1 pr-2">Quem gravou</th>
                    <th className="w-[8.2rem] py-1 pr-2">Quando</th>
                    <th className="w-[6.6rem] py-1">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr className="h-8 border-t border-orange-100">
                        <td className="whitespace-nowrap py-1 pr-2">
                          <button
                            type="button"
                            onClick={() => setSelected(row)}
                            className="font-black text-orange-700 underline"
                            data-testid={`cockpit-open-occurrence-${row.missionId}`}
                          >
                            {row.missionId}
                          </button>
                        </td>
                        <td className="max-w-0 truncate py-1 pr-2 font-semibold text-gray-800" title={row.client}>{row.client}</td>
                        <td className="max-w-0 truncate py-1 pr-2 text-gray-600" title={row.route}>{row.route}</td>
                        <td className="max-w-0 truncate py-1 pr-2 font-semibold text-gray-900" title={row.description}>{row.description}</td>
                        <td className="max-w-0 truncate py-1 pr-2 text-gray-700" title={row.createdBy}>{row.createdBy}</td>
                        <td className="whitespace-nowrap py-1 pr-2 text-gray-600">{formatDateBR(row.createdAt)} {formatTimeBR(row.createdAt)}</td>
                        <td className="whitespace-nowrap py-1">
                          <button
                            type="button"
                            onClick={() => { setResolvendoId(row.id); setNota(''); setErroResolucao(''); }}
                            className="rounded-lg bg-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase text-white"
                            data-testid={`cockpit-occurrence-resolve-${row.id}`}
                          >
                            <CheckCircle2 size={11} className="inline" /> {ROTULO_RESOLVER_OCORRENCIA}
                          </button>
                        </td>
                      </tr>
                      {resolvendoId === row.id && (
                        <tr className="border-b border-emerald-100 bg-emerald-50/70">
                          <td colSpan={7} className="px-1 py-1">
                            <div className="flex items-center gap-2">
                              <label className="sr-only" htmlFor={`cockpit-occurrence-note-${row.id}`}>{ROTULO_O_QUE_FOI_FEITO}</label>
                              <input
                                id={`cockpit-occurrence-note-${row.id}`}
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                placeholder={ROTULO_O_QUE_FOI_FEITO}
                                className="h-7 min-w-0 flex-1 rounded-lg border border-emerald-300 px-2 text-xs font-medium text-zinc-900"
                                data-testid={`cockpit-occurrence-note-${row.id}`}
                              />
                              <button
                                type="button"
                                onClick={() => { void confirmar(row); }}
                                disabled={salvando}
                                className="h-7 shrink-0 rounded-lg bg-emerald-700 px-2 text-[10px] font-black uppercase text-white disabled:opacity-60"
                                data-testid={`cockpit-occurrence-confirm-${row.id}`}
                              >
                                {salvando ? <Loader2 size={12} className="inline animate-spin" /> : null} Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => { setResolvendoId(null); setNota(''); setErroResolucao(''); }}
                                className="h-7 shrink-0 rounded-lg border border-zinc-200 px-2 text-[10px] font-black uppercase text-zinc-600"
                              >
                                Cancelar
                              </button>
                            </div>
                            {erroResolucao && <p className="mt-1 text-[11px] font-bold text-red-600">{erroResolucao}</p>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {selected && (
        <MissionOccurrenceDialog
          missionId={selected.missionId}
          canWrite
          context={{ os: selected.missionId, cliente: selected.client, rota: selected.routeFull || selected.route }}
          onClose={() => { setSelected(null); void load(); }}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
};

export default CockpitOpenOccurrences;
