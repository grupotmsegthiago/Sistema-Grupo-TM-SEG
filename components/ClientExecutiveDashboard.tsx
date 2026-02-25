import React, { useMemo, useState, useCallback } from 'react';
import { Mission, MissionStatus } from '../types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, Legend, LabelList
} from 'recharts';
import {
    Activity, Truck, Target, CheckCircle2, XCircle, Calendar, Clock, Shield,
    MapPin, TrendingUp, RefreshCw, BarChart3, Navigation, Flag, Layers
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
    'Em Viagem': '#7c3aed', 'Concluída': '#059669', 'Agendada': '#eab308',
    'Cancelada': '#dc2626', 'Na Origem': '#0891b2', 'Solicitada': '#ec4899',
    'Documentação': '#2563eb', 'Recusada': '#450a0a'
};

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type DashPeriod = 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';
const PERIOD_LABELS: Record<DashPeriod, string> = { TODAY: 'Hoje', WEEK: 'Semana', MONTH: 'Mês', YEAR: 'Ano', CUSTOM: 'Personalizado' };

function getDateRange(period: DashPeriod, cs: string, ce: string): [Date, Date] {
    const now = new Date();
    const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const eod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    switch (period) {
        case 'TODAY': return [sod(now), eod(now)];
        case 'WEEK': { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return [sod(s), eod(now)]; }
        case 'MONTH': return [new Date(now.getFullYear(), now.getMonth(), 1), eod(now)];
        case 'YEAR': return [new Date(now.getFullYear(), 0, 1), eod(now)];
        case 'CUSTOM': return [cs ? new Date(cs + 'T00:00:00') : sod(now), ce ? new Date(ce + 'T23:59:59') : eod(now)];
    }
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
        <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-gray-700 max-w-xs">
            <p className="font-black text-gray-300 uppercase tracking-wider mb-1.5 text-[11px] border-b border-gray-700 pb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="font-bold text-[12px] leading-relaxed" style={{ color: p.color || '#fff' }}>
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
    );
};

interface Props {
    missions: Mission[];
}

const TICK = { fontSize: 11, fontWeight: 700, fill: '#64748b' };
const TICK_SM = { fontSize: 10, fontWeight: 700, fill: '#64748b' };
const TICK_LABEL = { fontSize: 10, fontWeight: 800, fill: '#475569' };

const ClientExecutiveDashboard: React.FC<Props> = ({ missions }) => {
    const [period, setPeriod] = useState<DashPeriod>('MONTH');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const handleRefresh = useCallback(() => { setRefreshKey(k => k + 1); setLastUpdate(new Date()); }, []);

    const filtered = useMemo(() => {
        const [start, end] = getDateRange(period, customStart, customEnd);
        return missions.filter(m => {
            const d = new Date(m.startTime || m.createdAt);
            return d >= start && d <= end;
        });
    }, [missions, period, customStart, customEnd, refreshKey]);

    const kpis = useMemo(() => {
        const total = filtered.length;
        const completed = filtered.filter(m => m.status === MissionStatus.COMPLETED).length;
        const inTransit = filtered.filter(m => m.status === MissionStatus.IN_TRANSIT).length;
        const scheduled = filtered.filter(m => m.status === MissionStatus.SCHEDULED).length;
        const cancelled = filtered.filter(m => m.status === MissionStatus.CANCELLED).length;
        const refused = filtered.filter(m => m.status === MissionStatus.REFUSED).length;
        const active = filtered.filter(m => ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length;
        const efficiency = total > 0 ? Math.round((completed / Math.max(1, total - refused)) * 100) : 0;
        const totalKm = filtered.reduce((s, m) => s + (m.totalDistance || 0), 0);
        return { total, completed, inTransit, scheduled, cancelled, refused, active, efficiency, totalKm };
    }, [filtered]);

    const dailyData = useMemo(() => {
        const [start, end] = getDateRange(period, customStart, customEnd);
        const days: Record<string, { dia: string; missoes: number }> = {};
        const cur = new Date(start);
        while (cur <= end) {
            const key = `${cur.getDate().toString().padStart(2, '0')}/${(cur.getMonth() + 1).toString().padStart(2, '0')}`;
            days[key] = { dia: key, missoes: 0 };
            cur.setDate(cur.getDate() + 1);
        }
        filtered.forEach(m => {
            const d = new Date(m.startTime || m.createdAt);
            const key = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            if (days[key]) days[key].missoes++;
        });
        return Object.values(days);
    }, [filtered, period, customStart, customEnd]);

    const cumulativeData = useMemo(() => {
        let acc = 0;
        return dailyData.map(d => { acc += d.missoes; return { dia: d.dia, acumulado: acc }; });
    }, [dailyData]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach(m => {
            const label = m.status === MissionStatus.IN_TRANSIT ? 'Em Viagem' :
                          m.status === MissionStatus.COMPLETED ? 'Concluída' :
                          m.status === MissionStatus.SCHEDULED ? 'Agendada' :
                          m.status === MissionStatus.CANCELLED ? 'Cancelada' :
                          m.status === MissionStatus.ORIGIN ? 'Na Origem' :
                          m.status === MissionStatus.SOLICITED ? 'Solicitada' :
                          m.status === MissionStatus.DOCUMENTATION ? 'Documentação' :
                          m.status === MissionStatus.REFUSED ? 'Recusada' : m.status;
            counts[label] = (counts[label] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#94a3b8' })).sort((a, b) => b.value - a.value);
    }, [filtered]);

    const typeMix = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach(m => { counts[m.mission_type || 'Caracterizada'] = (counts[m.mission_type || 'Caracterizada'] || 0) + 1; });
        const colors = ['#b91c1c', '#0f172a', '#6366f1', '#0891b2'];
        return Object.entries(counts).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
    }, [filtered]);

    const weekdayData = useMemo(() => {
        const counts = [0, 0, 0, 0, 0, 0, 0];
        filtered.forEach(m => {
            const d = new Date(m.startTime || m.createdAt);
            counts[d.getDay()]++;
        });
        return WEEKDAY_NAMES.map((dia, i) => ({ dia, missoes: counts[i] }));
    }, [filtered]);

    const hourData = useMemo(() => {
        const counts: number[] = new Array(24).fill(0);
        filtered.forEach(m => {
            const d = new Date(m.startTime || m.createdAt);
            counts[d.getHours()]++;
        });
        return counts.map((missoes, h) => ({ hora: `${h.toString().padStart(2, '0')}h`, missoes }));
    }, [filtered]);

    const routeRanking = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach(m => {
            if (m.origin && m.destination) {
                const originShort = (m.origin || '').split(',')[0].split('-')[0].trim().toUpperCase();
                const destShort = (m.destination || '').split(',')[0].split('-')[0].trim().toUpperCase();
                const route = `${originShort} → ${destShort}`;
                counts[route] = (counts[route] || 0) + 1;
            }
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
            .map(([rota, qtd]) => ({ rota: rota.length > 30 ? rota.slice(0, 30) + '…' : rota, qtd }));
    }, [filtered]);

    const distanceRanges = useMemo(() => {
        const ranges = { '< 100 km': 0, '100-300 km': 0, '300-500 km': 0, '500+ km': 0 };
        filtered.forEach(m => {
            const d = m.totalDistance || 0;
            if (d < 100) ranges['< 100 km']++;
            else if (d < 300) ranges['100-300 km']++;
            else if (d < 500) ranges['300-500 km']++;
            else ranges['500+ km']++;
        });
        const colors = ['#2563eb', '#059669', '#d97706', '#dc2626'];
        return Object.entries(ranges).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, color: colors[i] }));
    }, [filtered]);

    const monthlyTrend = useMemo(() => {
        const months: Record<string, number> = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(2)}`;
            months[key] = 0;
        }
        missions.forEach(m => {
            const d = new Date(m.startTime || m.createdAt);
            const key = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(2)}`;
            if (months[key] !== undefined) months[key]++;
        });
        return Object.entries(months).map(([mes, missoes]) => ({ mes, missoes }));
    }, [missions]);

    const efficiencyData = useMemo(() => {
        const data = [];
        const completed = filtered.filter(m => m.status === MissionStatus.COMPLETED).length;
        const cancelled = filtered.filter(m => m.status === MissionStatus.CANCELLED).length;
        const refused = filtered.filter(m => m.status === MissionStatus.REFUSED).length;
        const active = filtered.filter(m => ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length;
        if (completed) data.push({ name: 'Concluídas', value: completed, color: '#059669' });
        if (active) data.push({ name: 'Em Andamento', value: active, color: '#2563eb' });
        if (cancelled) data.push({ name: 'Canceladas', value: cancelled, color: '#d97706' });
        if (refused) data.push({ name: 'Recusadas', value: refused, color: '#dc2626' });
        return data;
    }, [filtered]);

    const vehicleRanking = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach(m => {
            const plate = m.clientVehicle?.plate;
            if (plate) counts[plate] = (counts[plate] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
            .map(([placa, qtd]) => ({ placa, qtd }));
    }, [filtered]);

    const KpiCard = ({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) => (
        <div className={`p-5 rounded-xl border shadow-sm group ${color}`} data-testid={`client-kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-black uppercase tracking-wider opacity-70">{label}</p>
                <Icon size={18} className="opacity-30" />
            </div>
            <h3 className="text-xl md:text-2xl font-black font-mono tracking-tight leading-none">{value}</h3>
            {sub && <p className="text-[10px] font-bold uppercase mt-2 opacity-50">{sub}</p>}
        </div>
    );

    const ChartCard = ({ title, icon: Icon, children, span = 1 }: { title: string; icon: any; children: React.ReactNode; span?: number }) => (
        <div className={`bg-white p-5 rounded-xl border border-gray-200 shadow-sm ${span === 2 ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center gap-2.5 mb-4 pb-2.5 border-b border-gray-100">
                <div className="p-2 bg-red-700 text-white rounded-lg"><Icon size={14} /></div>
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">{title}</h4>
            </div>
            <div className="w-full" style={{ minHeight: 240 }}>{children}</div>
        </div>
    );

    const periodLabel = period === 'CUSTOM' && customStart && customEnd
        ? `${new Date(customStart + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(customEnd + 'T00:00:00').toLocaleDateString('pt-BR')}`
        : PERIOD_LABELS[period];

    return (
        <div className="space-y-5 mb-6 animate-in fade-in duration-500" data-testid="client-executive-dashboard">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-700 text-white rounded-lg"><BarChart3 size={16} /></div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Painel Gerencial</h3>
                        <p className="text-[11px] font-bold text-gray-400">{periodLabel} &middot; Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-gray-100 rounded-lg border border-gray-200 p-0.5">
                        {(Object.keys(PERIOD_LABELS) as DashPeriod[]).map(p => (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={`px-3 py-2 rounded-md text-[11px] font-black uppercase tracking-wide transition-all ${period === p ? 'bg-red-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                data-testid={`client-filter-${p.toLowerCase()}`}
                            >{PERIOD_LABELS[p]}</button>
                        ))}
                    </div>
                    {period === 'CUSTOM' && (
                        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                            <input type="date" className="bg-transparent text-xs font-bold text-gray-700 outline-none" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                            <span className="text-gray-400 text-xs font-bold">a</span>
                            <input type="date" className="bg-transparent text-xs font-bold text-gray-700 outline-none" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                        </div>
                    )}
                    <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-red-800 transition-all active:scale-95" data-testid="client-button-refresh">
                        <RefreshCw size={13} /> Atualizar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total Missões" value={kpis.total.toString()} icon={Activity} color="bg-gray-900 text-white" sub={`${kpis.completed} concluídas`} />
                <KpiCard label="Em Trânsito" value={kpis.inTransit.toString()} icon={Truck} color="bg-white text-gray-900 border-gray-200" sub="Agora em operação" />
                <KpiCard label="Agendadas" value={kpis.scheduled.toString()} icon={Calendar} color="bg-white text-gray-900 border-gray-200" sub="Próximas missões" />
                <KpiCard label="Eficiência" value={`${kpis.efficiency}%`} icon={Target} color="bg-white text-gray-900 border-gray-200" sub={`${Math.round(kpis.totalKm).toLocaleString('pt-BR')} km percorridos`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="Missões por Dia" icon={Calendar} span={2}>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyData} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="dia" tick={TICK_SM} interval={dailyData.length > 15 ? 1 : 0} />
                            <YAxis tick={TICK} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#b91c1c" radius={[4, 4, 0, 0]} barSize={dailyData.length > 20 ? 14 : 22}>
                                <LabelList dataKey="missoes" position="top" style={{ fontSize: 11, fontWeight: 900, fill: '#334155' }} formatter={(v: number) => v > 0 ? v : ''} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <ChartCard title="Distribuição por Status" icon={Flag}>
                    <div className="flex flex-col">
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="value" label={false}>
                                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1 px-2">
                            {statusData.map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                                    <span className="text-[11px] font-bold text-gray-600">{s.name}: <span className="text-gray-900 font-black">{s.value}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>

                <ChartCard title="Mix de Operação" icon={Shield}>
                    <div className="flex flex-col">
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={typeMix} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={4} dataKey="value" label={false}>
                                    {typeMix.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1 px-2">
                            {typeMix.map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                                    <span className="text-[11px] font-bold text-gray-600">{s.name}: <span className="text-gray-900 font-black">{s.value}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>

                <ChartCard title="Eficiência Operacional" icon={CheckCircle2}>
                    <div className="flex flex-col">
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={efficiencyData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="value" label={false}>
                                    {efficiencyData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1 px-2">
                            {efficiencyData.map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                                    <span className="text-[11px] font-bold text-gray-600">{s.name}: <span className="text-gray-900 font-black">{s.value}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>

                <ChartCard title="Top Rotas Mais Frequentes" icon={Navigation}>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={routeRanking} layout="vertical" margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" tick={TICK} allowDecimals={false} />
                            <YAxis dataKey="rota" type="category" tick={TICK_LABEL} width={140} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="qtd" name="Missões" fill="#b91c1c" radius={[0, 6, 6, 0]} barSize={18}>
                                <LabelList dataKey="qtd" position="right" style={{ fontSize: 13, fontWeight: 900, fill: '#1e293b' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Veículos Mais Escoltados" icon={Truck}>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={vehicleRanking} layout="vertical" margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" tick={TICK} allowDecimals={false} />
                            <YAxis dataKey="placa" type="category" tick={TICK_LABEL} width={100} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="qtd" name="Missões" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={18}>
                                <LabelList dataKey="qtd" position="right" style={{ fontSize: 13, fontWeight: 900, fill: '#1e293b' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Faixas de Distância" icon={MapPin}>
                    <div className="flex flex-col">
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={distanceRanges} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={4} dataKey="value" label={false}>
                                    {distanceRanges.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1 px-2">
                            {distanceRanges.map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                                    <span className="text-[11px] font-bold text-gray-600">{s.name}: <span className="text-gray-900 font-black">{s.value}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>

                <ChartCard title="Demanda por Dia da Semana" icon={Layers}>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={weekdayData} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="dia" tick={TICK} />
                            <YAxis tick={TICK} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#0891b2" radius={[4, 4, 0, 0]} barSize={30}>
                                <LabelList dataKey="missoes" position="top" style={{ fontSize: 12, fontWeight: 900, fill: '#334155' }} formatter={(v: number) => v > 0 ? v : ''} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Horário de Pico (Agendamento)" icon={Clock}>
                    <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={hourData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="hora" tick={TICK_SM} interval={2} />
                            <YAxis tick={TICK} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <defs>
                                <linearGradient id="gradHour" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.03} />
                                </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="missoes" name="Missões" stroke="#7c3aed" strokeWidth={3} fill="url(#gradHour)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Evolução Mensal (6 Meses)" icon={TrendingUp}>
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={monthlyTrend} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="mes" tick={TICK} />
                            <YAxis tick={TICK} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#059669" radius={[4, 4, 0, 0]} barSize={30}>
                                <LabelList dataKey="missoes" position="top" style={{ fontSize: 12, fontWeight: 900, fill: '#334155' }} />
                            </Bar>
                            <Line type="monotone" dataKey="missoes" stroke="#dc2626" strokeWidth={2} dot={{ r: 4, fill: '#dc2626' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    );
};

export default React.memo(ClientExecutiveDashboard);
