import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Clock, Loader2, MessageSquare, RefreshCw,
  Shield, Wifi, WifiOff, Zap,
} from 'lucide-react';
import { formatDateTimeBR } from '../lib/dateUtils';

type Range = 'today' | '7d' | '15d';
type RiskLevel = 'normal' | 'attention' | 'high' | 'critical';

type DashboardData = {
  ok: boolean;
  needsMigration?: boolean;
  error?: string;
  observationNote?: string;
  rangeLabel?: string;
  periodStart?: string;
  connectionState?: { generation: number; lastReconnectedAt: string | null };
  risk?: { score: number; level: RiskLevel; label: string; factors: string[] };
  outbound?: {
    total: number;
    skipped: number;
    distinctGroups: number;
    avgQueueWaitSec: number;
    distinctGroups: number;
    failures: number;
    retries: number;
    successRate: number;
    sendsWithin60sOfReconnect: number;
  };
  session?: {
    reconnections: number;
    disconnects: number;
    restartAttempts: number;
    wrongNumberAlerts: number;
    lastRestartAt: string | null;
    lastDisconnectAt: string | null;
    lastReconnectAt: string | null;
    currentGeneration: number;
  };
  postReconnect?: Array<{
    reconnectedAt: string;
    connectionGeneration: number | null;
    firstSendAt: string | null;
    msToFirstSend: number | null;
    firstSendClient: string | null;
  }>;
  dayTimeline?: Array<{
    at: string;
    timeLabel: string;
    kind: 'session' | 'send' | 'burst';
    label: string;
    detail?: string;
    severity: 'info' | 'warn' | 'danger';
    connectionGeneration?: number | null;
  }>;
  topGroups?: { groupId: string; count: number }[];
  recentOutbound?: Array<{
    id: string;
    created_at: string;
    client_name: string | null;
    queue_depth: number;
    connection_generation: number | null;
    ms_since_reconnect: number | null;
    success: boolean;
    skipped: boolean;
    mission_id: string | null;
  }>;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const riskStyles: Record<RiskLevel, { bg: string; text: string; emoji: string }> = {
  normal: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', emoji: '🟢' },
  attention: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-900', emoji: '🟡' },
  high: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-900', emoji: '🟠' },
  critical: { bg: 'bg-red-50 border-red-200', text: 'text-red-900', emoji: '🔴' },
};

const severityDot: Record<string, string> = {
  info: 'bg-blue-400',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
};

const fmtMs = (ms: number | null) => {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}min`;
};

const WhatsAppTelemetryDashboard: React.FC = () => {
  const [range, setRange] = useState<Range>('today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp/telemetry/dashboard?range=${range}`, { headers: authHeaders() });
      const json: DashboardData = await res.json();
      if (!json.ok) {
        setError(json.error || 'Falha ao carregar telemetria');
        setData(json);
        return;
      }
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Erro de rede');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void fetchDashboard(); }, [fetchDashboard]);

  const ob = data?.outbound;
  const sess = data?.session;
  const risk = data?.risk;
  const rs = risk ? riskStyles[risk.level] : riskStyles.normal;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200" data-testid="panel-whatsapp-telemetry">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-start gap-3">
          <Activity className="text-green-600 mt-1 shrink-0" />
          <div>
            <h3 className="text-lg font-bold text-gray-800">Telemetria WhatsApp (Z-API)</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Evidências antes de migrar provedor — sessão #{sess?.currentGeneration ?? data?.connectionState?.generation ?? '?'} ativa.
            </p>
            {data?.observationNote && (
              <p className="text-[11px] text-amber-700 mt-1 max-w-2xl">{data.observationNote}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', '7d', '15d'] as Range[]).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                range === r ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {r === 'today' ? 'Hoje' : r === '7d' ? '7 dias' : '15 dias'}
            </button>
          ))}
          <button type="button" onClick={() => void fetchDashboard()} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 px-2 py-1.5">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {data?.needsMigration && (
        <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <p className="font-bold flex items-center gap-2"><AlertTriangle size={16} /> Tabelas não encontradas</p>
          <p className="mt-1">Reinicie o servidor ou rode <code className="bg-amber-100 px-1 rounded">migrations/2026_07_05_whatsapp_telemetry.sql</code> no Supabase.</p>
        </div>
      )}

      {error && !data?.ok && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {loading && !ob ? (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
          <Loader2 className="animate-spin" size={20} /> Carregando métricas…
        </div>
      ) : ob && risk ? (
        <>
          {/* Score de risco */}
          <div className={`mb-5 p-4 rounded-xl border ${rs.bg}`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Shield className={rs.text} size={28} />
                <div>
                  <p className={`text-sm font-black uppercase tracking-wider ${rs.text}`}>
                    {rs.emoji} Score de risco: {risk.score} — {risk.label}
                  </p>
                  {risk.factors.length > 0 ? (
                    <p className={`text-xs mt-1 ${rs.text} opacity-80`}>{risk.factors.join(' · ')}</p>
                  ) : (
                    <p className={`text-xs mt-1 ${rs.text} opacity-80`}>Nenhum fator de risco no período.</p>
                  )}
                </div>
              </div>
              <div className={`text-xs ${rs.text} text-right`}>
                <p>0–20 Normal · 21–50 Atenção</p>
                <p>51–80 Alto · &gt;80 Crítico</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <MetricCard icon={<MessageSquare size={16} />} label="Mensagens" value={String(ob.total)} accent="blue" />
            <MetricCard icon={<MessageSquare size={16} />} label="Grupos" value={String(ob.distinctGroups)} accent="indigo" />
            <MetricCard icon={<Clock size={16} />} label="Fila média" value={`${ob.avgQueueWaitSec} s`} accent="amber" />
            <MetricCard icon={<Zap size={16} />} label="Pico fila" value={String(ob.maxQueueDepth)} accent={ob.maxQueueDepth >= 20 ? 'orange' : 'gray'} />
            <MetricCard icon={<AlertTriangle size={16} />} label="Falhas" value={String(ob.failures)} accent={ob.failures > 0 ? 'red' : 'gray'} />
            <MetricCard icon={<RefreshCw size={16} />} label="Reconexões" value={String(sess?.reconnections ?? 0)} accent={(sess?.reconnections ?? 0) > 0 ? 'orange' : 'gray'} />
            <MetricCard icon={<Wifi size={16} />} label="Envio &lt;60s pós-recon." value={String(ob.sendsWithin60sOfReconnect)} accent={ob.sendsWithin60sOfReconnect > 0 ? 'orange' : 'gray'} />
          </div>

          {/* Linha do tempo do dia */}
          {(data.dayTimeline?.length ?? 0) > 0 && (
            <div className="mb-6 rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-600">Linha do tempo</h4>
                <span className="text-[10px] text-gray-400">{data.rangeLabel}</span>
              </div>
              <div className="p-4 max-h-72 overflow-y-auto">
                <ol className="relative border-l-2 border-gray-200 ml-2 space-y-3">
                  {data.dayTimeline!.map((ev, idx) => (
                    <li key={`${ev.at}-${idx}`} className="ml-4 relative">
                      <span className={`absolute -left-[1.35rem] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${severityDot[ev.severity]}`} />
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs font-mono font-bold text-gray-500">{ev.timeLabel}</span>
                        <span className={`text-sm font-bold ${ev.severity === 'danger' ? 'text-red-700' : ev.severity === 'warn' ? 'text-amber-800' : 'text-gray-800'}`}>
                          {ev.label}
                        </span>
                        {ev.connectionGeneration != null && (
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">sessão #{ev.connectionGeneration}</span>
                        )}
                      </div>
                      {ev.detail && <p className="text-xs text-gray-500 mt-0.5">{ev.detail}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Sessão / Vigia</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex justify-between"><span>Geração atual</span><strong>#{sess?.currentGeneration ?? '?'}</strong></li>
                <li className="flex justify-between"><span>Quedas</span><strong>{sess?.disconnects ?? 0}</strong></li>
                <li className="flex justify-between"><span>Restarts</span><strong>{sess?.restartAttempts ?? 0}</strong></li>
                <li className="flex justify-between"><span>Número errado</span><strong>{sess?.wrongNumberAlerts ?? 0}</strong></li>
              </ul>
              <div className="mt-3 pt-3 border-t border-gray-200 text-[11px] text-gray-500 space-y-1">
                {sess?.lastDisconnectAt && <p className="flex items-center gap-1"><WifiOff size={12} /> Queda: {formatDateTimeBR(sess.lastDisconnectAt)}</p>}
                {sess?.lastReconnectAt && <p className="flex items-center gap-1"><Wifi size={12} /> Reconexão: {formatDateTimeBR(sess.lastReconnectAt)}</p>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">1º envio após reconexão</h4>
              {(data.postReconnect?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-400">Sem reconexões no período.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {data.postReconnect!.slice().reverse().map((p, i) => (
                    <li key={i} className="border-b border-gray-100 pb-2 last:border-0">
                      <p className="font-bold text-gray-700">
                        Sessão #{p.connectionGeneration ?? '?'} · {fmtMs(p.msToFirstSend)} até 1º envio
                      </p>
                      <p className="text-gray-500">
                        Reconectou {formatDateTimeBR(p.reconnectedAt)}
                        {p.firstSendAt ? ` → envio ${formatDateTimeBR(p.firstSendAt)}` : ' → sem envio depois'}
                        {p.firstSendClient ? ` (${p.firstSendClient})` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <RecentTable
              title="Últimos envios"
              rows={(data.recentOutbound || []).map(r => ({
                id: r.id,
                time: r.created_at,
                primary: r.client_name || '—',
                secondary: [
                  r.connection_generation != null ? `sessão #${r.connection_generation}` : null,
                  `fila=${r.queue_depth ?? 0}`,
                  r.ms_since_reconnect != null ? `+${Math.round(r.ms_since_reconnect / 1000)}s pós-recon.` : null,
                ].filter(Boolean).join(' · '),
                meta: r.skipped ? 'SKIP' : r.success ? 'OK' : 'FALHA',
                ok: r.success && !r.skipped,
              }))}
            />
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Top grupos</h4>
              {(data.topGroups?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-400">Nenhum envio.</p>
              ) : (
                <ul className="space-y-1 text-xs font-mono">
                  {data.topGroups!.map(g => (
                    <li key={g.groupId} className="flex justify-between gap-2">
                      <span className="truncate">{g.groupId.slice(0, 24)}…</span>
                      <strong>{g.count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

function MetricCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string;
  accent: 'blue' | 'indigo' | 'amber' | 'red' | 'orange' | 'gray';
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    red: 'text-red-600 bg-red-50 border-red-100',
    orange: 'text-orange-600 bg-orange-50 border-orange-100',
    gray: 'text-gray-600 bg-gray-50 border-gray-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[accent]}`}>
      <div className="flex items-center gap-1 opacity-80 mb-1">{icon}<span className="text-[9px] font-black uppercase tracking-wider">{label}</span></div>
      <p className="text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function RecentTable({ title, rows }: {
  title: string;
  rows: { id: string; time: string; primary: string; secondary: string; meta: string; ok: boolean }[];
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
        <h4 className="text-xs font-black uppercase tracking-widest text-gray-600">{title}</h4>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Sem registros.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTimeBR(r.time)}</td>
                  <td className="p-2">
                    <p className={`font-bold ${r.ok ? 'text-green-700' : 'text-gray-800'}`}>{r.primary}</p>
                    <p className="text-gray-500">{r.secondary}</p>
                    <p className="text-gray-400">{r.meta}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default WhatsAppTelemetryDashboard;
