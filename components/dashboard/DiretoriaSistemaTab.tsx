import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Loader2, Cpu, Thermometer, AlertTriangle, CheckCircle2,
  Download, Sparkles, TrendingDown,
} from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import type { BillingMonthSummary, BillingUsageRow, TokenEfficiencyReport } from '../../lib/dashboardDiretoria/billingTypes';

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const FETCH_TIMEOUT_MS = 25_000;

const THERM_COLORS = {
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  warning: { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  critical: { bar: 'bg-red-600', text: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await authFetch(url, { ...init, signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json: j };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Tempo esgotado ao carregar custos de IA — tente Atualizar novamente.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

interface Props {
  onNavigate?: (screenId: string) => void;
}

const DiretoriaSistemaTab: React.FC<Props> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<BillingMonthSummary | null>(null);
  const [logs, setLogs] = useState<BillingUsageRow[]>([]);
  const [report, setReport] = useState<TokenEfficiencyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = authHeaders();
      if (!headers.Authorization) {
        throw new Error('Sessão expirada — faça login novamente.');
      }

      const ensureSchema = async () => {
        const { ok, json } = await fetchJsonWithTimeout('/api/billing/ensure-schema', {
          method: 'POST',
          headers,
        });
        if (!ok || !json.ok) throw new Error(json.message || json.error || 'Falha ao criar tabela billing_usage');
      };

      const fetchData = async () => {
        const { ok, json } = await fetchJsonWithTimeout('/api/billing/dashboard?limit=80', { headers });
        if (!ok) throw new Error(json.error || 'Falha ao carregar custos de IA');
        setSummary(json.summary ?? null);
        setLogs(json.rows || []);
        setReport(json.efficiency || null);
      };

      try {
        await fetchData();
      } catch (firstErr: unknown) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (/billing_usage|schema cache|does not exist/i.test(msg)) {
          await ensureSchema();
          await fetchData();
        } else {
          throw firstErr;
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const syncStripe = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const headers = { ...authHeaders(), 'Content-Type': 'application/json' };
      const { ok, json } = await fetchJsonWithTimeout('/api/billing/sync', { method: 'POST', headers });
      if (!ok) throw new Error(json.error || json.message || 'Sync falhou');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const progress = useMemo(() => {
    if (!summary) return { usedPct: 0, withinPct: 0, extraPct: 0 };
    const usedPct = Math.min(100, summary.usagePct);
    const extraPct = summary.extraBrl > 0 && summary.planLimitBrl > 0
      ? Math.min(50, (summary.extraBrl / summary.planLimitBrl) * 100)
      : 0;
    return { usedPct, withinPct: usedPct, extraPct };
  }, [summary]);

  const therm = summary ? THERM_COLORS[summary.thermometer] : THERM_COLORS.ok;

  if (loading && !summary && !error) {
    return (
      <div className="flex items-center gap-2 p-8 text-gray-500" data-testid="tab-sistema-loading">
        <Loader2 className="animate-spin text-red-700" /> Carregando custos de IA…
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="tab-sistema">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-bold text-red-700 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Cpu size={20} className="text-red-700" /> Plano &amp; custos de IA
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {summary
              ? `${summary.planName} · câmbio ${summary.exchangeRate.toFixed(2)} + IOF ${summary.iofPct}%`
              : 'Resumo indisponível — use Atualizar ou Sincronizar Stripe'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => void syncStripe()}
            disabled={syncing}
            className="flex items-center gap-2 bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-red-800 disabled:opacity-60"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sincronizar Stripe
          </button>
        </div>
      </div>

      {summary && (
        <>
          <div className={`rounded-xl border p-4 ${therm.bg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Thermometer size={18} className={therm.text} />
                <span className={`text-sm font-black uppercase ${therm.text}`}>
                  {summary.thermometer === 'critical' ? 'Estourando o plano' : summary.thermometer === 'warning' ? 'Atenção ao limite' : 'Dentro do plano'}
                </span>
              </div>
              <span className="text-xs font-mono text-gray-600">{fmtPct(summary.usagePct)} do mensal</span>
            </div>

            <div className="h-4 w-full rounded-full bg-white/80 border border-gray-200 overflow-hidden flex">
              <div
                className="h-full bg-sky-300 transition-all"
                style={{ width: `${Math.min(100, progress.withinPct)}%` }}
                title="Consumido no plano"
              />
              {progress.extraPct > 0 && (
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${progress.extraPct}%` }}
                  title="Extra acima do plano"
                />
              )}
            </div>
            <div className="flex flex-wrap justify-between text-[10px] text-gray-600 mt-2 font-mono">
              <span>Gasto: {fmtBRL(summary.spentBrl)}</span>
              <span>Limite: {fmtBRL(summary.planLimitBrl)}</span>
              {summary.extraBrl > 0 && <span className="text-red-600 font-bold">Extra: {fmtBRL(summary.extraBrl)}</span>}
              <span>Saldo: {fmtBRL(summary.planBalanceBrl)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <p className="text-[10px] uppercase text-gray-400 font-black">Gasto no mês</p>
              <p className="text-lg font-black font-mono text-gray-900">{fmtBRL(summary.spentBrl)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <p className="text-[10px] uppercase text-gray-400 font-black">Saldo assinatura</p>
              <p className={`text-lg font-black font-mono ${summary.planBalanceBrl <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmtBRL(summary.planBalanceBrl)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <p className="text-[10px] uppercase text-gray-400 font-black">Economia operacional</p>
              <p className="text-lg font-black font-mono text-emerald-600 flex items-center gap-1">
                <TrendingDown size={14} /> {fmtBRL(summary.operationalSavingsBrl)}/mês
              </p>
              <p className="text-[10px] text-gray-500">Planilha Situação Geral Faturamento</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <p className="text-[10px] uppercase text-gray-400 font-black">Lançamentos</p>
              <p className="text-lg font-black font-mono text-gray-900">{summary.entryCount}</p>
            </div>
          </div>
        </>
      )}

      {report && report.recommendations.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <h3 className="text-sm font-black text-violet-900 flex items-center gap-2 mb-2">
            <Sparkles size={16} /> Análise de tokens &amp; custo
          </h3>
          <ul className="text-xs text-violet-900 space-y-1 list-disc ml-4">
            {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {report.agentsMdSnippets.length > 0 && (
            <p className="text-[10px] text-violet-700 mt-2">
              Sugestões aplicáveis em AGENTS.md — peça ao agente para consolidar regras de redução de retrabalho.
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900 uppercase">Log por token</h3>
          <button
            type="button"
            onClick={() => onNavigate?.('cost-optimization')}
            className="text-[10px] font-bold text-red-700 hover:underline"
          >
            Custos cloud detalhados →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-black">
              <tr>
                <th className="px-3 py-2">Data e hora</th>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">Resumo</th>
                <th className="px-3 py-2 text-right">Custo (R$)</th>
                <th className="px-3 py-2 text-right">Saldo plano</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    Nenhum lançamento — configure STRIPE_SECRET_KEY e sincronize, ou registre uso via API.
                  </td>
                </tr>
              ) : logs.map(row => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-600 whitespace-nowrap">
                    {new Date(row.recorded_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-700 max-w-[100px] truncate" title={row.token_id || ''}>
                    {row.token_id || row.external_id || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-800 max-w-[240px] truncate" title={row.summary}>{row.summary}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{fmtBRL(Number(row.amount_brl))}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">
                    {row.plan_balance_brl != null ? fmtBRL(Number(row.plan_balance_brl)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <CheckCircle2 size={12} className="text-emerald-600" />
        <span>Exportável para planilha: Data · Token · Resumo · Custo R$ · Saldo assinatura</span>
        <Download size={12} />
      </div>
    </div>
  );
};

export default DiretoriaSistemaTab;
