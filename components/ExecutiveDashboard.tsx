import React, { useMemo, useState, useCallback } from 'react';
import { Mission, MissionStatus, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { calculateMissionFinancials } from '../lib/financialUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, Legend
} from 'recharts';
import {
    Activity, TrendingUp, TrendingDown, Wallet, Percent, Truck, Target,
    DollarSign, Users, Calendar, CheckCircle2, XCircle, Clock,
    Trophy, Briefcase, Shield, BarChart4, PieChart as PieChartIcon, Lock, RefreshCw
} from 'lucide-react';

const COLORS = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#ec4899', '#0891b2', '#84cc16'];

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatCompact = (val: number) => {
    if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}K`;
    return formatCurrency(val);
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
        <div className="bg-gray-900 text-white p-3 rounded-xl shadow-2xl border border-gray-700 text-xs">
            <p className="font-black text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="font-bold" style={{ color: p.color }}>
                    {p.name}: {typeof p.value === 'number' && p.value > 100 ? formatCurrency(p.value) : p.value}
                </p>
            ))}
        </div>
    );
};

interface Props {
    missions: Mission[];
    isDirector: boolean;
    clientTables: ClientPriceTable[];
    providerTables: ProviderCostTable[];
    clientsData: Client[];
    currentTime: Date;
}

const ExecutiveDashboard: React.FC<Props> = ({ missions, isDirector, clientTables, providerTables, clientsData, currentTime }) => {

    const [refreshKey, setRefreshKey] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const handleRefresh = useCallback(() => {
        setRefreshKey(k => k + 1);
        setLastUpdate(new Date());
    }, []);

    const missionFinancials = useMemo(() => {
        const snapshotTime = new Date();
        return missions.map(m => {
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
    }, [missions, clientTables, providerTables, clientsData, refreshKey]);

    const totals = useMemo(() => {
        const validMissions = missionFinancials.filter(m => m.status !== MissionStatus.REFUSED);
        const totalRev = validMissions.reduce((a, m) => a + m.rev, 0);
        const totalCost = validMissions.reduce((a, m) => a + m.cost, 0);
        const totalProfit = totalRev - totalCost;
        const margin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
        const completed = validMissions.filter(m => m.status === MissionStatus.COMPLETED).length;
        const inTransit = validMissions.filter(m => m.status === MissionStatus.IN_TRANSIT).length;
        const cancelled = validMissions.filter(m => m.status === MissionStatus.CANCELLED).length;
        const total = validMissions.length;
        const avgTicket = total > 0 ? totalRev / total : 0;
        const pendingAudit = validMissions.filter(m => !m.billing_approved && m.status === MissionStatus.COMPLETED).length;
        return { totalRev, totalCost, totalProfit, margin, completed, inTransit, cancelled, total, avgTicket, pendingAudit };
    }, [missionFinancials]);

    const dailyData = useMemo(() => {
        const days: Record<string, { day: string, missoes: number, faturamento: number, custo: number, lucro: number }> = {};
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${d.toString().padStart(2, '0')}`;
            days[key] = { day: key, missoes: 0, faturamento: 0, custo: 0, lucro: 0 };
        }

        missionFinancials.forEach(m => {
            if (m.status === MissionStatus.REFUSED) return;
            const date = new Date(m.startTime || m.createdAt);
            if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
                const key = date.getDate().toString().padStart(2, '0');
                if (days[key]) {
                    days[key].missoes++;
                    days[key].faturamento += m.rev;
                    days[key].custo += m.cost;
                    days[key].lucro += m.profit;
                }
            }
        });

        return Object.values(days).sort((a, b) => parseInt(a.day) - parseInt(b.day));
    }, [missionFinancials]);

    const cumulativeRevenue = useMemo(() => {
        let acc = 0;
        return dailyData.map(d => {
            acc += d.faturamento;
            return { day: d.day, acumulado: acc };
        });
    }, [dailyData]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        missions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
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
            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
            .sort((a, b) => b.value - a.value);
    }, [missions]);

    const topClientsByVolume = useMemo(() => {
        const counts: Record<string, number> = {};
        missions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            counts[m.client] = (counts[m.client] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([name, missoes]) => ({ name: name.length > 18 ? name.substring(0, 18) + '...' : name, missoes }));
    }, [missions]);

    const topClientsByRevenue = useMemo(() => {
        const revs: Record<string, number> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            revs[m.client] = (revs[m.client] || 0) + m.rev;
        });
        return Object.entries(revs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([name, faturamento]) => ({ name: name.length > 18 ? name.substring(0, 18) + '...' : name, faturamento }));
    }, [missionFinancials]);

    const typeData = useMemo(() => {
        const counts: Record<string, number> = {};
        missions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            const type = (m.mission_type || 'Caracterizada');
            counts[type] = (counts[type] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value], i) => ({
            name, value, color: i === 0 ? '#dc2626' : i === 1 ? '#0f172a' : '#6366f1'
        }));
    }, [missions]);

    const providerCosts = useMemo(() => {
        const costs: Record<string, { custo: number, qtd: number }> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED && m.provider).forEach(m => {
            if (!costs[m.provider]) costs[m.provider] = { custo: 0, qtd: 0 };
            costs[m.provider].custo += m.cost;
            costs[m.provider].qtd++;
        });
        return Object.entries(costs)
            .sort((a, b) => b[1].custo - a[1].custo)
            .slice(0, 7)
            .map(([name, data]) => ({
                name: name.length > 18 ? name.substring(0, 18) + '...' : name,
                custo: data.custo,
                missoes: data.qtd
            }));
    }, [missionFinancials]);

    const clientMargins = useMemo(() => {
        const data: Record<string, { rev: number, cost: number }> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            if (!data[m.client]) data[m.client] = { rev: 0, cost: 0 };
            data[m.client].rev += m.rev;
            data[m.client].cost += m.cost;
        });
        return Object.entries(data)
            .filter(([_, d]) => d.rev > 0)
            .map(([name, d]) => ({
                name: name.length > 18 ? name.substring(0, 18) + '...' : name,
                margem: parseFloat(((d.rev - d.cost) / d.rev * 100).toFixed(1))
            }))
            .sort((a, b) => b.margem - a.margem)
            .slice(0, 7);
    }, [missionFinancials]);

    const KpiCard = ({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) => (
        <div className={`p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${color}`} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase tracking-[0.15em] opacity-60">{label}</p>
                <Icon size={16} className="opacity-40 group-hover:opacity-70 transition-opacity" />
            </div>
            <h3 className="text-xl md:text-2xl font-black font-mono tracking-tighter">{value}</h3>
            {sub && <p className="text-[8px] font-bold uppercase mt-1 opacity-50">{sub}</p>}
        </div>
    );

    const ChartCard = ({ title, icon: Icon, children, span = 1 }: { title: string; icon: any; children: React.ReactNode; span?: number }) => (
        <div className={`bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all ${span === 2 ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center gap-2 mb-4 border-b border-gray-50 pb-3">
                <div className="p-2 bg-gray-900 text-white rounded-lg"><Icon size={14} /></div>
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{title}</h4>
            </div>
            <div className="w-full" style={{ minHeight: 200 }}>{children}</div>
        </div>
    );

    const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-gray-800 transition-all shadow-sm hover:shadow-md active:scale-95"
                    data-testid="button-refresh-dashboard"
                >
                    <RefreshCw size={13} />
                    Atualizar
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Volume Total" value={totals.total.toString()} icon={Activity} color="bg-gray-900 text-white" sub={`${totals.completed} concluídas`} />
                <KpiCard label="Em Trânsito" value={totals.inTransit.toString()} icon={Truck} color="bg-white text-gray-900 border-gray-200" sub="Agora em operação" />
                <KpiCard label="Canceladas" value={totals.cancelled.toString()} icon={XCircle} color="bg-white text-gray-900 border-gray-200" sub="Incluídas no cálculo" />
                <KpiCard label="Eficiência" value={`${totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0}%`} icon={Target} color="bg-white text-gray-900 border-gray-200" sub={`${totals.pendingAudit} pendentes auditoria`} />
            </div>

            {isDirector && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Faturamento" value={formatCompact(totals.totalRev)} icon={TrendingUp} color="bg-white text-green-700 border-green-100 hover:border-green-300" />
                    <KpiCard label="Custo Fornecedor" value={formatCompact(totals.totalCost)} icon={TrendingDown} color="bg-white text-red-700 border-red-100 hover:border-red-300" />
                    <KpiCard label="Lucro Real" value={formatCompact(totals.totalProfit)} icon={Wallet} color={`bg-white border-blue-100 hover:border-blue-300 ${totals.totalProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`} />
                    <KpiCard label="Lucratividade" value={`${totals.margin.toFixed(1)}%`} icon={Percent} color="bg-slate-900 text-white border-slate-800" sub={`Ticket médio: ${formatCompact(totals.avgTicket)}`} />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title={`Missões por Dia — ${monthName}`} icon={Calendar} span={2}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="day" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#dc2626" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {isDirector && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ChartCard title={`Faturamento vs Custo vs Lucro — ${monthName}`} icon={DollarSign} span={2}>
                        <ResponsiveContainer width="100%" height={260}>
                            <ComposedChart data={dailyData} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="day" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                                <Bar dataKey="faturamento" name="Faturamento" fill="#059669" radius={[3, 3, 0, 0]} opacity={0.85} />
                                <Bar dataKey="custo" name="Custo" fill="#dc2626" radius={[3, 3, 0, 0]} opacity={0.65} />
                                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Receita Acumulada no Mês" icon={TrendingUp}>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={cumulativeRevenue} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="day" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                                <Tooltip content={<CustomTooltip />} />
                                <defs>
                                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke="#059669" strokeWidth={2.5} fill="url(#gradRevenue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Margem de Lucro por Cliente" icon={Percent}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={clientMargins} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} width={110} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="margem" name="Margem %" fill="#2563eb" radius={[0, 4, 4, 0]}>
                                    {clientMargins.map((entry, i) => (
                                        <Cell key={i} fill={entry.margem >= 20 ? '#059669' : entry.margem >= 10 ? '#2563eb' : '#dc2626'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ChartCard title="Distribuição por Status" icon={PieChartIcon}>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 8, fontWeight: 700 }}>
                                {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Top Clientes por Volume" icon={Trophy}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={topClientsByVolume} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} width={110} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#dc2626" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {isDirector ? (
                    <ChartCard title="Top Clientes por Faturamento" icon={DollarSign}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={topClientsByRevenue} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => formatCompact(v)} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} width={110} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="faturamento" name="Faturamento" fill="#059669" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ) : (
                    <ChartCard title="Top Clientes por Faturamento" icon={DollarSign}>
                        <div className="flex flex-col items-center justify-center h-full text-gray-300">
                            <Lock size={32} />
                            <span className="text-[9px] font-black uppercase mt-2">Acesso Restrito</span>
                        </div>
                    </ChartCard>
                )}

                <ChartCard title="Mix de Operação" icon={Shield}>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 9, fontWeight: 700 }}>
                                {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                {isDirector ? (
                    <ChartCard title="Custo por Fornecedor" icon={Briefcase}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={providerCosts} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v: number) => formatCompact(v)} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} width={110} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="custo" name="Custo Total" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ) : (
                    <ChartCard title="Custo por Fornecedor" icon={Briefcase}>
                        <div className="flex flex-col items-center justify-center h-full text-gray-300">
                            <Lock size={32} />
                            <span className="text-[9px] font-black uppercase mt-2">Acesso Restrito</span>
                        </div>
                    </ChartCard>
                )}

                <ChartCard title="Eficiência Operacional" icon={CheckCircle2}>
                    {(() => {
                        const completed = missions.filter(m => m.status === MissionStatus.COMPLETED).length;
                        const cancelled = missions.filter(m => m.status === MissionStatus.CANCELLED).length;
                        const refused = missions.filter(m => m.status === MissionStatus.REFUSED).length;
                        const active = missions.filter(m => ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length;
                        const data = [
                            { name: 'Concluídas', value: completed, color: '#059669' },
                            { name: 'Canceladas', value: cancelled, color: '#d97706' },
                            { name: 'Recusadas', value: refused, color: '#dc2626' },
                            { name: 'Em Andamento', value: active, color: '#2563eb' }
                        ].filter(d => d.value > 0);
                        return (
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 8, fontWeight: 700 }}>
                                        {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        );
                    })()}
                </ChartCard>
            </div>
        </div>
    );
};

export default ExecutiveDashboard;
