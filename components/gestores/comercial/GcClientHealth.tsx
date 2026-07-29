import React, { useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import GcPageHeader from './shared/GcPageHeader';
import { formatBrl, formatPct } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';

interface Props {
  onNavigate: (screen: string, id?: string) => void;
}

type TopKey = 'topRevenue' | 'topProfit' | 'topMargin' | 'topGrowth' | 'topDrop' | 'topRentabilidade';

const TABS: Array<{ key: TopKey; label: string }> = [
  { key: 'topRevenue', label: 'Top Receita' },
  { key: 'topProfit', label: 'Top Lucro' },
  { key: 'topMargin', label: 'Top Margem' },
  { key: 'topGrowth', label: 'Top Crescimento' },
  { key: 'topDrop', label: 'Top Queda' },
  { key: 'topRentabilidade', label: 'Top Rentabilidade' },
];

const GcClientHealth: React.FC<Props> = ({ onNavigate }) => {
  const { health, tops, loading, hideStrategic } = useGcData();
  const [tab, setTab] = useState<TopKey>('topRevenue');
  const [q, setQ] = useState('');

  const visibleTabs = hideStrategic
    ? TABS.filter((t) => !['topProfit', 'topMargin', 'topRentabilidade'].includes(t.key))
    : TABS;

  const chartData = useMemo(() => {
    const rows = tops[tab] || [];
    return rows.map((h) => ({
      id: h.clientId,
      name: h.clientName.length > 14 ? `${h.clientName.slice(0, 14)}…` : h.clientName,
      value:
        tab === 'topMargin' || tab === 'topRentabilidade' || tab === 'topGrowth' || tab === 'topDrop'
          ? tab === 'topMargin' || tab === 'topRentabilidade'
            ? h.marginPct
            : h.trendPct
          : tab === 'topProfit'
            ? h.netProfit
            : h.monthlyRevenue,
    }));
  }, [tops, tab]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return health;
    return health.filter((h) => h.clientName.toLowerCase().includes(query));
  }, [health, q]);

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto">
      <GcPageHeader
        title="Saúde dos Clientes"
        subtitle="Fichas executivas sincronizadas com missões e faturamento reais"
        icon={HeartPulse}
        actions={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar…"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              tab === t.key ? 'bg-slate-900 text-amber-300' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 h-72">
        {loading ? (
          <div className="h-full animate-pulse bg-slate-100 rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar
                dataKey="value"
                fill="#0f172a"
                radius={[8, 8, 0, 0]}
                cursor="pointer"
                onClick={(d: any) => d?.id && onNavigate('gc-client-card', d.id)}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Receita mês</th>
              <th className="text-left p-3">Receita ano</th>
              {!hideStrategic && <th className="text-left p-3">Margem</th>}
              <th className="text-left p-3">Ops</th>
              <th className="text-left p-3">Tendência</th>
              <th className="text-left p-3">Saúde</th>
              <th className="text-left p-3">Sem faturar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr
                key={h.clientId}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => onNavigate('gc-client-card', h.clientId)}
              >
                <td className="p-3 font-semibold">{h.clientName}</td>
                <td className="p-3">{formatBrl(h.monthlyRevenue)}</td>
                <td className="p-3">{formatBrl(h.yearlyRevenue)}</td>
                {!hideStrategic && <td className="p-3">{formatPct(h.marginPct)}</td>}
                <td className="p-3">{h.operations}</td>
                <td className="p-3">
                  <span className={h.trend === 'up' ? 'text-emerald-600' : h.trend === 'down' ? 'text-rose-600' : 'text-slate-500'}>
                    {formatPct(h.trendPct)}
                  </span>
                </td>
                <td className="p-3 font-bold">{h.healthScore}</td>
                <td className="p-3">{h.daysWithoutRevenue === 999 ? '—' : `${h.daysWithoutRevenue}d`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GcClientHealth;
