import React, { useMemo, useState, useCallback } from 'react';
import { Mission, MissionStatus, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { calculateMissionFinancials } from '../lib/financialUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, Legend, LabelList
} from 'recharts';
import {
    Activity, TrendingUp, TrendingDown, Wallet, Percent, Truck, Target,
    DollarSign, Calendar, CheckCircle2, XCircle,
    Trophy, Briefcase, Shield, PieChart as PieChartIcon, Lock, RefreshCw
} from 'lucide-react';

const COLORS = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#ec4899', '#0891b2', '#84cc16'];
const STATUS_COLORS: Record<string, string> = {
    'Concluída': '#059669', 'Em Viagem': '#2563eb', 'Agendada': '#7c3aed',
    'Cancelada': '#d97706', 'Na Origem': '#0891b2', 'Solicitada': '#ec4899',
    'Documentação': '#84cc16', 'Pendente': '#94a3b8'
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(2)}M`;
    if (Math.abs(v) >= 10000) return `R$ ${(v / 1000).toFixed(1)}K`;
    return fmtBRL(v);
};

type DashPeriod = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

const PERIOD_LABELS: Record<DashPeriod, string> = {
    TODAY: 'Hoje', YESTERDAY: 'Ontem', WEEK: 'Semana', MONTH: 'Mês', YEAR: 'Ano', CUSTOM: 'Personalizado'
};

function getDateRange(period: DashPeriod, customStart: string, customEnd: string): [Date, Date] {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    switch (period) {
        case 'TODAY': return [startOfDay(now), endOfDay(now)];
        case 'YESTERDAY': { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)]; }
        case 'WEEK': { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return [startOfDay(s), endOfDay(now)]; }
        case 'MONTH': return [new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0), endOfDay(now)];
        case 'YEAR': return [new Date(now.getFullYear(), 0, 1, 0, 0, 0), endOfDay(now)];
        case 'CUSTOM': {
            const s = customStart ? new Date(customStart + 'T00:00:00') : startOfDay(now);
            const e = customEnd ? new Date(customEnd + 'T23:59:59') : endOfDay(now);
            return [s, e];
        }
    }
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
        <div className="bg-gray-900 text-white p-3 rounded-lg shadow-2xl border border-gray-700 text-xs max-w-xs">
            <p className="font-black text-gray-400 uppercase tracking-wider mb-1 text-[9px]">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="font-bold text-[10px]" style={{ color: p.color || '#fff' }}>
                    {p.name}: {typeof p.value === 'number' ? (p.value > 50 || p.name?.includes('R$') || p.name?.includes('aturamento') || p.name?.includes('usto') || p.name?.includes('ucro') || p.name?.includes('cumulado') ? fmtBRL(p.value) : p.value) : p.value}
                </p>
            ))}
        </div>
    );
};

const renderBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (!value || value === 0) return null;
    return <text x={x + width + 4} y={y + height / 2} fill="#64748b" fontSize={9} fontWeight={800} dominantBaseline="middle">{value}</text>;
};

const renderBarLabelBRL = (props: any) => {
    const { x, y, width, height, value } = props;
    if (!value || value === 0) return null;
    return <text x={x + width + 4} y={y + height / 2} fill="#64748b" fontSize={8} fontWeight={800} dominantBaseline="middle">{fmtShort(value)}</text>;
};

const renderBarLabelPercent = (props: any) => {
    const { x, y, width, height, value } = props;
    if (value === undefined || value === null) return null;
    return <text x={x + width + 4} y={y + height / 2} fill="#64748b" fontSize={9} fontWeight={800} dominantBaseline="middle">{value}%</text>;
};

const renderTopLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value === 0) return null;
    return <text x={x + width / 2} y={y - 6} fill="#64748b" fontSize={9} fontWeight={800} textAnchor="middle">{value}</text>;
};

interface Props {
    missions: Mission[];
    isDirector: boolean;
    clientTables: ClientPriceTable[];
    providerTables: ProviderCostTable[];
    clientsData: Client[];
    currentTime: Date;
}

const ExecutiveDashboard: React.FC<Props> = ({ missions, isDirector, clientTables, providerTables, clientsData }) => {

    const [refreshKey, setRefreshKey] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [period, setPeriod] = useState<DashPeriod>('MONTH');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const handleRefresh = useCallback(() => {
        setRefreshKey(k => k + 1);
        setLastUpdate(new Date());
    }, []);

    const filteredMissions = useMemo(() => {
        const [start, end] = getDateRange(period, customStart, customEnd);
        return missions.filter(m => {
            const d = new Date(m.startTime || m.createdAt);
            return d >= start && d <= end;
        });
    }, [missions, period, customStart, customEnd, refreshKey]);

    const missionFinancials = useMemo(() => {
        const snapshotTime = new Date();
        return filteredMissions.map(m => {
            if (m.status === MissionStatus.REFUSED) return { ...m, rev: 0, cost: 0, profit: 0 };
            const isTerminal = [MissionStatus.COMPLETED, MissionStatus.CANCELLED].includes(m.status as MissionStatus);
            const isAudited = m.billing_approved;
            let rev = 0, cost = 0;
            if (isTerminal || isAudited) {
                rev = (m.revenue_value || 0) + (m.toll_value || 0);
                cost = (m.cost_value || 0) + (m.toll_value || 0);
            } else {
                const client = clientsData.find(c => c.name === m.client);
                const projected = calculateMissionFinancials(m, clientTables, providerTables, client, snapshotTime);
                rev = projected.client.total;
                cost = projected.provider.total;
            }
            return { ...m, rev, cost, profit: rev - cost };
        });
    }, [filteredMissions, clientTables, providerTables, clientsData, refreshKey]);

    const totals = useMemo(() => {
        const valid = missionFinancials.filter(m => m.status !== MissionStatus.REFUSED);
        const totalRev = valid.reduce((a, m) => a + m.rev, 0);
        const totalCost = valid.reduce((a, m) => a + m.cost, 0);
        const totalProfit = totalRev - totalCost;
        const margin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
        const completed = valid.filter(m => m.status === MissionStatus.COMPLETED).length;
        const inTransit = valid.filter(m => m.status === MissionStatus.IN_TRANSIT).length;
        const cancelled = valid.filter(m => m.status === MissionStatus.CANCELLED).length;
        const total = valid.length;
        const avgTicket = total > 0 ? totalRev / total : 0;
        const pendingAudit = valid.filter(m => !m.billing_approved && m.status === MissionStatus.COMPLETED).length;
        return { totalRev, totalCost, totalProfit, margin, completed, inTransit, cancelled, total, avgTicket, pendingAudit };
    }, [missionFinancials]);

    const dailyData = useMemo(() => {
        const [start, end] = getDateRange(period, customStart, customEnd);
        const days: Record<string, { day: string, missoes: number, faturamento: number, custo: number, lucro: number }> = {};
        const current = new Date(start);
        while (current <= end) {
            const key = `${current.getDate().toString().padStart(2, '0')}/${(current.getMonth() + 1).toString().padStart(2, '0')}`;
            days[key] = { day: key, missoes: 0, faturamento: 0, custo: 0, lucro: 0 };
            current.setDate(current.getDate() + 1);
        }
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            const date = new Date(m.startTime || m.createdAt);
            const key = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            if (days[key]) {
                days[key].missoes++;
                days[key].faturamento += m.rev;
                days[key].custo += m.cost;
                days[key].lucro += m.profit;
            }
        });
        return Object.values(days);
    }, [missionFinancials, period, customStart, customEnd]);

    const cumulativeRevenue = useMemo(() => {
        let acc = 0;
        return dailyData.map(d => { acc += d.faturamento; return { day: d.day, acumulado: acc }; });
    }, [dailyData]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMissions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            const label = m.status === MissionStatus.IN_TRANSIT ? 'Em Viagem' :
                          m.status === MissionStatus.COMPLETED ? 'Concluída' :
                          m.status === MissionStatus.SCHEDULED ? 'Agendada' :
                          m.status === MissionStatus.CANCELLED ? 'Cancelada' :
                          m.status === MissionStatus.ORIGIN ? 'Na Origem' :
                          m.status === MissionStatus.SOLICITED ? 'Solicitada' :
                          m.status === MissionStatus.DOCUMENTATION ? 'Documentação' :
                          m.status === MissionStatus.PENDING ? 'Pendente' : m.status;
            counts[label] = (counts[label] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#94a3b8' }))
            .sort((a, b) => b.value - a.value);
    }, [filteredMissions]);

    const topClientsByVolume = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMissions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => { counts[m.client] = (counts[m.client] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
            .map(([name, missoes]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, missoes }));
    }, [filteredMissions]);

    const topClientsByRevenue = useMemo(() => {
        const revs: Record<string, number> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => { revs[m.client] = (revs[m.client] || 0) + m.rev; });
        return Object.entries(revs).sort((a, b) => b[1] - a[1]).slice(0, 7)
            .map(([name, faturamento]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, faturamento: Math.round(faturamento * 100) / 100 }));
    }, [missionFinancials]);

    const typeData = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMissions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => { counts[m.mission_type || 'Caracterizada'] = (counts[m.mission_type || 'Caracterizada'] || 0) + 1; });
        return Object.entries(counts).map(([name, value], i) => ({
            name, value, color: i === 0 ? '#dc2626' : i === 1 ? '#0f172a' : '#6366f1'
        }));
    }, [filteredMissions]);

    const providerCosts = useMemo(() => {
        const costs: Record<string, { custo: number, qtd: number }> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED && m.provider).forEach(m => {
            if (!costs[m.provider]) costs[m.provider] = { custo: 0, qtd: 0 };
            costs[m.provider].custo += m.cost;
            costs[m.provider].qtd++;
        });
        return Object.entries(costs).sort((a, b) => b[1].custo - a[1].custo).slice(0, 7)
            .map(([name, data]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, custo: Math.round(data.custo * 100) / 100, missoes: data.qtd }));
    }, [missionFinancials]);

    const clientMargins = useMemo(() => {
        const data: Record<string, { rev: number, cost: number }> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            if (!data[m.client]) data[m.client] = { rev: 0, cost: 0 };
            data[m.client].rev += m.rev;
            data[m.client].cost += m.cost;
        });
        return Object.entries(data).filter(([_, d]) => d.rev > 0)
            .map(([name, d]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, margem: parseFloat(((d.rev - d.cost) / d.rev * 100).toFixed(1)) }))
            .sort((a, b) => b.margem - a.margem).slice(0, 7);
    }, [missionFinancials]);

    const efficiencyData = useMemo(() => {
        const completed = filteredMissions.filter(m => m.status === MissionStatus.COMPLETED).length;
        const cancelled = filteredMissions.filter(m => m.status === MissionStatus.CANCELLED).length;
        const refused = filteredMissions.filter(m => m.status === MissionStatus.REFUSED).length;
        const active = filteredMissions.filter(m => ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length;
        return [
            { name: 'Concluídas', value: completed, color: '#059669' },
            { name: 'Canceladas', value: cancelled, color: '#d97706' },
            { name: 'Recusadas', value: refused, color: '#dc2626' },
            { name: 'Em Andamento', value: active, color: '#2563eb' }
        ].filter(d => d.value > 0);
    }, [filteredMissions]);

    const KpiCard = ({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) => (
        <div className={`p-4 rounded-xl border shadow-sm group ${color}`} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
            <div className="flex items-center justify-between mb-1">
                <p className="text-[8px] font-black uppercase tracking-[0.15em] opacity-60">{label}</p>
                <Icon size={14} className="opacity-30" />
            </div>
            <h3 className="text-lg md:text-xl font-black font-mono tracking-tight leading-none">{value}</h3>
            {sub && <p className="text-[8px] font-bold uppercase mt-1.5 opacity-40">{sub}</p>}
        </div>
    );

    const ChartCard = ({ title, icon: Icon, children, span = 1 }: { title: string; icon: any; children: React.ReactNode; span?: number }) => (
        <div className={`bg-white p-4 rounded-xl border border-gray-100 shadow-sm ${span === 2 ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                <div className="p-1.5 bg-gray-900 text-white rounded-md"><Icon size={12} /></div>
                <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">{title}</h4>
            </div>
            <div className="w-full" style={{ minHeight: 200 }}>{children}</div>
        </div>
    );

    const periodLabel = period === 'CUSTOM' && customStart && customEnd
        ? `${new Date(customStart + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(customEnd + 'T00:00:00').toLocaleDateString('pt-BR')}`
        : PERIOD_LABELS[period];

    const pieLabelFn = ({ name, value, percent }: any) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`;

    return (
        <div className="space-y-5">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-gray-900 text-white rounded-md"><Activity size={14} /></div>
                    <div>
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">Dashboard Executivo</h3>
                        <p className="text-[8px] font-bold text-gray-400 uppercase">{periodLabel} &middot; Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-gray-50 rounded-lg border border-gray-200 p-0.5">
                        {(Object.keys(PERIOD_LABELS) as DashPeriod[]).map(p => (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${period === p ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                data-testid={`filter-${p.toLowerCase()}`}
                            >{PERIOD_LABELS[p]}</button>
                        ))}
                    </div>
                    {period === 'CUSTOM' && (
                        <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-200">
                            <input type="date" className="bg-transparent text-[10px] font-bold text-gray-700 outline-none" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                            <span className="text-gray-300 text-[9px]">a</span>
                            <input type="date" className="bg-transparent text-[10px] font-bold text-gray-700 outline-none" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                        </div>
                    )}
                    <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-gray-800 transition-all active:scale-95" data-testid="button-refresh-dashboard">
                        <RefreshCw size={11} /> Atualizar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total Missões" value={totals.total.toString()} icon={Activity} color="bg-gray-900 text-white" sub={`${totals.completed} concluídas`} />
                <KpiCard label="Em Trânsito" value={totals.inTransit.toString()} icon={Truck} color="bg-white text-gray-900 border-gray-200" sub="Em operação agora" />
                <KpiCard label="Canceladas" value={totals.cancelled.toString()} icon={XCircle} color="bg-white text-gray-900 border-gray-200" sub="Incluídas no faturamento" />
                <KpiCard label="Eficiência" value={`${totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0}%`} icon={Target} color="bg-white text-gray-900 border-gray-200" sub={`${totals.pendingAudit} sem auditoria`} />
            </div>

            {isDirector && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard label="Faturamento" value={fmtBRL(totals.totalRev)} icon={TrendingUp} color="bg-emerald-50 text-emerald-800 border-emerald-200" />
                    <KpiCard label="Custo" value={fmtBRL(totals.totalCost)} icon={TrendingDown} color="bg-red-50 text-red-800 border-red-200" />
                    <KpiCard label="Lucro" value={fmtBRL(totals.totalProfit)} icon={Wallet} color={`${totals.totalProfit >= 0 ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-red-50 text-red-800 border-red-200'}`} />
                    <KpiCard label="Margem" value={`${totals.margin.toFixed(1)}%`} icon={Percent} color="bg-slate-900 text-white border-slate-800" sub={`Ticket: ${fmtBRL(totals.avgTicket)}`} />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Missões por Dia" icon={Calendar} span={2}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dailyData} margin={{ top: 20, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="day" tick={{ fontSize: 8, fontWeight: 700, fill: '#94a3b8' }} interval={dailyData.length > 15 ? 1 : 0} />
                            <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#dc2626" radius={[4, 4, 0, 0]}>
                                <LabelList dataKey="missoes" position="top" style={{ fontSize: 8, fontWeight: 800, fill: '#64748b' }} formatter={(v: number) => v > 0 ? v : ''} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {isDirector && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartCard title="Faturamento vs Custo vs Lucro" icon={DollarSign} span={2}>
                        <ResponsiveContainer width="100%" height={260}>
                            <ComposedChart data={dailyData} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="day" tick={{ fontSize: 8, fontWeight: 700, fill: '#94a3b8' }} interval={dailyData.length > 15 ? 1 : 0} />
                                <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => fmtShort(v)} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 9, fontWeight: 800 }} />
                                <Bar dataKey="faturamento" name="Faturamento" fill="#059669" radius={[3, 3, 0, 0]} opacity={0.85} />
                                <Bar dataKey="custo" name="Custo" fill="#dc2626" radius={[3, 3, 0, 0]} opacity={0.65} />
                                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Receita Acumulada" icon={TrendingUp}>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={cumulativeRevenue} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="day" tick={{ fontSize: 8, fontWeight: 700, fill: '#94a3b8' }} interval={cumulativeRevenue.length > 15 ? 1 : 0} />
                                <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => fmtShort(v)} />
                                <Tooltip content={<CustomTooltip />} />
                                <defs>
                                    <linearGradient id="gradRevAcc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke="#059669" strokeWidth={2.5} fill="url(#gradRevAcc)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Margem de Lucro por Cliente" icon={Percent}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={clientMargins} layout="vertical" margin={{ top: 5, right: 45, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} width={120} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="margem" name="Margem %" fill="#2563eb" radius={[0, 4, 4, 0]}>
                                    {clientMargins.map((entry, i) => (
                                        <Cell key={i} fill={entry.margem >= 20 ? '#059669' : entry.margem >= 10 ? '#2563eb' : '#dc2626'} />
                                    ))}
                                    <LabelList content={renderBarLabelPercent} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ChartCard title="Distribuição por Status" icon={PieChartIcon}>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
                                label={pieLabelFn} labelLine={false} style={{ fontSize: 7, fontWeight: 800 }}>
                                {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Top Clientes por Volume" icon={Trophy}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={topClientsByVolume} layout="vertical" margin={{ top: 5, right: 35, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 7, fontWeight: 700, fill: '#64748b' }} width={120} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#dc2626" radius={[0, 4, 4, 0]}>
                                <LabelList content={renderBarLabel} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {isDirector ? (
                    <ChartCard title="Top Clientes por Faturamento" icon={DollarSign}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={topClientsByRevenue} layout="vertical" margin={{ top: 5, right: 55, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => fmtShort(v)} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 7, fontWeight: 700, fill: '#64748b' }} width={120} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="faturamento" name="Faturamento" fill="#059669" radius={[0, 4, 4, 0]}>
                                    <LabelList content={renderBarLabelBRL} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ) : (
                    <ChartCard title="Top Clientes por Faturamento" icon={DollarSign}>
                        <div className="flex flex-col items-center justify-center h-full text-gray-300"><Lock size={28} /><span className="text-[8px] font-black uppercase mt-2">Restrito</span></div>
                    </ChartCard>
                )}

                <ChartCard title="Mix de Operação" icon={Shield}>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={typeData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value"
                                label={pieLabelFn} labelLine={false} style={{ fontSize: 8, fontWeight: 800 }}>
                                {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                {isDirector ? (
                    <ChartCard title="Custo por Fornecedor" icon={Briefcase}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={providerCosts} layout="vertical" margin={{ top: 5, right: 55, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => fmtShort(v)} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 7, fontWeight: 700, fill: '#64748b' }} width={120} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="custo" name="Custo Total" fill="#7c3aed" radius={[0, 4, 4, 0]}>
                                    <LabelList content={renderBarLabelBRL} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ) : (
                    <ChartCard title="Custo por Fornecedor" icon={Briefcase}>
                        <div className="flex flex-col items-center justify-center h-full text-gray-300"><Lock size={28} /><span className="text-[8px] font-black uppercase mt-2">Restrito</span></div>
                    </ChartCard>
                )}

                <ChartCard title="Eficiência Operacional" icon={CheckCircle2}>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={efficiencyData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
                                label={pieLabelFn} labelLine={false} style={{ fontSize: 7, fontWeight: 800 }}>
                                {efficiencyData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    );
};

export default React.memo(ExecutiveDashboard, (prev, next) => {
    return prev.missions === next.missions &&
           prev.isDirector === next.isDirector &&
           prev.clientTables === next.clientTables &&
           prev.providerTables === next.providerTables &&
           prev.clientsData === next.clientsData;
});
