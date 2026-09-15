import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, ExternalLink, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { useNotification } from '../lib/NotificationContext';
import type { OsAnalysisRequest } from '../lib/osAnalysisTypes';
import { canViewOsAnalysisPendencies } from '../lib/osAnalysisAccess';

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function readStoredUser(): { name?: string; role?: string; permissions?: string[] } {
  try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
}

const OsAnalysisPendingPage: React.FC<{ onOpenMission?: (id: string) => void }> = ({ onOpenMission }) => {
  const { showNotification } = useNotification();
  const [items, setItems] = useState<OsAnalysisRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'adjusted' | 'reviewed'>('all');
  const user = useMemo(() => readStoredUser(), []);
  const canView = canViewOsAnalysisPendencies(user);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = filter === 'all' ? 'op=list' : `op=list&status=${encodeURIComponent(filter)}`;
      const res = await authFetch(`/api/os-analysis?${q}`);
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      const msg = e?.message || 'Falha ao carregar pendências';
      setLoadError(msg);
      setItems([]);
      showNotification('Erro', msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showNotification]);

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
  }, [canView, load]);

  const markReviewed = async (id: string) => {
    const res = await authFetch(`/api/os-analysis?op=review&id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Revisado pela Diretoria' }),
    });
    const data = await parseJsonResponse(res).catch(() => ({}));
    if (!res.ok) {
      showNotification('Erro', data.error || 'Falha', 'error');
      return;
    }
    showNotification('OK', 'Marcado como revisado', 'success');
    await load();
  };

  if (!canView) {
    return (
      <div className="p-8" data-testid="page-os-analysis-pending-denied">
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
        <div className="flex flex-wrap gap-2">
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
          <button type="button" onClick={() => void load()} className="p-2 rounded-xl border bg-white" data-testid="btn-refresh-os-analysis">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Carregando…</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800" data-testid="os-analysis-load-error">
          <p className="font-bold">Não foi possível carregar as pendências.</p>
          <p className="text-sm mt-1">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm font-bold underline">Tentar de novo</button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const delta = Number(item.result_delta);
            const impact =
              item.status === 'pending' ? null :
              delta > 0.01 ? 'positivo' :
              delta < -0.01 ? 'negativo' : 'estável';
            const recipients = Array.isArray(item.recipients) ? item.recipients.filter((r) => r && r.name) : [];
            return (
              <article key={item.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm" data-testid={`os-analysis-card-${item.mission_id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {item.status} · {item.source} · {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '—'}
                    </p>
                    <h3 className="font-black text-slate-900 mt-0.5">
                      OS {item.mission_id}
                      <span className="font-semibold text-slate-500 text-sm ml-2">{item.client_name || ''}</span>
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      <strong>Pedido ({item.requested_by}):</strong> {item.request_note}
                    </p>
                    {recipients.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        Destinatários: {recipients.map((r) => r.name).join(', ')}
                        {item.claimed_by_name ? ` · Assumido por ${item.claimed_by_name}` : ''}
                      </p>
                    )}
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
