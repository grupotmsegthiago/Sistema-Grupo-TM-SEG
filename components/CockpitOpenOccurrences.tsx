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
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-gray-400">
                    <th className="py-1 pr-3">OS</th>
                    <th className="py-1 pr-3">Cliente</th>
                    <th className="py-1 pr-3">Rota</th>
                    <th className="py-1 pr-3">Motivo</th>
                    <th className="py-1 pr-3">Quem gravou</th>
                    <th className="py-1 pr-3">Quando</th>
                    <th className="py-1">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr className="border-t border-orange-100 align-top">
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
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => { setResolvendoId(row.id); setNota(''); setErroResolucao(''); }}
                            className="rounded-lg bg-emerald-700 px-2 py-1 text-[10px] font-black uppercase text-white"
                            data-testid={`cockpit-occurrence-resolve-${row.id}`}
                          >
                            <CheckCircle2 size={11} className="inline" /> {ROTULO_RESOLVER_OCORRENCIA}
                          </button>
                        </td>
                      </tr>
                      {resolvendoId === row.id && (
                        <tr className="border-b border-emerald-100 bg-emerald-50/70">
                          <td colSpan={7} className="px-2 py-3">
                            <label className="block text-[10px] font-black uppercase text-emerald-800">
                              {ROTULO_O_QUE_FOI_FEITO}
                              <textarea
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                rows={3}
                                placeholder="Informe o que foi feito"
                                className="mt-1 w-full rounded-xl border border-emerald-300 px-3 py-2 text-sm font-medium normal-case text-zinc-900"
                                data-testid={`cockpit-occurrence-note-${row.id}`}
                              />
                            </label>
                            {erroResolucao && <p className="mt-2 text-xs font-bold text-red-600">{erroResolucao}</p>}
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => { void confirmar(row); }}
                                disabled={salvando}
                                className="rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-black uppercase text-white disabled:opacity-60"
                                data-testid={`cockpit-occurrence-confirm-${row.id}`}
                              >
                                {salvando ? <Loader2 size={12} className="inline animate-spin" /> : null} Guardar e tirar da lista
                              </button>
                              <button
                                type="button"
                                onClick={() => { setResolvendoId(null); setNota(''); setErroResolucao(''); }}
                                className="rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-black uppercase text-zinc-600"
                              >
                                Cancelar
                              </button>
                            </div>
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
          context={{ os: selected.missionId, cliente: selected.client, rota: selected.route }}
          onClose={() => { setSelected(null); void load(); }}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
};

export default CockpitOpenOccurrences;
