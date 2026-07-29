import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, ExternalLink, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';
import type { OsAnalysisRequest } from '../lib/osAnalysisTypes';
import { canViewOsAnalysisPendencies } from '../lib/osAnalysisAccess';

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const OsAnalysisPendingPage: React.FC<{ onOpenMission?: (id: string) => void }> = ({ onOpenMission }) => {
  const { showNotification } = useNotification();
  const [items, setItems] = useState<OsAnalysisRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'adjusted' | 'reviewed'>('all');

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? 'op=list' : `op=list&status=${encodeURIComponent(filter)}`;
      const res = await authFetch(`/api/os-analysis?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setItems(data.items || []);
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao carregar pendências', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showNotification]);

  useEffect(() => {
    if (canViewOsAnalysisPendencies(user)) void load();
    else setLoading(false);
  }, [load, user]);

  const markReviewed = async (id: string) => {
    const res = await authFetch(`/api/os-analysis?op=review&id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Revisado pela Diretoria' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotification('Erro', data.error || 'Falha', 'error');
      return;
    }
    showNotification('OK', 'Marcado como revisado', 'success');
    await load();
  };

  if (!canViewOsAnalysisPendencies(user)) {
    return (
      <div className="p-8">
        <p className="text-slate-600">Somente Diretoria acessa as Pendências de OS.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" data-testid="page-os-analysis-pending">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-slate-900 text-amber-300">
            <ClipboardList size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Pendências de OS</h1>
            <p className="text-sm text-slate-500">Pedidos de análise · motivo do ajuste · impacto financeiro</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'adjusted', 'reviewed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${filter === f ? 'bg-slate-900 text-amber-300' : 'bg-white border text-slate-600'}`}
            >
              {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendentes' : f === 'adjusted' ? 'Ajustadas' : 'Revisadas'}
            </button>
          ))}
          <button type="button" onClick={() => void load()} className="p-2 rounded-xl border bg-white">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Carregando…</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const delta = Number(item.result_delta);
            const impact =
              item.status === 'pending' ? null :
              delta > 0.01 ? 'positivo' :
              delta < -0.01 ? 'negativo' : 'estável';
            return (
              <article key={item.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm" data-testid={`os-analysis-card-${item.mission_id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {item.status} · {item.source} · {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                    <h3 className="font-black text-slate-900 mt-0.5">
                      OS {item.mission_id}
                      <span className="font-semibold text-slate-500 text-sm ml-2">{item.client_name || ''}</span>
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      <strong>Pedido ({item.requested_by}):</strong> {item.request_note}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md"
                    onClick={() => {
                      if (onOpenMission) onOpenMission(item.mission_id);
                      else window.location.href = `/?page=missions&openMission=${encodeURIComponent(item.mission_id)}`;
                    }}
                  >
                    Auditoria <ExternalLink size={12} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-xl p-2">
                    <p className="text-slate-400 font-bold uppercase">Resultado antes</p>
                    <p className="font-mono font-bold">{fmt(item.result_before)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <p className="text-slate-400 font-bold uppercase">Resultado depois</p>
                    <p className="font-mono font-bold">{item.result_after == null ? '—' : fmt(item.result_after)}</p>
                  </div>
                  <div className={`rounded-xl p-2 ${impact === 'positivo' ? 'bg-emerald-50' : impact === 'negativo' ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <p className="text-slate-400 font-bold uppercase">Delta</p>
                    <p className={`font-mono font-bold ${impact === 'positivo' ? 'text-emerald-700' : impact === 'negativo' ? 'text-rose-700' : ''}`}>
                      {item.result_delta == null ? '—' : fmt(item.result_delta)}
                      {impact ? ` (${impact})` : ''}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <p className="text-slate-400 font-bold uppercase">Ajustado por</p>
                    <p className="font-bold">{item.adjusted_by || '—'}</p>
                  </div>
                </div>

                {item.adjustment_reason && (
                  <p className="mt-3 text-sm text-slate-700">
                    <strong>Motivo do ajuste:</strong> {item.adjustment_reason}
                  </p>
                )}
                {item.changes_summary && (
                  <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{item.changes_summary}</p>
                )}

                {item.status === 'adjusted' && (
                  <button
                    type="button"
                    onClick={() => void markReviewed(item.id)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg"
                  >
                    <CheckCircle2 size={14} /> Marcar como revisado
                  </button>
                )}
              </article>
            );
          })}
          {!items.length && <p className="text-slate-500 text-sm">Nenhuma pendência neste filtro.</p>}
        </div>
      )}
    </div>
  );
};

export default OsAnalysisPendingPage;
