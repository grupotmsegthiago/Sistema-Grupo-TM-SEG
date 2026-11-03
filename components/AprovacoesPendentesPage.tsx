import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { useNotification } from '../lib/NotificationContext';
import {
  APROVACOES_PENDENTES_DESDE,
  canViewAprovacoesPendentes,
} from '../lib/aprovacoesPendentesAccess';

type PendenteRow = {
  id: string;
  client: string | null;
  provider: string | null;
  origin: string | null;
  destination: string | null;
  start_time: string | null;
  revenue_value: number | null;
  cost_value: number | null;
  toll_value: number | null;
  toll_value_provider: number | null;
};

const PAGE = 1000;

const money = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function readStoredUser(): { name?: string; role?: string; permissions?: string[] } {
  try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortPlace(value: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] || parts[0] : raw;
}

const AprovacoesPendentesPage: React.FC<{ onOpenMission?: (id: string) => void }> = ({ onOpenMission }) => {
  const { showNotification } = useNotification();
  const user = useMemo(() => readStoredUser(), []);
  const canView = canViewAprovacoesPendentes(user);
  const [rows, setRows] = useState<PendenteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const loadingRef = useRef(false);
  const queuedRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (loadingRef.current) {
      queuedRef.current = true;
      return;
    }
    loadingRef.current = true;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const all: PendenteRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('missions')
          .select('id, client, provider, origin, destination, start_time, revenue_value, cost_value, toll_value, toll_value_provider, billing_approved, status')
          .in('status', ['Concluída', 'Concluida'])
          .or('billing_approved.is.null,billing_approved.eq.false')
          .gte('start_time', APROVACOES_PENDENTES_DESDE)
          .order('start_time', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as PendenteRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      setRows(all);
      setLastLiveAt(new Date());
    } catch (e: any) {
      const msg = e?.message || 'Falha ao carregar aprovações pendentes';
      setLoadError(msg);
      if (!silent) setRows([]);
      showNotification('Erro', msg, 'error');
    } finally {
      loadingRef.current = false;
      setLoading(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        void load(true);
      }
    }
  }, [showNotification]);

  useEffect(() => {
    if (canView) void load(false);
    else setLoading(false);
  }, [canView, load]);

  useRealtimeRefresh(['missions', 'system_logs'], () => {
    if (canView) void load(true);
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = [row.id, row.client, row.provider, row.origin, row.destination].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  if (!canView) {
    return (
      <div className="p-8" data-testid="page-aprovacoes-pendentes-denied">
        <p className="text-slate-600">Somente os perfis Financeiro e Diretoria acessam as Aprovações Pendentes.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" data-testid="page-aprovacoes-pendentes">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-slate-900 text-amber-300">
            <ClipboardCheck size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Aprovações Pendentes</h1>
            <p className="text-sm text-slate-500">OS concluídas desde 03/03/2026 que ainda não foram aprovadas no faturamento.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="aprovacoes-live-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Ao vivo
            {lastLiveAt && (
              <span className="font-bold normal-case tracking-normal">
                · {lastLiveAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void load(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            data-testid="button-refresh-aprovacoes"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="OS, cliente ou fornecedor"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500"
            data-testid="input-search-aprovacoes"
          />
        </div>
        <p className="text-xs font-bold text-slate-500" data-testid="text-count-aprovacoes">
          {filtered.length} de {rows.length} OS
        </p>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={28} className="animate-spin text-red-600" />
        </div>
      ) : loadError && rows.length === 0 ? (
        <p className="text-sm text-red-700">{loadError}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">
          Nenhuma OS pendente de aprovação.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">OS</th>
                <th className="px-3 py-3">Cliente</th>
                <th className="px-3 py-3">Fornecedor</th>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Rota</th>
                <th className="px-3 py-3 text-right">Receita</th>
                <th className="px-3 py-3 text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-100 hover:bg-amber-50/60 cursor-pointer"
                  onClick={() => onOpenMission?.(row.id)}
                  data-testid={`row-aprovacao-${row.id}`}
                >
                  <td className="px-3 py-2.5 font-black text-blue-700">{row.id}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-800 max-w-[180px] truncate">{row.client || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[140px] truncate">{row.provider || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatWhen(row.start_time)}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[220px] truncate">
                    {shortPlace(row.origin)} → {shortPlace(row.destination)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                    {money((Number(row.revenue_value) || 0) + (Number(row.toll_value) || 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-red-700">
                    {money((Number(row.cost_value) || 0) + (Number(row.toll_value_provider) || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AprovacoesPendentesPage;
