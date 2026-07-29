import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Brain,
  CalendarClock,
  Filter,
  Gauge,
  LineChart as LineChartIcon,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import GcPageHeader from './shared/GcPageHeader';
import GcStatCard from './shared/GcStatCard';
import { formatBrl, formatPct, toneFromPct } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';

interface Props {
  onNavigate: (screen: string, id?: string) => void;
}

const GcDashboard: React.FC<Props> = ({ onNavigate }) => {
  const {
    loading,
    error,
    kpis,
    health,
    tops,
    insights,
    hideStrategic,
    refresh,
    enrichAi,
    aiLoading,
  } = useGcData();
  const [query, setQuery] = useState('');

  const filteredHealth = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return health.slice(0, 8);
    return health.filter((h) => h.clientName.toLowerCase().includes(q)).slice(0, 8);
  }, [health, query]);

  const chartRevenue = useMemo(
    () =>
      tops.topRevenue.slice(0, 8).map((h) => ({
        name: h.clientName.length > 12 ? `${h.clientName.slice(0, 12)}…` : h.clientName,
        fullName: h.clientName,
        id: h.clientId,
        receita: h.monthlyRevenue,
      })),
    [tops.topRevenue],
  );

  const trendSeries = useMemo(
    () =>
      health.slice(0, 10).map((h) => ({
        name: h.clientName.length > 10 ? `${h.clientName.slice(0, 10)}…` : h.clientName,
        id: h.clientId,
        crescimento: h.trendPct,
      })),
    [health],
  );

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 rounded-xl w-80" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-100 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      <GcPageHeader
        title="Gestor Comercial IA"
        subtitle={
          hideStrategic
            ? 'Sua carteira, metas, comissões e agenda — visão comercial'
            : 'Centro de Inteligência Comercial — visão completa da Diretoria'
        }
        icon={Brain}
        actions={
          <>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50"
            >
              <RefreshCw size={16} /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => void enrichAi()}
              disabled={aiLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-amber-300 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              <Brain size={16} /> {aiLoading ? 'Gerando IA…' : 'Gerar recomendações IA'}
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {error}. Indicadores usam missões/clientes existentes; cadastros GC podem exigir migration.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
        <GcStatCard title="Meta atual" value={formatBrl(kpis?.metaAtual || 0)} icon={Target} tone="accent" subtitle={`${formatPct(kpis?.metaPct || 0)} atingida`} />
        <GcStatCard title="Valor vendido" value={formatBrl(kpis?.valorVendido || 0)} icon={Wallet} tone="good" />
        <GcStatCard title="Valor faturado" value={formatBrl(kpis?.valorFaturado || 0)} icon={BarChart3} />
        <GcStatCard title="Projeção do mês" value={formatBrl(kpis?.projecaoMes || 0)} icon={TrendingUp} tone={toneFromPct(kpis?.metaPct || 0)} />
        {!hideStrategic && (
          <>
            <GcStatCard title="Lucro gerado" value={formatBrl(kpis?.lucroGerado || 0)} icon={LineChartIcon} tone="good" />
            <GcStatCard title="Margem" value={formatPct(kpis?.margemPct || 0)} icon={Gauge} tone={toneFromPct(kpis?.margemPct || 0, 30, 20)} />
          </>
        )}
        <GcStatCard title="Comissão estimada" value={formatBrl(kpis?.comissaoEstimada || 0)} icon={Wallet} tone="accent" onClick={() => onNavigate('gc-commissions')} />
        <GcStatCard title="Comissão confirmada" value={formatBrl(kpis?.comissaoConfirmada || 0)} icon={Wallet} />
        <GcStatCard title="Previsão comissão" value={formatBrl(kpis?.previsaoComissao || 0)} icon={CalendarClock} />
        <GcStatCard title="Performance" value={formatPct(kpis?.performanceScore || 0)} icon={Gauge} tone={toneFromPct(kpis?.performanceScore || 0)} />
        <GcStatCard title="Crescimento" value={formatPct(kpis?.crescimentoPct || 0)} icon={TrendingUp} tone={(kpis?.crescimentoPct || 0) >= 0 ? 'good' : 'bad'} />
        <GcStatCard title="Conversão" value={formatPct(kpis?.conversaoPct || 0)} icon={Users} onClick={() => onNavigate('gc-pipeline')} />
        <GcStatCard title="Carteira" value={formatPct(kpis?.carteiraScore || 0)} icon={Users} onClick={() => onNavigate('gc-client-health')} />
        <GcStatCard title="Operações (mês)" value={kpis?.operations || 0} icon={Filter} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-slate-900 uppercase text-sm tracking-wide">Top clientes (receita do mês)</h2>
            <button type="button" className="text-xs font-bold text-slate-500 hover:text-slate-800" onClick={() => onNavigate('gc-client-health')}>
              Ver saúde
            </button>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBrl(v)} />
                <Bar
                  dataKey="receita"
                  radius={[8, 8, 0, 0]}
                  cursor="pointer"
                  onClick={(d: any) => d?.id && onNavigate('gc-client-card', d.id)}
                >
                  {chartRevenue.map((entry) => (
                    <Cell key={entry.id} fill="#0f172a" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Clique na barra para abrir a ficha executiva do cliente.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-slate-900 uppercase text-sm tracking-wide">Insights IA</h2>
            <button type="button" className="text-xs font-bold text-amber-700" onClick={() => onNavigate('gc-intelligence')}>
              Centro de inteligência
            </button>
          </div>
          <div className="space-y-3 max-h-80 overflow-auto pr-1">
            {insights.slice(0, 8).map((ins, idx) => (
              <div
                key={`${ins.title}-${idx}`}
                className={`rounded-xl border p-3 ${
                  ins.severity === 'critical'
                    ? 'border-rose-200 bg-rose-50'
                    : ins.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : ins.severity === 'positive'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-sm font-bold text-slate-900">{ins.title}</p>
                <p className="text-xs text-slate-600 mt-1">{ins.detail}</p>
                <ul className="mt-2 space-y-1">
                  {ins.suggested_actions.slice(0, 3).map((a) => (
                    <li key={a} className="text-[11px] text-slate-700">• {a}</li>
                  ))}
                </ul>
              </div>
            ))}
            {!insights.length && (
              <p className="text-sm text-slate-500">Nenhum alerta no momento. Carteira saudável.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-5">
          <h2 className="font-black text-slate-900 uppercase text-sm tracking-wide mb-3">Tendência por cliente</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="crescimento"
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={{ r: 4, cursor: 'pointer' }}
                  activeDot={{
                    r: 6,
                    onClick: (_: any, payload: any) => {
                      const id = payload?.payload?.id;
                      if (id) onNavigate('gc-client-card', id);
                    },
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="font-black text-slate-900 uppercase text-sm tracking-wide">Carteira rápida</h2>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar cliente…"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm w-full sm:w-56"
            />
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-2">Cliente</th>
                  <th>Receita mês</th>
                  {!hideStrategic && <th>Margem</th>}
                  <th>Saúde</th>
                </tr>
              </thead>
              <tbody>
                {filteredHealth.map((h) => (
                  <tr
                    key={h.clientId}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => onNavigate('gc-client-card', h.clientId)}
                  >
                    <td className="py-2.5 font-semibold text-slate-800">{h.clientName}</td>
                    <td>{formatBrl(h.monthlyRevenue)}</td>
                    {!hideStrategic && <td>{formatPct(h.marginPct)}</td>}
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          h.healthScore >= 70
                            ? 'bg-emerald-50 text-emerald-700'
                            : h.healthScore >= 45
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {h.healthScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { id: 'gc-agenda', label: 'Agenda', icon: CalendarClock },
          { id: 'gc-pipeline', label: 'Pipeline', icon: Filter },
          { id: 'gc-goals', label: 'Metas', icon: Target },
          { id: 'gc-intelligence', label: 'Inteligência', icon: Brain },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="flex items-center gap-3 p-4 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            <item.icon className="text-amber-400" size={20} />
            <span className="font-bold text-sm">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default GcDashboard;
