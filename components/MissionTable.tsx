import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mission, MissionStatus, MissionLog, User as UserType, Agent, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { logAction } from '../lib/logger';
import { extractUF, UF_TO_REGION, calculateMissionFinancials } from '../lib/financialUtils';
import { 
  Plus, Loader2, Activity, Search, Database, AlertTriangle, Check, Trash2, Lock, Share2, X, Eye, EyeOff, Layers, PlayCircle, CheckCircle2, FileClock,
  ClipboardList, FileSearch, CalendarClock, MapPin, Truck, Flag, XCircle, UserX, AlertOctagon, ToggleLeft, ToggleRight, Calendar,
  BarChart4, TrendingUp, TrendingDown, DollarSign, PieChart, Wallet, Map as MapIcon, Globe, Building2, LayoutDashboard, User, CreditCard, ExternalLink, RefreshCw,
  Trophy, Target, Shield, Gauge, Clock, Zap, Briefcase, ClipboardCheck, ShieldCheck, Percent, History, CalendarPlus, ShieldAlert, Mail, MessageCircle
} from 'lucide-react';
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';
import { extractCoordinates } from '../lib/utils';
import MissionStatusModal from './MissionStatusModal';
import UpdateMissionModal from './UpdateMissionModal';
import MissionCard from './MissionCard';
import MissionPrintModal from './MissionPrintModal';
import MissionHistoryModal from './MissionHistoryModal';
import MissionFinancialModal from './MissionFinancialModal';
import DailyGoalThermometer from './DailyGoalThermometer';

const LABEL_CLASS = "text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest";

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const ChartContainer: React.FC<{ title: string; icon: any; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full group">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-50 pb-3">
            <div className="p-2 bg-gray-900 text-white rounded-lg group-hover:bg-red-700 transition-colors">
                <Icon size={14} />
            </div>
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{title}</h4>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-[160px] w-full">
            {children}
        </div>
    </div>
);

const SimplePieChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);
    let currentAngle = 0;
    
    if (total === 0) return <div className="text-[10px] font-bold text-gray-300 uppercase">Sem dados</div>;

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <svg viewBox="0 0 100 100" className="w-28 h-28 transform -rotate-90">
                {data.map((item, i) => {
                    const angle = (item.value / total) * 360;
                    if (angle === 0) return null;
                    const x1 = 50 + 45 * Math.cos((Math.PI * currentAngle) / 180);
                    const y1 = 50 + 45 * Math.sin((Math.PI * currentAngle) / 180);
                    currentAngle += angle;
                    const x2 = 50 + 45 * Math.cos((Math.PI * currentAngle) / 180);
                    const y2 = 50 + 45 * Math.sin((Math.PI * currentAngle) / 180);
                    const largeArcFlag = angle > 180 ? 1 : 0;
                    return (
                        <path key={i} d={`M 50 50 L ${x1} ${y1} A 45 45 0 ${largeArcFlag} 1 ${x2} ${y2} Z`} fill={item.color} className="hover:opacity-80 transition-opacity cursor-help" />
                    );
                })}
                <circle cx={50} cy={50} r="28" fill="white" />
            </svg>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 w-full">
                {data.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5 overflow-hidden">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                        <span className="text-[8px] font-black text-gray-500 uppercase truncate" title={item.label}>{item.value} {item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const HorizontalBarChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="w-full space-y-3">
            {data.map((item, i) => (
                <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-tighter">
                        <span className="text-gray-600 truncate max-w-[120px]">{item.label}</span>
                        <span className="text-gray-900">{item.value}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${item.color}`} style={{ width: `${(item.value / max) * 100}%` }}></div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const FinancialBarChart: React.FC<{ revenue: number; cost: number }> = ({ revenue, cost }) => {
    const max = Math.max(revenue, cost, 1);
    const profit = revenue - cost;
    return (
        <div className="w-full flex flex-col gap-4">
            <div className="flex justify-around items-end h-24 gap-4">
                <div className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-full bg-green-500 rounded-t-lg transition-all duration-1000" style={{ height: `${(revenue / max) * 100}%` }}></div>
                    <span className="text-[7px] font-black text-gray-400 uppercase">Rec</span>
                </div>
                <div className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-full bg-red-600 rounded-t-lg transition-all duration-1000" style={{ height: `${(cost / max) * 100}%` }}></div>
                    <span className="text-[7px] font-black text-gray-400 uppercase">Cst</span>
                </div>
            </div>
            <div className="p-2 bg-gray-900 rounded-xl text-center">
                <p className={`text-[10px] font-black font-mono ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(profit)}
                </p>
            </div>
        </div>
    );
};

interface AnalyticsDashboardProps {
    missions: Mission[];
    isDirector: boolean;
    clientTables: ClientPriceTable[];
    providerTables: ProviderCostTable[];
    clientsData: Client[];
    currentTime: Date;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ missions, isDirector, clientTables, providerTables, clientsData, currentTime }) => {
    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        missions.forEach(m => counts[m.status] = (counts[m.status] || 0) + 1);
        return [
            { label: 'Viagem', value: counts[MissionStatus.IN_TRANSIT] || 0, color: '#7c3aed' },
            { label: 'Concluído', value: counts[MissionStatus.COMPLETED] || 0, color: '#059669' },
            { label: 'Agendado', value: counts[MissionStatus.SCHEDULED] || 0, color: '#eab308' },
            { label: 'Cancelado', value: (counts[MissionStatus.CANCELLED] || 0) + (counts[MissionStatus.REFUSED] || 0), color: '#dc2626' }
        ];
    }, [missions]);

    const typeData = useMemo(() => {
        const char = missions.filter(m => (m.mission_type || '').includes('Caracterizada')).length;
        const vel = missions.filter(m => (m.mission_type || '').includes('Velada')).length;
        return [
            { label: 'Caracterizada', value: char, color: '#b91c1c' },
            { label: 'Velada', value: vel, color: '#0f172a' }
        ];
    }, [missions]);

    const topClients = useMemo(() => {
        const counts: Record<string, number> = {};
        missions.forEach(m => counts[m.client] = (counts[m.client] || 0) + 1);
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value]) => ({ label, value, color: 'bg-red-700' }));
    }, [missions]);

    const topProviders = useMemo(() => {
        const counts: Record<string, number> = {};
        missions.forEach(m => { if(m.provider) counts[m.provider] = (counts[m.provider] || 0) + 1; });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value]) => ({ label, value, color: 'bg-slate-800' }));
    }, [missions]);

    const financials = useMemo(() => {
        return missions.reduce((acc, m) => {
            const isTerminal = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus);
            // HIERARQUIA DE VALOR: Prioridade para valor auditado (billing_approved) OU status terminal
            const isAudited = m.billing_approved;
            
            let rev = 0;
            let cost = 0;

            if (isTerminal || isAudited) {
                // Se concluída/cancelada OU auditada, usa valor gravado no banco (verdade absoluta)
                rev = (m.revenue_value || 0) + (m.toll_value || 0);
                cost = (m.cost_value || 0) + (m.toll_value || 0);
            } else {
                // Se ativa e não auditada, usa projeção em tempo real
                const client = clientsData.find(c => c.name === m.client);
                const projected = calculateMissionFinancials(m, clientTables, providerTables, client, currentTime);
                rev = projected.client.total;
                cost = projected.provider.total;
            }

            return {
                rev: acc.rev + rev,
                cost: acc.cost + cost,
                profit: acc.profit + (rev - cost)
            };
        }, { rev: 0, cost: 0, profit: 0 });
    }, [missions, clientTables, providerTables, clientsData, currentTime]);

    const profitMargin = useMemo(() => {
        if (financials.rev === 0) return 0;
        return (financials.profit / financials.rev) * 100;
    }, [financials]);

    const regionalData = useMemo(() => {
        const counts: Record<string, number> = { 'SUDESTE': 0, 'SUL': 0, 'CENTRO-OESTE': 0, 'NORDESTE': 0, 'NORTE': 0 };
        missions.forEach(m => {
            const uf = extractUF(m.origin || '');
            const reg = UF_TO_REGION[uf] || 'OUTROS';
            if (counts[reg] !== undefined) counts[reg]++;
        });
        return Object.entries(counts)
            .filter(([_, v]) => v > 0)
            .map(([label, value]) => ({ label, value, color: '#dc2626' }));
    }, [missions]);

    const distanceData = useMemo(() => {
        const ranges = { '< 100km': 0, '100-500km': 0, '500km+': 0 };
        missions.forEach(m => {
            const d = m.totalDistance || 0;
            if(d < 100) ranges['< 100km']++;
            else if(d < 500) ranges['100-500km']++;
            else ranges['500km+']++;
        });
        return Object.entries(ranges).map(([label, value]) => ({ label, value, color: 'bg-indigo-600' }));
    }, [missions]);

    const billingAudit = useMemo(() => {
        const app = missions.filter(m => m.billing_approved).length;
        const pen = missions.filter(m => !m.billing_approved && m.status === MissionStatus.COMPLETED).length;
        return [
            { label: 'Aprovado', value: app, color: '#22c55e' },
            { label: 'Pendente', value: pen, color: '#f97316' }
        ];
    }, [missions]);

    const dailyTrend = useMemo(() => {
        const days: Record<string, number> = {};
        missions.slice(0, 50).forEach(m => {
            const d = new Date(m.createdAt).toLocaleDateString('pt-BR', { weekday: 'short' });
            days[d] = (days[d] || 0) + 1;
        });
        return Object.entries(days).map(([label, value]) => ({ label, value, color: 'bg-red-600' }));
    }, [missions]);

    const efficiencyData = useMemo(() => {
        const done = missions.filter(m => m.status === MissionStatus.COMPLETED).length;
        const lost = missions.filter(m => [MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length;
        return [
            { label: 'Sucesso', value: done, color: '#16a34a' },
            { label: 'Perda', value: lost, color: '#450a0a' }
        ];
    }, [missions]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden group border border-white/5">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><Activity size={60}/></div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Volume Operacional</p>
                    <h3 className="text-3xl font-black">{missions.length}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Em Trânsito Agora</p>
                    <div className="flex items-center gap-3">
                        <h3 className="text-3xl font-black text-gray-900">{missions.filter(m => m.status === MissionStatus.IN_TRANSIT).length}</h3>
                        <Truck size={20} className="text-purple-600"/>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pendência Financeira</p>
                    <div className="flex items-center gap-3">
                        <h3 className="text-3xl font-black text-orange-600">{missions.filter(m => !m.billing_approved && m.status === MissionStatus.COMPLETED).length}</h3>
                        <FileClock size={20} className="text-orange-600"/>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Eficiência Geral</p>
                    <div className="flex items-center gap-3">
                        <h3 className="text-3xl font-black text-green-700">{missions.length > 0 ? Math.round((missions.filter(m => m.status === MissionStatus.COMPLETED).length / missions.length) * 100) : 0}%</h3>
                        <Target size={20} className="text-green-600"/>
                    </div>
                </div>
            </div>

            {isDirector && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-top-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm group hover:border-green-200 transition-colors">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-2">
                            <TrendingUp size={12} className="text-green-500" /> Faturamento (c/ extras)
                        </p>
                        <h3 className="text-2xl font-black text-green-700 font-mono tracking-tighter">
                            {formatCurrency(financials.rev)}
                        </h3>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm group hover:border-red-200 transition-colors">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-2">
                            <TrendingDown size={12} className="text-red-500" /> Fornecedor (c/ extras)
                        </p>
                        <h3 className="text-2xl font-black text-red-700 font-mono tracking-tighter">
                            {formatCurrency(financials.cost)}
                        </h3>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm group hover:border-blue-200 transition-colors">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-2">
                            <Wallet size={12} className="text-blue-500" /> Quanto Sobrou
                        </p>
                        <h3 className={`text-2xl font-black font-mono tracking-tighter ${financials.profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                            {formatCurrency(financials.profit)}
                        </h3>
                    </div>
                    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl group hover:scale-[1.02] transition-transform">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-2">
                            <Percent size={12} className="text-red-500" /> Lucratividade %
                        </p>
                        <h3 className={`text-2xl font-black font-mono tracking-tighter ${profitMargin >= 20 ? 'text-green-400' : profitMargin >= 10 ? 'text-blue-400' : 'text-amber-400'}`}>
                            {profitMargin.toFixed(1)}%
                        </h3>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <ChartContainer title="Status de Frota" icon={PieChart}><SimplePieChart data={statusData} /></ChartContainer>
                <ChartContainer title="Mix de Operação" icon={Shield}><SimplePieChart data={typeData} /></ChartContainer>
                <ChartContainer title="Ranking Clientes" icon={Trophy}><HorizontalBarChart data={topClients} /></ChartContainer>
                <ChartContainer title="Parceiros Ativos" icon={Briefcase}><SimplePieChart data={topProviders} /></ChartContainer>
                <ChartContainer title="Performance Fin." icon={DollarSign}>
                    {isDirector ? <FinancialBarChart revenue={financials.rev} cost={financials.cost} /> : <div className="text-gray-300 flex flex-col items-center"><Lock size={24}/><span className="text-[8px] font-black uppercase mt-1">Restrito</span></div>}
                </ChartContainer>
                <ChartContainer title="Distribuição Regional" icon={Globe}><SimplePieChart data={regionalData} /></ChartContainer>
                <ChartContainer title="Faixas de KM" icon={Gauge}><HorizontalBarChart data={distanceData} /></ChartContainer>
                <ChartContainer title="Auditoria Mensal" icon={ClipboardCheck}><SimplePieChart data={billingAudit} /></ChartContainer>
                <ChartContainer title="Demanda Semanal" icon={Calendar}><HorizontalBarChart data={dailyTrend} /></ChartContainer>
                <ChartContainer title="Taxa de Sucesso" icon={CheckCircle2}><SimplePieChart data={efficiencyData} /></ChartContainer>
            </div>
        </div>
    );
};

interface ClientAnalyticsDashboardProps {
    missions: Mission[];
    clientTables: ClientPriceTable[];
    providerTables: ProviderCostTable[];
    clientsData: Client[];
}

const ClientAnalyticsDashboard: React.FC<ClientAnalyticsDashboardProps> = ({ missions }) => {
    const total = missions.length;
    const completed = missions.filter(m => m.status === MissionStatus.COMPLETED).length;
    const inTransit = missions.filter(m => m.status === MissionStatus.IN_TRANSIT).length;

    const statusData = [
        { label: 'Em Viagem', value: inTransit, color: '#3b82f6' },
        { label: 'Concluído', value: completed, color: '#22c55e' },
        { label: 'Outros', value: Math.max(0, total - (completed + inTransit)), color: '#94a3b8' }
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6 animate-in slide-in-from-top-4">
            <div className="lg:col-span-1 space-y-4">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total de Missões</p>
                    <h3 className="text-3xl font-black text-gray-900">{total}</h3>
                </div>
                <div className="bg-green-600 p-6 rounded-2xl text-white shadow-xl">
                    <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Taxa de Conclusão</p>
                    <h3 className="text-3xl font-black">{total > 0 ? Math.round((completed / total) * 100) : 0}%</h3>
                </div>
            </div>
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
                <ChartContainer title="Status das Operações" icon={Activity}><SimplePieChart data={statusData} /></ChartContainer>
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><Zap size={100}/></div>
                    <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ShieldCheck className="text-red-700" size={16}/> Compromisso com a Segurança
                    </h4>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">
                        Sua carga está sob monitoramento constante da nossa Central de Inteligência. 
                        Mantemos conformidade rigorosa com os protocolos da Polícia Federal em 100% das missões.
                    </p>
                </div>
            </div>
        </div>
    );
};

interface MissionTableProps {
  onNewMission?: () => void;
}

const STATUS_CONFIG = [
    { id: MissionStatus.SOLICITED, label: 'Solicitada', icon: ClipboardList, color: 'bg-orange-500' },
    { id: MissionStatus.DOCUMENTATION, label: 'Documentação', icon: FileSearch, color: 'bg-blue-400' }, 
    { id: MissionStatus.SCHEDULED, label: 'Agendada', icon: CalendarClock, color: 'bg-yellow-500' },
    { id: MissionStatus.ORIGIN, label: 'Origem', icon: MapPin, color: 'bg-indigo-500' },
    { id: MissionStatus.IN_TRANSIT, label: 'Em Viagem', icon: Truck, color: 'bg-purple-600' },
    { id: MissionStatus.COMPLETED, label: 'Concluída', icon: Flag, color: 'bg-green-600' },
    { id: MissionStatus.CANCELLED, label: 'Cancelada', icon: XCircle, color: 'bg-red-600' },
    { id: MissionStatus.REFUSED, label: 'Recusada', icon: UserX, color: 'bg-red-800' },
];

const mapContainerStyle = {
  width: '100%',
  height: '450px',
  borderRadius: '0.75rem'
};

const defaultMapCenter = {
  lat: -14.235,
  lng: -51.9253 
};

interface StatCardProps {
  icon: React.ElementType;
  title: string;
  value: number;
  bgColor: string;
  loading: boolean;
  isActive: boolean;
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, title, value, bgColor, loading, isActive, onClick }) => (
    <button 
      onClick={onClick}
      className={`
        relative flex flex-col items-start p-2.5 rounded-lg border transition-all duration-200 w-full text-left group
        ${isActive 
          ? 'bg-white border-gray-800 text-gray-900 ring-1 ring-gray-800 shadow-md transform scale-[1.02] z-10' 
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:shadow-sm'
        }
      `}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : `${bgColor} text-white shadow-sm`}`}>
            <Icon size={16} />
        </div>
        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{title}</span>
      </div>
      <div className="w-full min-w-0">
        {loading ? (
            <div className="w-8 h-5 bg-gray-200/50 rounded animate-pulse"></div>
        ) : (
            <p className={`text-lg font-black tracking-tight ${isActive ? 'text-gray-900' : 'text-gray-700'} font-mono`}>{value}</p>
        )}
      </div>
    </button>
);

const isMissionPending = (m: Mission) => {
    if (m.status === MissionStatus.PENDING) return true;
    if (m.status === MissionStatus.COMPLETED) {
        if (m.endKm === null || m.endKm === undefined || m.endKm === 0) return true;
    }
    return false;
};

// Marco temporal solicitado: Janeiro de 2026
const DATE_THRESHOLD_2026 = new Date('2026-01-01T00:00:00').getTime();

const MissionTable: React.FC<MissionTableProps> = ({ onNewMission }) => {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);

  const { showNotification } = useNotification();
  const [allMissions, setAllMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  
  // Toggle Filters
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [showUnapprovedOnly, setShowUnapprovedOnly] = useState(false);
  const [showTomorrowOnly, setShowTomorrowOnly] = useState(false); 
  
  const [searchHistoryId, setSearchHistoryId] = useState('');
  const [viewPeriod, setViewPeriod] = useState<string>('TODAY'); 
  
  const [clientTables, setClientTables] = useState<ClientPriceTable[]>([]);
  const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
  const [clientsData, setClientsData] = useState<Client[]>([]);
  const [agentPhonesMap, setAgentPhonesMap] = useState<Record<string, string>>({});
  
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [showAnalyticsDash, setShowAnalyticsDash] = useState(false);
  const [showClientDash, setShowClientDash] = useState(false);
  const [showFleetMap, setShowFleetMap] = useState(false);
  const [selectedMapMission, setSelectedMapMission] = useState<Mission | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [missionForStatusView, setMissionForStatusView] = useState<Mission | null>(null);
  const [missionLogs, setMissionLogs] = useState<MissionLog[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [missionForPrint, setMissionForPrint] = useState<Mission | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [missionToDelete, setMissionToDelete] = useState<Mission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyMissionId, setHistoryMissionId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [missionForFinancials, setMissionForFinancials] = useState<Mission | null>(null);

  // Relógio para projeções
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, []);

  const isDirector = useMemo(() => {
    if (!currentUser) return false;
    const roleLower = (currentUser?.role || '').toLowerCase();
    return ['diretoria', 'administrador'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roleLower = (currentUser?.role || '').toLowerCase();
    return roleLower === 'administrador' || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isDanielPinto = useMemo(() => {
    return currentUser?.name?.toUpperCase() === 'DANIEL PINTO';
  }, [currentUser]);
  
  const isCommercial = useMemo(() => {
      return (currentUser?.role || '').toLowerCase() === 'comercial';
  }, [currentUser]);

  const canEditMission = useMemo(() => {
      if (!currentUser) return false;
      const roleLower = (currentUser.role || '').toLowerCase();
      return ['diretoria', 'administrador', 'avançado', 'avancado', 'operador', 'comercial'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isRestrictedClientView = useMemo(() => {
      if (!currentUser) return false;
      if (currentUser.clientId) return true;
      if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
          return currentUser.permissions.some(p => p.startsWith('client_view:'));
      }
      return false;
  }, [currentUser]);

  const fetchMissions = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setDbStatus(null);
    try {
      let query = supabase.from('missions').select('*').order('created_at', { ascending: false });
      
      if (currentUser?.clientId) {
          const { data: clientData } = await supabase.from('clients').select('name').eq('id', currentUser.clientId).single();
          if (clientData) query = query.eq('client', clientData.name);
          else { setAllMissions([]); setIsLoading(false); return; }
      } else if (isCommercial || (currentUser?.permissions && currentUser.permissions.some(p => p.startsWith('client_view:')))) {
          const allowedClientIds = currentUser?.permissions?.filter(p => p.startsWith('client_view:')).map(p => p.split(':')[1]) || [];
          
          let clientNamesQuery = supabase.from('clients').select('name');
          if (allowedClientIds.length > 0) {
              clientNamesQuery = clientNamesQuery.or(`created_by.eq."${currentUser?.name}",id.in.(${allowedClientIds.join(',')})`);
          } else {
              clientNamesQuery = clientNamesQuery.eq('created_by', currentUser?.name);
          }

          const { data: myClients } = await clientNamesQuery;
          const validNames = (myClients || []).map(c => c.name);

          if (validNames.length > 0) {
              query = query.in('client', validNames);
          } else {
              query = query.eq('client', 'NON_EXISTENT_CLIENT_TO_FORCE_EMPTY');
          }
      }

      const [missionsRes, clientTablesRes, providerTablesRes, clientsRes, providersRes] = await Promise.all([
          query,
          supabase.from('client_price_tables').select('*'),
          supabase.from('provider_cost_tables').select('*'),
          supabase.from('clients').select('*'),
          supabase.from('providers').select('name, trading_name')
      ]);

      if (missionsRes.error) throw missionsRes.error;
      setDbStatus('ok');

      if (clientTablesRes.data) setClientTables(clientTablesRes.data as any);
      if (providerTablesRes.data) setProviderTables(providerTablesRes.data as any);
      if (clientsRes.data) setClientsData(clientsRes.data as any);

      if (missionsRes.data) {
          const missionsData = missionsRes.data;
          const vehicleIds = [...new Set(missionsData.map((m: any) => m.vehicle_id).filter((id: any) => id))];
          const clientVehicleIds = [...new Set(missionsData.map((m: any) => m.client_vehicle).filter((id: any) => id))];
          
          const agentNames = [...new Set(missionsData.flatMap((m: any) => [m.agent1, m.agent2]).filter(n => n && n !== '---'))];

          const [vehiclesRes, clientVehiclesRes, agentsRes] = await Promise.all([
              vehicleIds.length > 0 ? supabase.from('vehicles').select('*').in('id', vehicleIds) : { data: [] },
              clientVehicleIds.length > 0 ? supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', clientVehicleIds) : { data: [] },
              agentNames.length > 0 ? supabase.from('agents').select('name, phone').in('name', agentNames) : { data: [] }
          ]);

          const vehicleMap = (vehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id]: v }), {});
          const clientVehicleMap = (clientVehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id.toString()]: v }), {});
          
          const phonesMap = (agentsRes.data || []).reduce((acc: any, a: any) => ({ ...acc, [a.name]: a.phone }), {});
          setAgentPhonesMap(phonesMap);
          
          const clientNameMap = (clientsRes.data || []).reduce((acc: any, c: any) => {
              if (c.trading_name && c.trading_name.trim() !== '') acc[(c.name || '').trim().toUpperCase()] = c.trading_name.trim();
              return acc;
          }, {});

          const providerNameMap = (providersRes.data || []).reduce((acc: any, p: any) => {
              if (p.trading_name && p.trading_name.trim() !== '') acc[(p.name || '').trim().toUpperCase()] = p.trading_name.trim();
              return acc;
          }, {});

            const mapped: Mission[] = missionsData.map((m: any) => {
                const clientKey = m.client ? (m.client || '').trim().toUpperCase() : '';
                const providerKey = m.provider ? (m.provider || '').trim().toUpperCase() : '';
                const resolvedVehicle = vehicleMap[m.vehicle_id];
                let displayVehicleId = m.vehicle_id;
                if (resolvedVehicle) displayVehicleId = resolvedVehicle.plate;
  
                const fallbackDate = m.last_update || m.created_at || new Date().toISOString();
                const cargoId = m.client_vehicle?.toString();
                const cargoVehicle = cargoId ? (clientVehicleMap[cargoId] || { plate: `ID: ${cargoId}`, model: 'VEÍCULO NÃO LOCALIZADO' }) : null;
  
                return { 
                    ...m, 
                    client: clientNameMap[clientKey] || m.client, 
                    provider: providerNameMap[providerKey] || m.provider,
                    originalClientName: m.client, 
                    clientVehicle: cargoVehicle, 
                    driver_name: m.driver_name, 
                    driver_phone: m.driver_phone, 
                    lastUpdate: m.last_update, 
                    updatedBy: m.updated_by, 
                    createdAt: m.created_at || fallbackDate, 
                    vehicleId: displayVehicleId, 
                    vehicleData: resolvedVehicle, 
                    totalDistance: m.total_distance, 
                    traveledDistance: m.traveled_distance, 
                    mapLink: m.map_link, 
                    startKm: m.start_km, 
                    start_time: m.start_time, 
                    startTime: m.start_time,
                    endKm: m.end_km, 
                    endTime: m.end_time, 
                    estimatedTime: m.estimated_time, 
                    currentLocation: m.current_location, 
                    progress: m.progress || 0, 
                    mission_type: m.mission_type || 'Caracterizada', 
                    gr_espelhamento: m.gr_espelhamento,
                    revenue_value: m.revenue_value,
                    cost_value: m.cost_value,
                    toll_value: m.toll_value,
                    billing_approved: m.billing_approved,
                    billing_verified_by: m.billing_verified_by
                };
            });
            setAllMissions(mapped);
        }
      } catch (error: any) {
        console.error('Error fetching missions:', error.message || error);
        setDbStatus('error');
        showNotification('Erro', `Falha ao carregar monitoramento`, 'error');
      } finally {
        if (!silent) setIsLoading(false);
      }
    }, [showNotification, currentUser, isCommercial]);
  
    useEffect(() => {
      if (currentUser) {
          fetchMissions();
          const channel = supabase
            .channel('missions-changes')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'missions' },
              () => {
                fetchMissions(true);
              }
            )
            .subscribe();
          const interval = setInterval(() => fetchMissions(true), 120000);
          return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
          };
      }
    }, [fetchMissions, currentUser]);
  
    const periodMissions = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        if (viewPeriod === 'TODAY') {
            return allMissions.filter(m => {
                if (!m.startTime) return false;
                const mDate = new Date(m.startTime);
                return mDate >= todayStart && mDate <= todayEnd;
            });
        }
  
        return allMissions.filter(m => {
            const mDate = new Date(m.startTime || m.createdAt);
            
            if (viewPeriod === 'YESTERDAY') {
                const yesterdayStart = new Date(todayStart);
                yesterdayStart.setDate(todayStart.getDate() - 1);
                const yesterdayEnd = new Date(todayEnd);
                yesterdayEnd.setDate(todayEnd.getDate() - 1);
                return mDate >= yesterdayStart && mDate <= yesterdayEnd;
            }
            if (viewPeriod === 'WEEK') {
                const weekStart = new Date(todayStart);
                weekStart.setDate(todayStart.getDate() - 7);
                return mDate >= weekStart && mDate <= todayEnd;
            }
            if (viewPeriod === 'MONTH') {
                const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
                const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);
                return mDate >= monthStart && mDate <= monthEnd;
            }
            if (viewPeriod === 'YEAR') {
                const yearStart = new Date(todayStart.getFullYear(), 0, 1);
                const yearEnd = new Date(todayStart.getFullYear(), 11, 31, 23, 59, 59, 999);
                return mDate >= yearStart && mDate <= yearEnd;
            }
            if (viewPeriod === 'CUSTOM') {
                if (!customStartDate || !customEndDate) return true;
                const start = new Date(customStartDate + 'T00:00:00');
                const end = new Date(customEndDate + 'T23:59:59');
                return mDate >= start && mDate <= end;
            }
            if (viewPeriod === 'ALL') {
                const isTerminal = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus);
                return !isTerminal;
            }
            return true;
        });
    }, [allMissions, viewPeriod, customStartDate, customEndDate]);

    const analyticsMissions = useMemo(() => {
        return periodMissions;
    }, [periodMissions]);

    // FILTER LOGIC:
    // 1. Calculate the base list after applying "Toggle" filters (AND logic).
    // 2. Use this base list for counting (Status Cards).
    // 3. Apply the specific "Status Tab" filter on top for the list view.
    
    const filteredBySpecialCriteria = useMemo(() => {
        const isSearching = searchTerm && searchTerm.trim().length > 0;
        const hasActiveSpecialFilters = showPendingOnly || showUnapprovedOnly || showTomorrowOnly;

        // If any special filter or search is active, look at ALL missions, not just period
        const sourceMissions = (isSearching || hasActiveSpecialFilters) ? allMissions : periodMissions;

        return sourceMissions.filter(mission => {
            // Text Search
            if (isSearching) {
                const searchLower = searchTerm.toLowerCase().trim();
                const matchesSearch = 
                    (mission.id || '').toLowerCase().includes(searchLower) || 
                    (mission.client || '').toLowerCase().includes(searchLower) || 
                    (mission.vehicleId || '').toLowerCase().includes(searchLower) || 
                    (mission.provider || '').toLowerCase().includes(searchLower) || 
                    (mission.clientVehicle?.plate || '').toLowerCase().includes(searchLower) || 
                    (mission.driver_name || '').toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            // Filter 1: Pending (Toggle)
            if (showPendingOnly && !isMissionPending(mission)) {
                return false;
            }

            // Filter 2: Unapproved (Toggle)
            if (showUnapprovedOnly) {
                const mDate = new Date(mission.startTime || mission.createdAt).getTime();
                const isUnapproved = mission.status === MissionStatus.COMPLETED && !mission.billing_approved && mDate >= DATE_THRESHOLD_2026;
                if (!isUnapproved) return false;
            }

            // Filter 3: Future (Toggle)
            if (showTomorrowOnly) {
                const now = new Date().getTime();
                const mDate = new Date(mission.startTime || mission.createdAt).getTime();
                if (mDate <= now) return false;
            }

            return true;
        });
    }, [allMissions, periodMissions, searchTerm, showPendingOnly, showUnapprovedOnly, showTomorrowOnly]);

    // Status Counts based on the FILTERED set (to sync counters with visible criteria)
    const statusCounts = useMemo(() => {
        return filteredBySpecialCriteria.reduce((acc: any, m: any) => {
            acc[m.status] = (acc[m.status] || 0) + 1;
            return acc;
        }, {});
    }, [filteredBySpecialCriteria]);

    // Total Count also based on filtered set
    const totalVolumeCount = useMemo(() => {
        return filteredBySpecialCriteria.length;
    }, [filteredBySpecialCriteria]);
  
    // Counts for Badge Indicators (Global context)
    const pendingCount = useMemo(() => allMissions.filter(m => isMissionPending(m)).length, [allMissions]);
    const unapprovedCount = useMemo(() => 
        allMissions.filter(m => 
            m.status === MissionStatus.COMPLETED && 
            !m.billing_approved && 
            new Date(m.startTime || m.createdAt).getTime() >= DATE_THRESHOLD_2026
        ).length, 
    [allMissions]);
    const tomorrowCount = useMemo(() => {
        const now = new Date().getTime();
        return allMissions.filter(m => {
            const mDate = new Date(m.startTime || m.createdAt).getTime();
            const isFutureDate = mDate > now;
            const isInitialStatus = [MissionStatus.SCHEDULED, MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION].includes(m.status as MissionStatus);
            return isFutureDate && isInitialStatus;
        }).length;
    }, [allMissions]);
  
    // Final List: Apply Status Tab Filter on top of special criteria
    const filteredMissions = useMemo(() => {
        const isSearching = searchTerm && searchTerm.trim().length > 0;
        const hasActiveSpecialFilters = showPendingOnly || showUnapprovedOnly || showTomorrowOnly;

        return filteredBySpecialCriteria.filter(mission => {
            if (filterStatus !== 'ALL') {
                return mission.status === filterStatus;
            } else {
                // Default ALL view: Hide terminal statuses AND PENDING unless searching or special filter active
                if (!isSearching && !hasActiveSpecialFilters) {
                     const hiddenStatuses = [
                         MissionStatus.COMPLETED, 
                         MissionStatus.CANCELLED, 
                         MissionStatus.REFUSED,
                         MissionStatus.PENDING 
                     ];
                     if (hiddenStatuses.includes(mission.status as MissionStatus)) return false;
                }
            }
            return true;
        });
    }, [filteredBySpecialCriteria, filterStatus, searchTerm, showPendingOnly, showUnapprovedOnly, showTomorrowOnly]);
  
    const activeMapMissions = useMemo(() => {
        return allMissions.filter(m => {
            const isActive = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN, MissionStatus.SCHEDULED].includes(m.status);
            const hasCoords = !!extractCoordinates(m.mapLink || '');
            return isActive && hasCoords;
        }).map(m => ({
            ...m,
            position: extractCoordinates(m.mapLink || '')!
        }));
    }, [allMissions]);
  
    const getDelayMinutes = useCallback((m: Mission) => {
        const nowTime = new Date().getTime();
        const lastUpdateTime = new Date(m.lastUpdate).getTime();
        if (m.status === MissionStatus.IN_TRANSIT || m.status === MissionStatus.ORIGIN) {
            return Math.max(0, Math.floor((nowTime - lastUpdateTime) / 60000));
        }
        if (m.status === MissionStatus.SCHEDULED && m.startTime) {
            const scheduledTime = new Date(m.startTime).getTime();
            if (nowTime > scheduledTime) return Math.max(0, Math.floor((nowTime - scheduledTime) / 60000));
        }
        return 0; 
    }, []);
  
    const sortedMissions = useMemo(() => {
        return [...filteredMissions].sort((a, b) => {
            const delayA = getDelayMinutes(a);
            const delayB = getDelayMinutes(b);

            // Nível 1: Prioridade por ociosidade (missões ativas)
            // Ocioso ≥60min = topo absoluto | Atenção 30-59min = segundo | Atualizado <30min = terceiro
            const getAgingTier = (m: Mission, delay: number) => {
                const status = m.status as MissionStatus;
                const isActive = status === MissionStatus.IN_TRANSIT || status === MissionStatus.ORIGIN;
                if (!isActive) return 0;
                if (delay >= 60) return 3; // OCIOSO → topo
                if (delay >= 30) return 2; // ATENÇÃO → segundo
                return 1;                  // ATUALIZADO → terceiro
            };

            const tierA = getAgingTier(a, delayA);
            const tierB = getAgingTier(b, delayB);

            if (tierA !== tierB) return tierB - tierA;

            // Nível 2: Dentro do mesmo tier, prioriza por tipo de status
            const getStatusPriority = (m: Mission) => {
                const status = m.status as MissionStatus;
                if (status === MissionStatus.IN_TRANSIT) return 1000;
                if (status === MissionStatus.ORIGIN) return 900;
                return 0;
            };

            const spA = getStatusPriority(a);
            const spB = getStatusPriority(b);
            if (spA !== spB) return spB - spA;

            // Nível 3: Dentro do mesmo status, ordena pelo mais ocioso primeiro
            return delayB - delayA;
        });
    }, [filteredMissions, getDelayMinutes]);
  
    const handleOpenUpdateModal = (mission: Mission) => { setSelectedMission(mission); setIsUpdateModalOpen(true); };
    const handleUpdateSuccess = (reportText?: string) => { setIsUpdateModalOpen(false); setSelectedMission(null); fetchMissions(true); if (reportText) handleCopyToClipboard(reportText, 'relatorio', true); };
    const handleOpenStatusModal = async (mission: Mission) => { setMissionForStatusView(mission); setIsStatusModalOpen(true); const { data } = await supabase.from('mission_logs').select('*').eq('mission_id', mission.id).order('created_at', { ascending: false }); if (data) setMissionLogs(data as MissionLog[]); };
    const handleOpenFinancialModal = (mission: Mission) => { setMissionForFinancials(mission); setIsFinancialModalOpen(true); };
    const handleOpenPrintModal = (mission: Mission) => { setMissionForPrint(mission); setIsPrintModalOpen(true); };
    const handleDeleteClick = (mission: Mission) => { setMissionToDelete(mission); setDeletePassword(''); setIsDeleteModalOpen(true); };
    
    const handleCopyMission = async (mission: Mission) => {
        const dateObj = new Date(mission.startTime || mission.createdAt);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const formatFL = (name?: string) => { 
            if (!name || name === '---' || name === '') return 'N/A'; 
            const parts = name.trim().split(' '); 
            return parts.length > 2 ? `${parts[0]} ${parts[parts.length-1]}`.toUpperCase() : name.toUpperCase(); 
        };
        const fullLocationRaw = mission.currentLocation || "AGUARDANDO INÍCIO";
        const locationParts = fullLocationRaw.split('|');
        const addressPart = locationParts.length > 1 ? locationParts[1].trim() : locationParts[0].trim();
        const citySplit = addressPart.split('-');
        const cityField = citySplit.length > 1 ? citySplit[citySplit.length-2].split(',').pop()?.trim() + ' - ' + citySplit[citySplit.length-1].trim() : addressPart;
        const text = `*MONITORAMENTO GRUPO TMSEG*
*OS:* ${mission.id} | *STATUS:* ${mission.status.toUpperCase()}

🗓 *DATA:* ${dateStr} *HORA:* ${timeStr}
🛡 *OPERAÇÃO:* ${mission.mission_type?.toUpperCase() || 'CARACTERIZADA'}
🏢 *CLIENTE:* ${mission.client}

📍 *ORIGEM:* ${mission.origin || 'N/A'}
🏁 *DESTINO:* ${mission.destination || 'N/A'}

🚛 *VEÍCULO:* ${mission.clientVehicle?.plate || 'N/A'} (${mission.clientVehicle?.model || 'N/D'})
👤 *MOTORISTA:* ${formatFL(mission.driver_name)}
📞 *CONTATO:* ${mission.driver_phone || 'N/A'}

🚔 *VIATURA:* ${mission.vehicleId || 'N/A'}
👮 *AGENTE 01:* ${formatFL(mission.agent1)}
👮 *AGENTE 02:* ${formatFL(mission.agent2)}

*PROGRESSO DA MISSÃO:* ${Math.floor(mission.progress || 0)}%
📣 *OCORRÊNCIA:* ${locationParts[0].trim().toUpperCase()}
🏙️ *LOCALIZAÇÃO:* ${cityField.toUpperCase()}
🗾 *LINK DO GOOGLE:* ${mission.mapLink || 'N/A'}`;
        
        await handleCopyToClipboard(text, (mission.id || 'OS'), true);
    };
    
    const handleCopyEmail = (mission: Mission) => {
        const subject = `STATUS OS ${mission.id} - ${mission.client}`;
        const body = `Prezados, Segue status da operação: OS: ${mission.id} Status: ${mission.status} Local Atual: ${mission.currentLocation || 'N/A'} Atenciosamente, Grupo TMSEG`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };
    const handleCopyToClipboard = async (text: string, id: string, isReport = false) => { try { await navigator.clipboard.writeText(text); if(isReport) showNotification('Sucesso', 'Relatório WhatsApp Copiado!', 'success'); else { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } } catch (err) { console.error(err); } };
    const confirmDelete = async () => { if (!missionToDelete) return; setIsDeleting(true); try { await supabase.from('mission_logs').delete().eq('mission_id', missionToDelete.id); await supabase.from('missions').delete().eq('id', missionToDelete.id); await logAction('DELETE', 'Mission', missionToDelete.id, `Missão excluída por ${currentUser?.name}`); showNotification('Sucesso', 'Missão excluída', 'success'); setIsDeleteModalOpen(false); setMissionToDelete(null); fetchMissions(true); } catch (error: any) { showNotification('Erro', error.message, 'error'); } finally { setIsDeleting(false); } };
    const handleSearchHistory = async () => { if (!searchHistoryId.trim()) return; let sid = searchHistoryId.trim().toUpperCase(); if (!sid.startsWith('GTM-') && !isNaN(Number(sid))) sid = `GTM-${sid.padStart(4, '0')}`; setHistoryMissionId(sid); setIsHistoryModalOpen(true); };
    const handleViewHistory = (mission: Mission) => { setHistoryMissionId(mission.id); setIsHistoryModalOpen(true); };
  
    return (
      <div className="space-y-6 animate-fade-in pb-20 relative">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col xl:flex-row items-center justify-between gap-6">
          <div className="xl:w-[350px] shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
              <h2 className="text-xl font-bold text-gray-900">Monitoramento de Missões</h2>
            </div>
            {dbStatus === 'ok' && ( <div className="flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200 mt-2 ml-4.5"><Database size={12} /> Realtime Sync</div> )}
          </div>

          <div className="flex-1 w-full max-w-[450px]">
             <DailyGoalThermometer 
                viewPeriod={viewPeriod} 
                customStartDate={customStartDate} 
                customEndDate={customEndDate} 
             />
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-end xl:flex-1">
                {!isRestrictedClientView && ( <div className="flex items-center gap-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-200"><input type="text" className="bg-transparent text-xs font-bold text-indigo-900 placeholder-indigo-400 outline-none w-32 pl-2" placeholder="OS..." value={searchHistoryId} onChange={(e) => setSearchHistoryId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()} /><button onClick={handleSearchHistory} className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"><FileSearch size={14} /></button></div> )}
                <button onClick={() => setShowFleetMap(!showFleetMap)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showFleetMap ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}><Globe size={14} /> Mapa</button>
                {!isRestrictedClientView && ( <button onClick={() => setShowAnalyticsDash(!showAnalyticsDash)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showAnalyticsDash ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><BarChart4 size={14} /> Analytics</button> )}
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200"><Calendar size={14} className="text-gray-500 ml-1" /><select value={viewPeriod} onChange={(e) => setViewPeriod(e.target.value)} className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer uppercase focus:ring-0"><option value="TODAY">HOJE</option><option value="YESTERDAY">ONTEM</option><option value="WEEK">SEMANA</option><option value="MONTH">MÊS</option><option value="YEAR">ANO</option><option value="CUSTOM">PERSONALIZADO</option><option value="ALL">TOTAL ABERTOS</option></select></div>
                {viewPeriod === 'CUSTOM' && (
                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <input type="date" className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        <span className="text-gray-400 text-xs">até</span>
                        <input type="date" className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                    </div>
                )}
                {onNewMission && !isRestrictedClientView && ( <button onClick={onNewMission} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black px-4 py-2.5 rounded-lg text-[11px] font-black transition-all shadow-md uppercase"> <Plus size={16} /> Nova Missão </button> )}
          </div>
        </div>
  
        {!isRestrictedClientView && showAnalyticsDash && (
            <AnalyticsDashboard 
                missions={analyticsMissions} 
                isDirector = {isDirector} 
                clientTables={clientTables} 
                providerTables={providerTables} 
                clientsData={clientsData}
                currentTime={currentTime}
            />
        )}
        {isRestrictedClientView && showClientDash && (
            <ClientAnalyticsDashboard 
                missions={analyticsMissions} 
                clientTables={clientTables} 
                providerTables={providerTables} 
                clientsData={clientsData}
            />
        )}
  
        {showFleetMap && isLoaded && !loadError && (
            <div className="bg-white p-2 rounded-xl shadow-lg border border-gray-200 mb-6 animate-in slide-in-from-top-4">
                <div className="p-3 border-b border-gray-100 flex justify-between items-center mb-2"><h3 className="text-sm font-bold text-indigo-900 uppercase flex items-center gap-2"><Globe size={16} /> Frota Localizada ({activeMapMissions.length})</h3><button onClick={() => setShowFleetMap(false)} className="text-gray-400 hover:text-red-500"><XCircle size={18}/></button></div>
                <GoogleMap mapContainerStyle={mapContainerStyle} center={activeMapMissions.length > 0 ? activeMapMissions[0].position : defaultMapCenter} zoom={activeMapMissions.length > 0 ? 6 : 4} options={{ disableDefaultUI: true, zoomControl: true }}>
                  {activeMapMissions.map(m => ( 
                    <Marker 
                      key={m.id} 
                      position={m.position} 
                      icon={{ url: m.status === MissionStatus.IN_TRANSIT ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} 
                      onClick={() => setSelectedMapMission(m)} 
                    /> 
                  ))}
                  {selectedMapMission && ( 
                    <InfoWindow position={extractCoordinates(selectedMapMission.mapLink || '')!} onCloseClick={() => setSelectedMapMission(null)}>
                      <div className="p-1 min-w-[200px]">
                        <h4 className="font-bold text-sm mb-1">{selectedMapMission.client}</h4>
                        <p className="text-xs text-gray-600 font-bold mb-1">{selectedMapMission.vehicleId || 'Veículo N/A'}</p>
                        <p className="text-[10px] text-gray-500 mb-2">{selectedMapMission.currentLocation}</p>
                        <span className={`text-[9px] px-2 py-0.5 rounded text-white font-bold ${selectedMapMission.status === MissionStatus.IN_TRANSIT ? 'bg-green-600' : 'bg-blue-500'}`}>{selectedMapMission.status}</span>
                      </div>
                    </InfoWindow> 
                  )}
                </GoogleMap>
            </div>
        )}

        {loadError && (
            <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-red-700 flex flex-col md:flex-row items-center gap-6 mb-6 animate-in zoom-in-95">
                <div className="p-4 bg-white rounded-full shadow-md text-red-600"><AlertTriangle size={32} /></div>
                <div className="flex-1">
                    <p className="font-black uppercase text-sm tracking-tight">Erro na Chave de Mapa (Google Cloud)</p>
                    <p className="text-xs font-medium text-red-800/80 leading-relaxed max-w-2xl mt-1">
                        A chave de API do projeto <strong>Sistema TMSEGo</strong> foi recusada. Verifique se faturamento (Cartão de Crédito) está ativo no Google Cloud Console.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer" className="px-5 py-2 bg-red-700 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-red-800 transition-all flex items-center gap-2"><ExternalLink size={14}/> Console Google</a>
                </div>
            </div>
        )}
  
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {/* BOX TOTAL: Reflete o volume absoluto do período conforme solicitado */}
            <StatCard icon={Activity} title="Total" value={totalVolumeCount} bgColor="bg-gray-800" loading={isLoading} isActive={filterStatus === 'ALL' && !showPendingOnly && !showTomorrowOnly && !showUnapprovedOnly} onClick={() => { setFilterStatus('ALL'); setShowPendingOnly(false); setShowTomorrowOnly(false); setShowUnapprovedOnly(false); }} />
            {STATUS_CONFIG.map((status) => ( <StatCard key={status.id} icon={status.icon} title={status.label} value={statusCounts[status.id] || 0} bgColor={status.color} loading={isLoading} isActive={filterStatus === status.id} onClick={() => { setFilterStatus(status.id); }} /> ))}
        </div>
  
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-0 z-20">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 backdrop-blur-sm flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
                <div className="relative flex-1 max-w-md">
                    <input type="text" placeholder="OS, Cliente, Placa, Motorista..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
                </div>
          
                <div className="flex items-center gap-2">
                    {(isDanielPinto || isDirector) && (
                        <button 
                        onClick={() => setShowTomorrowOnly(!showTomorrowOnly)} 
                        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                            showTomorrowOnly 
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-105 ring-2 ring-indigo-500/20' 
                            : (tomorrowCount > 0 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' 
                                : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50')
                        }`}
                        >
                        <CalendarPlus size={16} /> 
                        {showTomorrowOnly ? (
                            <span className="flex items-center gap-1.5">FILTRO FUTURO <span className="text-[8px] font-black">ON</span></span>
                        ) : (
                            <span className="flex items-center gap-1.5">AGENDAMENTOS FUTUROS {tomorrowCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-indigo-600 text-white font-bold">{tomorrowCount}</span>}</span>
                        )}
                        </button>
                    )}

                    <button onClick={() => setShowPendingOnly(!showPendingOnly)} className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase border transition-all ${showPendingOnly ? 'bg-orange-50 text-black border-orange-600 shadow-md' : pendingCount > 0 ? 'bg-orange-50 text-black border-orange-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{pendingCount > 0 ? ( <AlertTriangle size={16} className="text-black" /> ) : ( showPendingOnly ? <ToggleRight size={16} /> : <ToggleLeft size={16} /> )}{showPendingOnly ? 'Exibindo Pendências' : 'Filtrar Pendências'}{pendingCount > 0 && ( <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-white text-orange-700 font-bold">{pendingCount}</span> )}</button>
                    
                    {(isDirector || isAdmin || canEditMission) && (
                        <button 
                            onClick={() => setShowUnapprovedOnly(!showUnapprovedOnly)} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase border transition-all ${showUnapprovedOnly ? 'bg-blue-50 text-blue-800 border-blue-600 shadow-md' : unapprovedCount > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        >
                            <ShieldAlert size={16} className={showUnapprovedOnly ? "text-blue-800" : "text-blue-600"} />
                            {showUnapprovedOnly ? 'Não Auditadas (ON)' : 'Sem Aprovação'}
                            {unapprovedCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-blue-600 text-white font-bold">{unapprovedCount}</span>}
                        </button>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500"><span className="hidden md:inline">Filtrados:</span><span className="font-bold text-gray-800 bg-gray-200 px-2 py-1 rounded">{filteredMissions.length}</span></div></div>
  
          <div className="bg-gray-50/5 p-4 min-h-[400px]">
              {isLoading ? ( <div className="flex flex-col items-center justify-center h-64 text-gray-400"><Loader2 size={32} className="animate-spin mb-2 text-red-600" /><p className="text-sm font-medium">Carregando...</p></div> ) : sortedMissions.length === 0 ? ( <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white"><Activity size={48} className="mb-2 opacity-20" /><p className="text-sm font-bold text-gray-500">Nenhuma missão encontrada para este filtro.</p></div> ) : (
                  <div className="flex flex-col gap-3">
                      {sortedMissions.map((mission) => {
                          const diffMinutes = getDelayMinutes(mission);
                          const isPending = isMissionPending(mission);
                          const isRedLight = isPending || [MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status) || (diffMinutes > 60 && ![MissionStatus.COMPLETED].includes(mission.status));
                          return (
                              <div key={mission.id} className="relative">
                                  <MissionCard 
                                      mission={mission}
                                      canEditMission={canEditMission}
                                      isDirector={isDirector}
                                      isRedLight={isRedLight}
                                      isImminent={mission.status === MissionStatus.IN_TRANSIT && diffMinutes > 30 && diffMinutes <= 60}
                                      minutesSinceUpdate={diffMinutes}
                                      copiedId={copiedId}
                                      onViewMap={handleOpenStatusModal}
                                      onUpdate={handleOpenUpdateModal}
                                      onOpenFinancials={handleOpenFinancialModal} 
                                      onCopy={handleCopyMission}
                                      onCopyEmail={handleCopyEmail}
                                      onDelete={handleDeleteClick}
                                      hideProviderInfo={isRestrictedClientView}
                                      onPrint={handleOpenPrintModal}
                                      onViewHistory={handleViewHistory}
                                      clientTables={clientTables}
                                      providerTables={providerTables}
                                      clientsData={clientsData}
                                      agentPhonesMap={agentPhonesMap}
                                      currentTime={currentTime}
                                  />
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
        </div>
  
        {isStatusModalOpen && <MissionStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} mission={missionForStatusView!} logs={missionLogs} onUpdate={() => fetchMissions(true)} />}
        {isFinancialModalOpen && <MissionFinancialModal isOpen={isFinancialModalOpen} onClose={() => setIsFinancialModalOpen(false)} mission={missionForFinancials} onUpdate={() => fetchMissions(true)} />}
        {isHistoryModalOpen && <MissionHistoryModal missionId={historyMissionId} onClose={() => setIsHistoryModalOpen(false)} />}
        {isUpdateModalOpen && <UpdateMissionModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} mission={selectedMission} currentUser={currentUser} onSuccess={handleUpdateSuccess} />}
        {isPrintModalOpen && missionForPrint && <MissionPrintModal mission={missionForPrint} onClose={() => setIsPrintModalOpen(false)} />}
        {isDeleteModalOpen && missionToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-sm overflow-hidden border border-red-200">
                    <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3"><div className="p-2 bg-red-100 rounded-full text-red-600"><Trash2 size={24} /></div><h3 className="text-lg font-bold text-red-900">Excluir?</h3></div>
                    <div className="p-6 space-y-4"><p className="text-sm text-gray-600">Confirma exclusão de <strong>{missionToDelete.id}</strong>?</p>{!isDirector && (<div><label className="text-xs font-bold text-gray-500 mb-1 block">Senha</label><div className="relative"><input type="password" className="w-full p-2 pl-9 border rounded" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>)}</div>
                    <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 border rounded text-xs">Sair</button><button onClick={confirmDelete} disabled={isDeleting || (!isDirector && !deletePassword)} className="px-4 py-2 bg-red-600 text-white rounded-xs flex items-center gap-2">Confirmar</button></div>
                </div>
            </div>
        )}
      </div>
    );
  };
  
  export default MissionTable;