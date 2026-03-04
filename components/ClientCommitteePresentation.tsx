import React, { useMemo, useState, useRef } from 'react';
import { Mission, MissionStatus } from '../types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, Legend, LabelList,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, RadialBarChart, RadialBar
} from 'recharts';
import {
    Activity, Truck, CheckCircle2, XCircle, Calendar, Clock, Shield,
    MapPin, TrendingUp, BarChart3, Navigation, Flag, Layers, Award,
    Target, Zap, Users, Globe, ArrowRight, ChevronLeft, ChevronRight,
    Download, Presentation, FileText, Star, AlertTriangle, ArrowUpRight,
    ArrowDownRight, Minus, Route, Timer, Package, Eye
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const BRAND_PRIMARY = '#9E0032';
const BRAND_NAVY = '#021D49';
const BRAND_DARK = '#0f172a';
const BRAND_GRADIENT = 'linear-gradient(135deg, #021D49 0%, #0f172a 50%, #1e1b4b 100%)';
const CHART_COLORS = ['#9E0032', '#021D49', '#6d28d9', '#059669', '#d97706', '#0891b2', '#dc2626', '#2563eb'];
const STATUS_MAP: Record<string, { label: string; color: string }> = {
    'Em Viagem': { label: 'Em Viagem', color: '#6d28d9' },
    'Concluída': { label: 'Concluída', color: '#059669' },
    'Agendada': { label: 'Agendada', color: '#d97706' },
    'Cancelada': { label: 'Cancelada', color: '#dc2626' },
    'Na Origem': { label: 'Na Origem', color: '#0891b2' },
    'Solicitada': { label: 'Solicitada', color: '#ec4899' },
    'Documentação': { label: 'Documentação', color: '#2563eb' },
    'Recusada': { label: 'Recusada', color: '#450a0a' },
    'Pendente': { label: 'Pendente', color: '#f59e0b' }
};

interface Props {
    missions: Mission[];
    clientName?: string;
}

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatNumber = (n: number) => n.toLocaleString('pt-BR');
const formatCurrency = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatPct = (n: number) => `${n.toFixed(1)}%`;

const ClientCommitteePresentation: React.FC<Props> = ({ missions, clientName }) => {
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const presentationRef = useRef<HTMLDivElement>(null);

    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        missions.forEach(m => {
            const d = new Date(m.createdAt);
            if (!isNaN(d.getTime())) months.add(`${d.getFullYear()}-${d.getMonth()}`);
        });
        return Array.from(months).map(k => {
            const [y, mo] = k.split('-').map(Number);
            return { year: y, month: mo, label: `${MONTHS_PT[mo]} ${y}` };
        }).sort((a, b) => b.year - a.year || b.month - a.month);
    }, [missions]);

    const filtered = useMemo(() => {
        return missions.filter(m => {
            const d = new Date(m.createdAt);
            return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        });
    }, [missions, selectedMonth, selectedYear]);

    const prevMonth = useMemo(() => {
        const pm = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const py = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        return missions.filter(m => {
            const d = new Date(m.createdAt);
            return d.getMonth() === pm && d.getFullYear() === py;
        });
    }, [missions, selectedMonth, selectedYear]);

    const stats = useMemo(() => {
        const total = filtered.length;
        const completed = filtered.filter(m => m.status === MissionStatus.COMPLETED).length;
        const cancelled = filtered.filter(m => m.status === MissionStatus.CANCELLED).length;
        const refused = filtered.filter(m => m.status === MissionStatus.REFUSED).length;
        const inTransit = filtered.filter(m => m.status === MissionStatus.IN_TRANSIT || m.status === MissionStatus.ORIGIN).length;
        const scheduled = filtered.filter(m => m.status === MissionStatus.SCHEDULED).length;

        const totalKm = filtered.reduce((sum, m) => {
            const km = parseFloat(String(m.traveledDistance || m.totalDistance || 0));
            return sum + (isNaN(km) ? 0 : km);
        }, 0);

        const totalRevenue = filtered.reduce((sum, m) => {
            const v = parseFloat(String(m.revenue_value || 0));
            return sum + (isNaN(v) ? 0 : v);
        }, 0);

        const avgKmPerMission = completed > 0 ? totalKm / completed : 0;
        const completionRate = total > 0 ? (completed / total) * 100 : 0;
        const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;

        const prevTotal = prevMonth.length;
        const prevCompleted = prevMonth.filter(m => m.status === MissionStatus.COMPLETED).length;
        const prevKm = prevMonth.reduce((sum, m) => sum + (parseFloat(String(m.traveledDistance || m.totalDistance || 0)) || 0), 0);
        const prevRevenue = prevMonth.reduce((sum, m) => sum + (parseFloat(String(m.revenue_value || 0)) || 0), 0);

        const growthMissions = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
        const growthKm = prevKm > 0 ? ((totalKm - prevKm) / prevKm) * 100 : 0;
        const growthRevenue = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        return {
            total, completed, cancelled, refused, inTransit, scheduled,
            totalKm, totalRevenue, avgKmPerMission, completionRate, cancellationRate,
            prevTotal, prevCompleted, prevKm, prevRevenue,
            growthMissions, growthKm, growthRevenue
        };
    }, [filtered, prevMonth]);

    const dailyData = useMemo(() => {
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const days: { day: number; label: string; missoes: number; km: number; concluidas: number }[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dayMissions = filtered.filter(m => new Date(m.createdAt).getDate() === d);
            const km = dayMissions.reduce((s, m) => s + (parseFloat(String(m.traveledDistance || m.totalDistance || 0)) || 0), 0);
            days.push({ day: d, label: String(d).padStart(2, '0'), missoes: dayMissions.length, km: Math.round(km), concluidas: dayMissions.filter(m => m.status === MissionStatus.COMPLETED).length });
        }
        return days;
    }, [filtered, selectedMonth, selectedYear]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach(m => {
            const s = m.status || 'Outro';
            counts[s] = (counts[s] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({
            name: STATUS_MAP[name]?.label || name, value,
            color: STATUS_MAP[name]?.color || '#94a3b8',
            pct: stats.total > 0 ? ((value / stats.total) * 100).toFixed(1) : '0'
        })).sort((a, b) => b.value - a.value);
    }, [filtered, stats.total]);

    const routeData = useMemo(() => {
        const routes: Record<string, { count: number; km: number }> = {};
        filtered.forEach(m => {
            const origin = (m.origin || '').split(',')[0].split('-')[0].trim().toUpperCase();
            const dest = (m.destination || '').split(',')[0].split('-')[0].trim().toUpperCase();
            if (!origin || !dest) return;
            const key = `${origin} → ${dest}`;
            if (!routes[key]) routes[key] = { count: 0, km: 0 };
            routes[key].count++;
            routes[key].km += parseFloat(String(m.traveledDistance || m.totalDistance || 0)) || 0;
        });
        return Object.entries(routes)
            .map(([name, v]) => ({ name: name.length > 30 ? name.substring(0, 30) + '...' : name, fullName: name, missoes: v.count, km: Math.round(v.km) }))
            .sort((a, b) => b.missoes - a.missoes)
            .slice(0, 10);
    }, [filtered]);

    const weekdayData = useMemo(() => {
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        filtered.forEach(m => {
            const d = new Date(m.createdAt).getDay();
            counts[d]++;
        });
        return days.map((name, i) => ({ name, missoes: counts[i], fill: CHART_COLORS[i % CHART_COLORS.length] }));
    }, [filtered]);

    const vehicleData = useMemo(() => {
        const vehicles: Record<string, number> = {};
        filtered.forEach(m => {
            const plate = m.clientVehicle?.plate || (m as any).clientVehiclePlate;
            if (plate && plate !== '---') vehicles[plate] = (vehicles[plate] || 0) + 1;
        });
        return Object.entries(vehicles)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [filtered]);

    const hourlyData = useMemo(() => {
        const hours = Array(24).fill(0);
        filtered.forEach(m => {
            const d = new Date(m.createdAt);
            if (!isNaN(d.getTime())) hours[d.getHours()]++;
        });
        return hours.map((count, h) => ({ hour: `${String(h).padStart(2, '0')}h`, missoes: count }));
    }, [filtered]);

    const performanceRadar = useMemo(() => {
        const maxMissions = Math.max(stats.total, 1);
        return [
            { metric: 'Volume', value: Math.min(100, (stats.total / Math.max(stats.prevTotal, 1)) * 100), fullMark: 150 },
            { metric: 'Conclusão', value: stats.completionRate, fullMark: 100 },
            { metric: 'Pontualidade', value: Math.max(0, 100 - stats.cancellationRate * 2), fullMark: 100 },
            { metric: 'Cobertura KM', value: Math.min(100, (stats.totalKm / Math.max(stats.prevKm, 1)) * 100), fullMark: 150 },
            { metric: 'Efetividade', value: stats.total > 0 ? ((stats.completed + stats.inTransit) / stats.total) * 100 : 0, fullMark: 100 },
        ];
    }, [stats]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-white/95 backdrop-blur-xl p-3 rounded-xl shadow-2xl border border-gray-100">
                <p className="text-[11px] font-black text-gray-900 uppercase mb-1">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} className="text-[10px] font-bold" style={{ color: p.color || BRAND_PRIMARY }}>
                        {p.name}: <span className="font-black">{typeof p.value === 'number' ? formatNumber(p.value) : p.value}</span>
                    </p>
                ))}
            </div>
        );
    };

    const GrowthBadge = ({ value }: { value: number }) => {
        if (Math.abs(value) < 0.5) return <span className="flex items-center gap-1 text-[9px] font-black text-gray-400"><Minus size={10} /> 0%</span>;
        return value > 0
            ? <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600"><ArrowUpRight size={10} /> +{formatPct(value)}</span>
            : <span className="flex items-center gap-1 text-[9px] font-black text-red-600"><ArrowDownRight size={10} /> {formatPct(value)}</span>;
    };

    const handleExportPDF = async () => {
        if (!presentationRef.current) return;
        setIsExporting(true);
        try {
            const element = presentationRef.current;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            let heightLeft = pdfHeight;
            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`Comite_${clientName || 'Cliente'}_${MONTHS_PT[selectedMonth]}_${selectedYear}.pdf`);
        } catch (e) {
            console.error('Erro ao exportar PDF:', e);
            alert('Erro ao gerar PDF. Tente novamente.');
        } finally {
            setIsExporting(false);
        }
    };

    const slides = [
        { id: 'cover', label: 'Capa' },
        { id: 'kpis', label: 'Indicadores' },
        { id: 'timeline', label: 'Linha do Tempo' },
        { id: 'status', label: 'Status' },
        { id: 'routes', label: 'Rotas' },
        { id: 'vehicles', label: 'Frota' },
        { id: 'performance', label: 'Performance' },
        { id: 'hourly', label: 'Horários' },
    ];

    const prevSlide = () => setCurrentSlide(s => Math.max(0, s - 1));
    const nextSlide = () => setCurrentSlide(s => Math.min(slides.length - 1, s + 1));

    return (
        <div className="space-y-4 animate-fade-in" data-testid="committee-presentation">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl text-white" style={{ background: BRAND_GRADIENT }}>
                            <Presentation size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight" data-testid="text-committee-title">Reunião de Comitê</h2>
                            <p className="text-[11px] text-gray-500 font-medium">Apresentação executiva mensal de operações</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            data-testid="select-committee-month"
                            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                            value={`${selectedYear}-${selectedMonth}`}
                            onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setSelectedYear(y); setSelectedMonth(m); setCurrentSlide(0); }}
                        >
                            {availableMonths.map(m => (
                                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
                            ))}
                        </select>
                        <button
                            data-testid="button-export-pdf"
                            onClick={handleExportPDF}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-[11px] font-black uppercase shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
                            style={{ background: BRAND_GRADIENT }}
                        >
                            {isExporting ? <Clock size={14} className="animate-spin" /> : <Download size={14} />}
                            Exportar PDF
                        </button>
                    </div>
                </div>

                <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
                    {slides.map((s, i) => (
                        <button
                            key={s.id}
                            data-testid={`button-slide-${s.id}`}
                            onClick={() => setCurrentSlide(i)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${currentSlide === i ? 'text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            style={currentSlide === i ? { background: BRAND_PRIMARY } : {}}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div ref={presentationRef} className="relative">
                {currentSlide === 0 && (
                    <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: BRAND_GRADIENT, minHeight: '480px' }} data-testid="slide-cover">
                        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
                        <div className="relative p-10 md:p-16 flex flex-col justify-between h-full min-h-[480px]">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-1 rounded-full" style={{ backgroundColor: BRAND_PRIMARY }} />
                                <span className="text-white/50 text-[10px] font-black uppercase tracking-[0.3em]">Grupo TMSEG — Escolta de Segurança</span>
                            </div>
                            <div className="flex-1 flex flex-col justify-center py-10">
                                <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight leading-none mb-3">
                                    Relatório de<br />
                                    <span style={{ color: BRAND_PRIMARY }} className="drop-shadow-lg">Comitê Mensal</span>
                                </h1>
                                <p className="text-white/60 text-lg font-medium mt-4">{clientName || 'Cliente'}</p>
                                <div className="flex items-center gap-4 mt-6">
                                    <div className="px-5 py-2.5 rounded-xl text-white text-sm font-black uppercase" style={{ backgroundColor: BRAND_PRIMARY }}>
                                        {MONTHS_PT[selectedMonth]} {selectedYear}
                                    </div>
                                    <div className="px-4 py-2 rounded-lg bg-white/10 text-white/80 text-xs font-bold">
                                        {formatNumber(stats.total)} operações registradas
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-white/10 pt-6">
                                <div className="grid grid-cols-3 gap-8">
                                    <div><p className="text-white/40 text-[9px] font-bold uppercase tracking-wider">Missões</p><p className="text-white text-2xl font-black">{formatNumber(stats.total)}</p></div>
                                    <div><p className="text-white/40 text-[9px] font-bold uppercase tracking-wider">KM Total</p><p className="text-white text-2xl font-black">{formatNumber(Math.round(stats.totalKm))}</p></div>
                                    <div><p className="text-white/40 text-[9px] font-bold uppercase tracking-wider">Conclusão</p><p className="text-white text-2xl font-black">{formatPct(stats.completionRate)}</p></div>
                                </div>
                                <div className="text-right">
                                    <p className="text-white/30 text-[8px] font-bold uppercase">Documento Confidencial</p>
                                    <p className="text-white/20 text-[8px]">Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {currentSlide === 1 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6" data-testid="slide-kpis">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><Target size={16} /></div>
                            <div>
                                <h3 className="text-sm font-black text-gray-900 uppercase">Indicadores Principais</h3>
                                <p className="text-[10px] text-gray-400">{MONTHS_PT[selectedMonth]} {selectedYear} vs {MONTHS_PT[selectedMonth === 0 ? 11 : selectedMonth - 1]} {selectedMonth === 0 ? selectedYear - 1 : selectedYear}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Missões', value: formatNumber(stats.total), prev: formatNumber(stats.prevTotal), growth: stats.growthMissions, icon: Activity, accent: BRAND_PRIMARY },
                                { label: 'Concluídas', value: formatNumber(stats.completed), prev: formatNumber(stats.prevCompleted), growth: stats.prevCompleted > 0 ? ((stats.completed - stats.prevCompleted) / stats.prevCompleted) * 100 : 0, icon: CheckCircle2, accent: '#059669' },
                                { label: 'KM Percorridos', value: formatNumber(Math.round(stats.totalKm)), prev: formatNumber(Math.round(stats.prevKm)), growth: stats.growthKm, icon: Route, accent: '#6d28d9' },
                                { label: 'Taxa Conclusão', value: formatPct(stats.completionRate), prev: stats.prevTotal > 0 ? formatPct((stats.prevCompleted / stats.prevTotal) * 100) : '0%', growth: 0, icon: Award, accent: '#0891b2' },
                            ].map((kpi, i) => (
                                <div key={i} className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-100 p-5 group hover:shadow-lg transition-all">
                                    <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5" style={{ backgroundColor: kpi.accent, transform: 'translate(30%, -30%)' }} />
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="p-2 rounded-lg text-white shadow-sm" style={{ backgroundColor: kpi.accent }}><kpi.icon size={14} /></div>
                                        <GrowthBadge value={kpi.growth} />
                                    </div>
                                    <p className="text-2xl font-black text-gray-900 mb-1">{kpi.value}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{kpi.label}</p>
                                    <p className="text-[8px] text-gray-300 mt-1">Mês anterior: {kpi.prev}</p>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                { label: 'Canceladas', value: stats.cancelled, color: '#dc2626' },
                                { label: 'Recusadas', value: stats.refused, color: '#450a0a' },
                                { label: 'Em Trânsito', value: stats.inTransit, color: '#6d28d9' },
                                { label: 'Agendadas', value: stats.scheduled, color: '#d97706' },
                                { label: 'KM Médio/OS', value: Math.round(stats.avgKmPerMission), color: '#0891b2' },
                            ].map((item, i) => (
                                <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                                    <p className="text-lg font-black" style={{ color: item.color }}>{formatNumber(item.value)}</p>
                                    <p className="text-[8px] font-bold text-gray-400 uppercase">{item.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentSlide === 2 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" data-testid="slide-timeline">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><BarChart3 size={16} /></div>
                            <h3 className="text-sm font-black text-gray-900 uppercase">Linha do Tempo — Operações Diárias</h3>
                        </div>
                        <div className="h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={BRAND_PRIMARY} stopOpacity={0.15} />
                                            <stop offset="95%" stopColor={BRAND_PRIMARY} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                    <YAxis tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                                    <Area type="monotone" dataKey="km" name="KM" stroke={BRAND_NAVY} fill="url(#gradArea)" strokeWidth={2} />
                                    <Bar dataKey="missoes" name="Missões" fill={BRAND_PRIMARY} radius={[4, 4, 0, 0]} barSize={16} />
                                    <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke="#059669" strokeWidth={2} dot={{ r: 3, fill: '#059669' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                <p className="text-xs font-black text-gray-900">{Math.max(...dailyData.map(d => d.missoes))}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Pico Diário</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                <p className="text-xs font-black text-gray-900">{(stats.total / (dailyData.filter(d => d.missoes > 0).length || 1)).toFixed(1)}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Média/Dia</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                <p className="text-xs font-black text-gray-900">{dailyData.filter(d => d.missoes > 0).length}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Dias Operacionais</p>
                            </div>
                        </div>
                    </div>
                )}

                {currentSlide === 3 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" data-testid="slide-status">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><Layers size={16} /></div>
                            <h3 className="text-sm font-black text-gray-900 uppercase">Distribuição por Status</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="h-[300px] flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3} dataKey="value" stroke="none">
                                            {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                            <LabelList dataKey="pct" position="outside" formatter={(v: string) => `${v}%`} style={{ fontSize: '9px', fontWeight: 800, fill: '#64748b' }} />
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-2">
                                {statusData.map((s, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                        <span className="text-[11px] font-bold text-gray-700 flex-1">{s.name}</span>
                                        <span className="text-[11px] font-black text-gray-900">{s.value}</span>
                                        <span className="text-[9px] font-bold text-gray-400 w-12 text-right">{s.pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {currentSlide === 4 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" data-testid="slide-routes">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><Navigation size={16} /></div>
                            <h3 className="text-sm font-black text-gray-900 uppercase">Top 10 Rotas Mais Operadas</h3>
                        </div>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={routeData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fontWeight: 700 }} width={140} stroke="#94a3b8" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="missoes" name="Missões" fill={BRAND_PRIMARY} radius={[0, 6, 6, 0]} barSize={18}>
                                        <LabelList dataKey="missoes" position="right" style={{ fontSize: '9px', fontWeight: 800, fill: BRAND_PRIMARY }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {currentSlide === 5 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" data-testid="slide-vehicles">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><Truck size={16} /></div>
                            <h3 className="text-sm font-black text-gray-900 uppercase">Utilização da Frota</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={vehicleData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700 }} stroke="#94a3b8" />
                                        <YAxis tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" name="Missões" radius={[6, 6, 0, 0]} barSize={30}>
                                            {vehicleData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                            <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fontWeight: 800, fill: '#1e293b' }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-2">
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-3">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Total de Veículos Utilizados</p>
                                    <p className="text-2xl font-black text-gray-900">{vehicleData.length}</p>
                                </div>
                                {vehicleData.slice(0, 5).map((v, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}>{i + 1}</div>
                                        <span className="text-[11px] font-bold text-gray-700 flex-1 font-mono">{v.name}</span>
                                        <span className="text-[11px] font-black text-gray-900">{v.value} OS</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {currentSlide === 6 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" data-testid="slide-performance">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><Zap size={16} /></div>
                            <h3 className="text-sm font-black text-gray-900 uppercase">Radar de Performance</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="h-[320px] flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart data={performanceRadar}>
                                        <PolarGrid stroke="#e2e8f0" />
                                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} />
                                        <PolarRadiusAxis tick={{ fontSize: 8 }} domain={[0, 'auto']} />
                                        <Radar name="Performance" dataKey="value" stroke={BRAND_PRIMARY} fill={BRAND_PRIMARY} fillOpacity={0.2} strokeWidth={2} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-3">
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-2">Análise do Mês</p>
                                    <div className="space-y-2">
                                        {performanceRadar.map((item, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-gray-600 w-24">{item.metric}</span>
                                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, item.value)}%`, backgroundColor: item.value >= 80 ? '#059669' : item.value >= 50 ? '#d97706' : '#dc2626' }} />
                                                </div>
                                                <span className="text-[9px] font-black text-gray-700 w-10 text-right">{item.value.toFixed(0)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                                        <Star size={16} className="text-emerald-600 mx-auto mb-1" />
                                        <p className="text-[9px] font-bold text-emerald-700 uppercase">Score Geral</p>
                                        <p className="text-lg font-black text-emerald-800">{(performanceRadar.reduce((s, p) => s + p.value, 0) / performanceRadar.length).toFixed(0)}%</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                                        <TrendingUp size={16} className="text-blue-600 mx-auto mb-1" />
                                        <p className="text-[9px] font-bold text-blue-700 uppercase">Tendência</p>
                                        <p className="text-lg font-black text-blue-800">{stats.growthMissions >= 0 ? '↑' : '↓'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {currentSlide === 7 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" data-testid="slide-hourly">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_PRIMARY }}><Clock size={16} /></div>
                            <h3 className="text-sm font-black text-gray-900 uppercase">Mapa de Calor — Horários de Operação</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="gradHourly" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={BRAND_PRIMARY} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={BRAND_PRIMARY} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="hour" tick={{ fontSize: 8, fontWeight: 700 }} stroke="#94a3b8" />
                                        <YAxis tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area type="monotone" dataKey="missoes" name="Missões" stroke={BRAND_PRIMARY} fill="url(#gradHourly)" strokeWidth={2.5} dot={{ r: 3, fill: BRAND_PRIMARY, strokeWidth: 0 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                                    <div className="p-2 rounded-lg text-white" style={{ backgroundColor: BRAND_NAVY }}><Calendar size={14} /></div>
                                    <h4 className="text-xs font-black text-gray-700 uppercase">Distribuição por Dia da Semana</h4>
                                </div>
                                <div className="h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={weekdayData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                                            <YAxis tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="missoes" name="Missões" radius={[6, 6, 0, 0]} barSize={28}>
                                                {weekdayData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                                <LabelList dataKey="missoes" position="top" style={{ fontSize: '10px', fontWeight: 800, fill: '#1e293b' }} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mt-4">
                    <button onClick={prevSlide} disabled={currentSlide === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all" data-testid="button-prev-slide">
                        <ChevronLeft size={16} /> Anterior
                    </button>
                    <div className="flex gap-1.5">
                        {slides.map((_, i) => (
                            <button key={i} onClick={() => setCurrentSlide(i)} className={`w-2.5 h-2.5 rounded-full transition-all ${currentSlide === i ? 'scale-125' : 'bg-gray-200 hover:bg-gray-300'}`} style={currentSlide === i ? { backgroundColor: BRAND_PRIMARY } : {}} />
                        ))}
                    </div>
                    <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-30 transition-all" style={{ backgroundColor: BRAND_PRIMARY }} data-testid="button-next-slide">
                        Próximo <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClientCommitteePresentation;
