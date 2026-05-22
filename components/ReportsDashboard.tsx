
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
    FileBarChart, Calendar, Clock, User, Download, Search, Loader2, 
    ArrowRight, Shield, Activity, FileText, BarChart2, PieChart, Users, 
    MousePointer2, AlertTriangle, CheckCircle2, TrendingUp, List, MapPin, 
    Building2, Briefcase, Printer, Filter, Zap, Scale
} from 'lucide-react';
import { SystemLog, MissionStatus } from '../types';

const formatCurrencyBR = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface AutoEngineLogRow {
    logId: string;
    createdAt: string;
    userName: string;
    missionId: string;
    suggestedTotal: number;
    savedCost: number;
    divergence: number;
    divergent: boolean;
    bandKm: number | null;
    realKm: number | null;
    goldenHours: number | null;
    provider: string;
    client: string;
}

interface UserStats {
    userId: string;
    userName: string;
    totalActions: number;
    createCount: number;
    updateCount: number;
    deleteCount: number;
    navCount: number; // Navegação
    lastActivity: string;
    score: number; // Pontuação de produtividade
}

const ReportsDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'ranking' | 'logs' | 'timeline' | 'autoEngine'>('dashboard');
    
    // Helper para formatar data local (YYYY-MM-DD)
    const getLocalISODate = (date: Date) => {
        return date.toLocaleDateString('en-CA');
    };

    const [startDate, setStartDate] = useState(getLocalISODate(new Date()));
    const [endDate, setEndDate] = useState(getLocalISODate(new Date()));
    const [isLoading, setIsLoading] = useState(false);
    
    // Dados Raw
    const [logs, setLogs] = useState<SystemLog[]>([]);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    
    // Timeline
    const [timelineMissions, setTimelineMissions] = useState<any[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [timelineClientFilter, setTimelineClientFilter] = useState('');
    const [timelineProviderFilter, setTimelineProviderFilter] = useState('');
    const [timelineStatusFilter, setTimelineStatusFilter] = useState('');

    // Motor Automático vs Manual (Task #57)
    const [autoEngineRows, setAutoEngineRows] = useState<AutoEngineLogRow[]>([]);
    const [autoEngineLoading, setAutoEngineLoading] = useState(false);
    const [autoEngineProviderFilter, setAutoEngineProviderFilter] = useState('');
    const [autoEngineOnlyDivergent, setAutoEngineOnlyDivergent] = useState(false);

    useEffect(() => {
        fetchData();
        if (activeTab === 'timeline') fetchTimelineData();
        if (activeTab === 'autoEngine') fetchAutoEngineData();
    }, [startDate, endDate]);

    useEffect(() => {
        if (activeTab === 'timeline' && timelineMissions.length === 0) fetchTimelineData();
        if (activeTab === 'autoEngine') fetchAutoEngineData();
    }, [activeTab]);

    const fetchAutoEngineData = async () => {
        setAutoEngineLoading(true);
        try {
            const { data: logsData, error: logsErr } = await supabase
                .from('system_logs')
                .select('id, created_at, user_name, entity_id, details')
                .eq('entity', 'Mission')
                .eq('action_type', 'FINANCIAL_RECALC')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(5000);
            if (logsErr) throw logsErr;

            const parsed: Array<Omit<AutoEngineLogRow, 'provider' | 'client'> & { missionId: string }> = [];
            (logsData || []).forEach((l: any) => {
                try {
                    const d = typeof l.details === 'string' ? JSON.parse(l.details) : (l.details || {});
                    if ((d.source || '') !== 'provider_auto_engine') return;
                    const suggested = Number(d.suggestedTotal) || 0;
                    const saved = Number(d.savedCost) || 0;
                    parsed.push({
                        logId: l.id,
                        createdAt: l.created_at,
                        userName: l.user_name || '-',
                        missionId: String(l.entity_id),
                        suggestedTotal: suggested,
                        savedCost: saved,
                        divergence: saved - suggested,
                        divergent: !!d.divergent || Math.abs(saved - suggested) > 0.01,
                        bandKm: d.bandKm != null ? Number(d.bandKm) : null,
                        realKm: d.realKm != null ? Number(d.realKm) : null,
                        goldenHours: d.goldenHours != null ? Number(d.goldenHours) : null,
                    });
                } catch { /* ignore malformed log */ }
            });

            const missionIds = Array.from(new Set(parsed.map(p => p.missionId))).filter(Boolean);
            const missionInfo: Record<string, { provider: string; client: string }> = {};
            if (missionIds.length > 0) {
                const CHUNK = 200;
                for (let i = 0; i < missionIds.length; i += CHUNK) {
                    const slice = missionIds.slice(i, i + CHUNK);
                    const { data: mData, error: mErr } = await supabase
                        .from('missions')
                        .select('id, provider, client')
                        .in('id', slice);
                    if (mErr) throw mErr;
                    (mData || []).forEach((m: any) => {
                        missionInfo[String(m.id)] = { provider: m.provider || '-', client: m.client || '-' };
                    });
                }
            }

            const enriched: AutoEngineLogRow[] = parsed.map(p => ({
                ...p,
                provider: missionInfo[p.missionId]?.provider || '—',
                client: missionInfo[p.missionId]?.client || '—',
            }));
            setAutoEngineRows(enriched);
        } catch (e) {
            console.error('Erro ao carregar relatório do motor automático:', e);
        } finally {
            setAutoEngineLoading(false);
        }
    };

    const fetchTimelineData = async () => {
        setTimelineLoading(true);
        try {
            const { data, error } = await supabase
                .from('missions')
                .select('id, client, provider, origin, destination, status, mission_type, created_at, startTime, endTime, start_km, end_km, vehicle_id, agent1, agent2, is_same_os, revenue_value, cost_value, toll_value, billing_approved')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setTimelineMissions(data || []);
        } catch (e) {
            console.error('Erro ao carregar timeline:', e);
        } finally {
            setTimelineLoading(false);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Busca expandida para incluir mais tipos de ações se necessário
            const { data, error } = await supabase
                .from('system_logs')
                .select('id, created_at, user_name, action_type, entity, entity_id, details')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(2000);

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error(error);
            alert('Erro ao carregar dados. Verifique a conexão.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickFilter = (period: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') => {
        const now = new Date();
        let start = new Date();
        const end = new Date();

        if (period === 'WEEK') {
            start.setDate(now.getDate() - 7);
        } else if (period === 'MONTH') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'YEAR') {
            start = new Date(now.getFullYear(), 0, 1);
        }
        // Para TODAY, start já é agora.

        setStartDate(getLocalISODate(start));
        setEndDate(getLocalISODate(end));
    };

    // --- PROCESSAMENTO DE DADOS ---

    const processedStats = useMemo(() => {
        const stats: Record<string, UserStats> = {};
        let totalSystemActions = 0;
        const actionDistribution: Record<string, number> = {
            CREATE: 0, UPDATE: 0, DELETE: 0, LOGIN: 0, OTHER: 0
        };

        logs.forEach(log => {
            const key = log.user_name || 'Sistema/Desconhecido';
            
            if (!stats[key]) {
                stats[key] = {
                    userId: log.entity_id, // Pode não ser exato se o log for genérico
                    userName: key,
                    totalActions: 0,
                    createCount: 0,
                    updateCount: 0,
                    deleteCount: 0,
                    navCount: 0,
                    lastActivity: log.created_at,
                    score: 0
                };
            }

            // Update Last Activity (Logs are sorted desc, so first hit is latest)
            // Mas como estamos iterando, precisamos garantir que pegamos o maior valor
            if (new Date(log.created_at) > new Date(stats[key].lastActivity)) {
                stats[key].lastActivity = log.created_at;
            }

            stats[key].totalActions++;
            totalSystemActions++;

            // Categorização
            if (log.action_type === 'CREATE') {
                stats[key].createCount++;
                actionDistribution.CREATE++;
                stats[key].score += 5; // Criar vale mais pontos
            } else if (log.action_type === 'UPDATE') {
                stats[key].updateCount++;
                actionDistribution.UPDATE++;
                stats[key].score += 2; // Atualizar vale pontos médios
            } else if (log.action_type === 'DELETE') {
                stats[key].deleteCount++;
                actionDistribution.DELETE++;
                stats[key].score += 3; // Deletar é ação crítica
            } else if (log.entity === 'Navigation') {
                stats[key].navCount++;
                actionDistribution.OTHER++; // Navegação entra em outros
                stats[key].score += 0.1; // Navegar vale pouco
            } else if (log.action_type === 'LOGIN') {
                actionDistribution.LOGIN++;
            } else {
                actionDistribution.OTHER++;
                stats[key].score += 1;
            }
        });

        // Ordenar usuários por pontuação (score)
        const sortedUsers = Object.values(stats).sort((a, b) => b.score - a.score);

        return {
            users: sortedUsers,
            totalActions: totalSystemActions,
            actionDistribution
        };
    }, [logs]);

    const filteredLogs = logs.filter(log => {
        const term = searchTerm.toLowerCase();
        return (log.user_name || '').toLowerCase().includes(term) ||
            (log.details || '').toLowerCase().includes(term) ||
            (log.entity || '').toLowerCase().includes(term);
    });

    const handlePrint = () => {
        window.print();
    };

    // Componente de Barra de Progresso Simples
    const ProgressBar = ({ value, max, colorClass }: { value: number, max: number, colorClass: string }) => {
        const width = Math.min(100, Math.max(0, (value / max) * 100));
        return (
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${colorClass}`} style={{ width: `${width}%` }}></div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            
            {/* CABEÇALHO */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <Activity className="text-red-600" /> Relatórios Analíticos & Gestão
                    </h2>
                    <p className="text-sm text-gray-500 mt-1 ml-9">
                        Análise completa de comportamento, produtividade e auditoria do sistema.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 no-print">
                    
                    {/* Botões Rápidos */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => handleQuickFilter('TODAY')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Hoje</button>
                        <button onClick={() => handleQuickFilter('WEEK')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Semana</button>
                        <button onClick={() => handleQuickFilter('MONTH')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Mês</button>
                        <button onClick={() => handleQuickFilter('YEAR')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Ano</button>
                    </div>

                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <Calendar size={16} className="text-gray-500 ml-1" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none cursor-pointer"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-gray-400">-</span>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none cursor-pointer"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <button onClick={handlePrint} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
                        <Download size={16} /> Exportar
                    </button>
                </div>
            </div>

            {/* NAVEGAÇÃO DE ABAS */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit no-print">
                <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <PieChart size={16} /> Visão Geral
                </button>
                <button 
                    onClick={() => setActiveTab('ranking')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'ranking' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Users size={16} /> Ranking de Usuários
                </button>
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'logs' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <FileText size={16} /> Logs Detalhados
                </button>
                <button 
                    onClick={() => setActiveTab('timeline')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'timeline' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid="tab-timeline"
                >
                    <List size={16} /> Timeline de OS
                </button>
                <button 
                    onClick={() => setActiveTab('autoEngine')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'autoEngine' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid="tab-auto-engine"
                >
                    <Zap size={16} /> Motor Auto vs Manual
                </button>
            </div>

            {/* CONTEÚDO */}
            <div className="min-h-[400px]">
                
                {/* 1. DASHBOARD OVERVIEW */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Interações Totais</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{processedStats.totalActions}</h3>
                                    </div>
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><MousePointer2 size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Cliques e ações registradas no período</div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Usuário + Ativo</p>
                                        <h3 className="text-lg font-black text-gray-900 mt-1 truncate max-w-[150px]" title={processedStats.users[0]?.userName}>
                                            {processedStats.users[0]?.userName || '-'}
                                        </h3>
                                    </div>
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-green-600 font-bold">Top Performance</div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Novos Registros</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{processedStats.actionDistribution.CREATE}</h3>
                                    </div>
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Missões, Clientes, etc.</div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Edições / Atualizações</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{processedStats.actionDistribution.UPDATE}</h3>
                                    </div>
                                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Activity size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Alterações no sistema</div>
                            </div>
                        </div>

                        {/* Charts Area */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Distribuição de Ações */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><PieChart size={18} /> Distribuição de Ações</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Criação (Create)</span>
                                            <span>{Math.round((processedStats.actionDistribution.CREATE / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-green-500" style={{ width: `${(processedStats.actionDistribution.CREATE / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Atualização (Update)</span>
                                            <span>{Math.round((processedStats.actionDistribution.UPDATE / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${(processedStats.actionDistribution.UPDATE / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Exclusão (Delete)</span>
                                            <span>{Math.round((processedStats.actionDistribution.DELETE / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-red-500" style={{ width: `${(processedStats.actionDistribution.DELETE / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Navegação / Outros</span>
                                            <span>{Math.round((processedStats.actionDistribution.OTHER / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-gray-400" style={{ width: `${(processedStats.actionDistribution.OTHER / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Top 5 Usuários */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Users size={18} /> Top 5 Usuários Ativos</h3>
                                <div className="space-y-4">
                                    {processedStats.users.slice(0, 5).map((user, idx) => (
                                        <div key={user.userName} className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold text-gray-700 truncate max-w-[150px]">{user.userName}</span>
                                                    <span className="text-gray-500">{user.totalActions} ações</span>
                                                </div>
                                                <ProgressBar value={user.totalActions} max={processedStats.users[0].totalActions} colorClass="bg-indigo-600" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. RANKING DE USUÁRIOS */}
                {activeTab === 'ranking' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-right-4">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 font-bold text-sm text-gray-700">
                            Gestão de Produtividade da Equipe
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3">Posição</th>
                                        <th className="px-6 py-3">Usuário</th>
                                        <th className="px-6 py-3 text-center">Score Produtividade</th>
                                        <th className="px-6 py-3 text-center">Cadastros</th>
                                        <th className="px-6 py-3 text-center">Edições</th>
                                        <th className="px-6 py-3 text-center">Navegação</th>
                                        <th className="px-6 py-3 text-right">Última Atividade</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {processedStats.users.map((user, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${
                                                    idx === 0 ? 'bg-yellow-100 text-yellow-800' :
                                                    idx === 1 ? 'bg-gray-200 text-gray-700' :
                                                    idx === 2 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'
                                                }`}>
                                                    {idx + 1}º
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                                                        {user.userName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-800">{user.userName}</p>
                                                        <p className="text-[10px] text-gray-400">{user.totalActions} logs totais</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-sm font-black text-indigo-900">{user.score.toFixed(1)}</span>
                                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1">
                                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(user.score / processedStats.users[0].score) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-green-600 font-bold bg-green-50/30">
                                                {user.createCount}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-blue-600 font-bold bg-blue-50/30">
                                                {user.updateCount}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-gray-500">
                                                {user.navCount}
                                            </td>
                                            <td className="px-6 py-4 text-right text-xs text-gray-500">
                                                {new Date(user.lastActivity).toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. LOGS DETALHADOS (AUDITORIA) */}
                {activeTab === 'logs' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-2">
                            <Search className="text-gray-400" size={20} />
                            <input 
                                type="text" 
                                placeholder="Filtrar logs por usuário, ação ou detalhe..." 
                                className="flex-1 outline-none text-sm text-gray-700"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3">Data/Hora</th>
                                            <th className="px-6 py-3">Usuário</th>
                                            <th className="px-6 py-3">Tipo Ação</th>
                                            <th className="px-6 py-3">Entidade</th>
                                            <th className="px-6 py-3">Detalhes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredLogs.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhum log encontrado para o filtro.</td></tr>
                                        ) : filteredLogs.slice(0, 100).map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                                                    {new Date(log.created_at).toLocaleString('pt-BR')}
                                                </td>
                                                <td className="px-6 py-3 text-xs font-bold text-gray-700">
                                                    {log.user_name}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                                        log.action_type === 'CREATE' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        log.action_type === 'DELETE' ? 'bg-red-50 text-red-700 border-red-200' :
                                                        log.action_type === 'UPDATE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        log.action_type === 'LOGIN' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                        'bg-gray-50 text-gray-600 border-gray-200'
                                                    }`}>
                                                        {log.action_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-xs font-medium text-gray-600">
                                                    {log.entity} <span className="text-gray-400 text-[9px]">#{log.entity_id}</span>
                                                </td>
                                                <td className="px-6 py-3 text-xs text-gray-600 max-w-md truncate" title={log.details}>
                                                    {log.details}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredLogs.length > 100 && (
                                    <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-200">
                                        Exibindo os 100 logs mais recentes de {filteredLogs.length} encontrados. Use o filtro para refinar.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'timeline' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex flex-wrap gap-3 items-center no-print">
                            <div className="flex items-center gap-2">
                                <Filter size={14} className="text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Filtrar cliente..."
                                    value={timelineClientFilter}
                                    onChange={e => setTimelineClientFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-40"
                                    data-testid="input-timeline-client-filter"
                                />
                                <input
                                    type="text"
                                    placeholder="Filtrar fornecedor..."
                                    value={timelineProviderFilter}
                                    onChange={e => setTimelineProviderFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-40"
                                    data-testid="input-timeline-provider-filter"
                                />
                                <select
                                    value={timelineStatusFilter}
                                    onChange={e => setTimelineStatusFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                                    data-testid="select-timeline-status-filter"
                                >
                                    <option value="">Todos os Status</option>
                                    <option value="COMPLETED">Concluída</option>
                                    <option value="IN_PROGRESS">Em Andamento</option>
                                    <option value="PENDING">Pendente</option>
                                    <option value="CANCELLED">Cancelada</option>
                                </select>
                            </div>
                            <button
                                onClick={() => window.print()}
                                className="ml-auto px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                data-testid="btn-print-timeline"
                            >
                                <Printer size={14} /> Imprimir
                            </button>
                        </div>

                        {timelineLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 size={32} className="animate-spin text-red-500" />
                            </div>
                        ) : (() => {
                            const filtered = timelineMissions.filter(m => {
                                if (timelineClientFilter && !(m.client || '').toUpperCase().includes(timelineClientFilter.toUpperCase())) return false;
                                if (timelineProviderFilter && !(m.provider || '').toUpperCase().includes(timelineProviderFilter.toUpperCase())) return false;
                                if (timelineStatusFilter && m.status !== timelineStatusFilter) return false;
                                return true;
                            });

                            const grouped: Record<string, any[]> = {};
                            filtered.forEach(m => {
                                const dateKey = new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                                if (!grouped[dateKey]) grouped[dateKey] = [];
                                grouped[dateKey].push(m);
                            });

                            const sortedDates = Object.keys(grouped).sort((a, b) => {
                                const [dA, mA, yA] = a.split('/').map(Number);
                                const [dB, mB, yB] = b.split('/').map(Number);
                                return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
                            });

                            const statusLabel = (s: string) => {
                                if (s === 'COMPLETED') return { text: 'Concluída', color: 'bg-emerald-100 text-emerald-700' };
                                if (s === 'IN_PROGRESS') return { text: 'Em Andamento', color: 'bg-blue-100 text-blue-700' };
                                if (s === 'PENDING') return { text: 'Pendente', color: 'bg-amber-100 text-amber-700' };
                                if (s === 'CANCELLED') return { text: 'Cancelada', color: 'bg-red-100 text-red-700' };
                                return { text: s || '-', color: 'bg-gray-100 text-gray-600' };
                            };

                            const extractCity = (addr: string) => {
                                if (!addr) return '-';
                                const parts = addr.split(',');
                                if (parts.length >= 2) {
                                    const cityPart = parts[1]?.trim().split('-')[0]?.trim();
                                    if (cityPart && cityPart.length > 2) return cityPart;
                                }
                                return parts[0]?.trim().substring(0, 30) || '-';
                            };

                            let globalCounter = 0;

                            return (
                                <div className="space-y-6">
                                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-lg font-black text-gray-800">{filtered.length} <span className="text-sm font-bold text-gray-500">OS criadas no período</span></p>
                                            <p className="text-[10px] text-gray-400">{sortedDates.length} dia(s) com atividade</p>
                                        </div>
                                        <div className="flex gap-4 text-center">
                                            <div>
                                                <p className="text-lg font-black text-emerald-600">{filtered.filter(m => m.status === 'COMPLETED').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Concluídas</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-blue-600">{filtered.filter(m => m.status === 'IN_PROGRESS').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Em Andamento</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-amber-600">{filtered.filter(m => m.status === 'PENDING').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Pendentes</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-red-600">{filtered.filter(m => m.status === 'CANCELLED').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Canceladas</p>
                                            </div>
                                        </div>
                                    </div>

                                    {sortedDates.map(dateStr => {
                                        const dayMissions = grouped[dateStr];
                                        return (
                                            <div key={dateStr} className="relative">
                                                <div className="sticky top-0 z-10 bg-gradient-to-r from-red-600 to-red-700 text-white px-5 py-2.5 rounded-xl shadow-md flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <Calendar size={18} />
                                                        <span className="font-black text-sm uppercase tracking-wider">{dateStr}</span>
                                                    </div>
                                                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">{dayMissions.length} OS</span>
                                                </div>

                                                <div className="space-y-1.5 pl-2">
                                                    {dayMissions.map((m: any) => {
                                                        globalCounter++;
                                                        const st = statusLabel(m.status);
                                                        const hora = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                                                        const revTotal = (m.revenue_value || 0) + (m.toll_value || 0);
                                                        const costTotal = (m.cost_value || 0) + (m.toll_value || 0);
                                                        
                                                        return (
                                                            <div key={m.id} className="flex items-stretch gap-3 group" data-testid={`timeline-row-${m.id}`}>
                                                                <div className="flex flex-col items-center">
                                                                    <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">{globalCounter}</div>
                                                                    <div className="w-0.5 flex-1 bg-gray-200 group-last:hidden" />
                                                                </div>

                                                                <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow mb-1">
                                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-black text-sm text-gray-900" data-testid={`timeline-id-${m.id}`}>{m.id}</span>
                                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.text}</span>
                                                                            {m.is_same_os && <span className="text-[8px] font-black bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">MESMA OS</span>}
                                                                            {m.billing_approved && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">FATURADO</span>}
                                                                            {m.mission_type && <span className="text-[8px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full uppercase">{m.mission_type}</span>}
                                                                        </div>
                                                                        <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1"><Clock size={10} /> {hora}</span>
                                                                    </div>
                                                                    
                                                                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-[10px]">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Building2 size={11} className="text-blue-500" />
                                                                            <span className="font-bold text-gray-700 truncate max-w-[200px]">{m.client || '-'}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Briefcase size={11} className="text-indigo-500" />
                                                                            <span className="font-bold text-gray-600 truncate max-w-[200px]">{m.provider || 'Pendente'}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-gray-500">
                                                                            <MapPin size={11} className="text-red-400" />
                                                                            <span className="truncate max-w-[150px]">{extractCity(m.origin)}</span>
                                                                            <ArrowRight size={10} />
                                                                            <span className="truncate max-w-[150px]">{extractCity(m.destination)}</span>
                                                                        </div>
                                                                    </div>

                                                                    {(revTotal > 0 || costTotal > 0) && (
                                                                        <div className="flex gap-4 mt-2 text-[10px]">
                                                                            <span className="font-bold text-green-700">Receita: R$ {revTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                            <span className="font-bold text-blue-700">Custo: R$ {costTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                            {revTotal > 0 && costTotal > 0 && (
                                                                                <span className={`font-black ${revTotal - costTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                                    Margem: {((1 - costTotal / revTotal) * 100).toFixed(1)}%
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {filtered.length === 0 && (
                                        <div className="text-center py-20 text-gray-400">
                                            <List size={48} className="mx-auto mb-4 opacity-30" />
                                            <p className="font-bold text-lg">Nenhuma OS encontrada</p>
                                            <p className="text-sm">Ajuste o período ou os filtros para ver resultados.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* 5. MOTOR AUTOMÁTICO vs MANUAL (Task #57) */}
                {activeTab === 'autoEngine' && (() => {
                    const filtered = autoEngineRows.filter(r => {
                        if (autoEngineProviderFilter && !(r.provider || '').toUpperCase().includes(autoEngineProviderFilter.toUpperCase())) return false;
                        if (autoEngineOnlyDivergent && !r.divergent) return false;
                        return true;
                    });
                    const totalSuggested = filtered.reduce((a, r) => a + r.suggestedTotal, 0);
                    const totalSaved = filtered.reduce((a, r) => a + r.savedCost, 0);
                    const totalDivergence = totalSaved - totalSuggested;
                    const divergentCount = filtered.filter(r => r.divergent).length;

                    const byProvider: Record<string, { provider: string; count: number; suggested: number; saved: number; divergent: number }> = {};
                    filtered.forEach(r => {
                        const key = (r.provider || '—').toUpperCase().trim();
                        if (!byProvider[key]) byProvider[key] = { provider: r.provider || '—', count: 0, suggested: 0, saved: 0, divergent: 0 };
                        byProvider[key].count++;
                        byProvider[key].suggested += r.suggestedTotal;
                        byProvider[key].saved += r.savedCost;
                        if (r.divergent) byProvider[key].divergent++;
                    });
                    const providerRows = Object.values(byProvider).sort((a, b) => Math.abs(b.saved - b.suggested) - Math.abs(a.saved - a.suggested));

                    const handleExportCsv = () => {
                        const header = ['Data/Hora', 'OS', 'Cliente', 'Fornecedor', 'KM Real', 'Faixa KM', 'Horas (Regra Ouro)', 'Custo Sugerido (Motor)', 'Custo Salvo', 'Divergência', 'Usuário'];
                        const lines = [header.join(';')];
                        filtered.forEach(r => {
                            lines.push([
                                new Date(r.createdAt).toLocaleString('pt-BR'),
                                r.missionId,
                                (r.client || '').replace(/;/g, ','),
                                (r.provider || '').replace(/;/g, ','),
                                r.realKm ?? '',
                                r.bandKm ?? '',
                                r.goldenHours != null ? r.goldenHours.toFixed(2) : '',
                                r.suggestedTotal.toFixed(2).replace('.', ','),
                                r.savedCost.toFixed(2).replace('.', ','),
                                r.divergence.toFixed(2).replace('.', ','),
                                (r.userName || '').replace(/;/g, ','),
                            ].join(';'));
                        });
                        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `motor_auto_vs_manual_${startDate}_${endDate}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    };

                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex flex-wrap gap-3 items-center no-print">
                                <div className="flex items-center gap-2">
                                    <Filter size={14} className="text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar fornecedor..."
                                        value={autoEngineProviderFilter}
                                        onChange={e => setAutoEngineProviderFilter(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-48"
                                        data-testid="input-auto-engine-provider-filter"
                                    />
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoEngineOnlyDivergent}
                                            onChange={e => setAutoEngineOnlyDivergent(e.target.checked)}
                                            className="accent-red-600"
                                            data-testid="checkbox-auto-engine-divergent"
                                        />
                                        Apenas divergentes
                                    </label>
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={handleExportCsv}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-export-auto-engine-csv"
                                    >
                                        <Download size={14} /> CSV
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-print-auto-engine"
                                    >
                                        <Printer size={14} /> Imprimir
                                    </button>
                                </div>
                            </div>

                            {autoEngineLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 size={32} className="animate-spin text-red-500" />
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">OS calculadas pelo motor</p>
                                            <p className="text-2xl font-black text-indigo-700" data-testid="kpi-auto-engine-count">{filtered.length}</p>
                                            <p className="text-[9px] text-gray-500 font-bold mt-1">{divergentCount} divergente(s)</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Custo Sugerido (Motor)</p>
                                            <p className="text-lg font-black text-blue-700 font-mono" data-testid="kpi-auto-engine-suggested">{formatCurrencyBR(totalSuggested)}</p>
                                            <p className="text-[9px] text-blue-500 font-bold mt-1">Total no período</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Custo Salvo (Canônico)</p>
                                            <p className="text-lg font-black text-amber-700 font-mono" data-testid="kpi-auto-engine-saved">{formatCurrencyBR(totalSaved)}</p>
                                            <p className="text-[9px] text-amber-500 font-bold mt-1">Total no período</p>
                                        </div>
                                        <div className={`p-4 rounded-xl border-2 shadow-sm ${Math.abs(totalDivergence) > 0.01 ? (totalDivergence > 0 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50') : 'border-gray-200 bg-white'}`}>
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Divergência (Salvo − Sugerido)</p>
                                            <p className={`text-lg font-black font-mono ${totalDivergence > 0.01 ? 'text-red-700' : totalDivergence < -0.01 ? 'text-emerald-700' : 'text-gray-700'}`} data-testid="kpi-auto-engine-divergence">
                                                {totalDivergence >= 0 ? '+' : ''}{formatCurrencyBR(totalDivergence)}
                                            </p>
                                            <p className="text-[9px] text-gray-500 font-bold mt-1">{totalDivergence > 0.01 ? 'Salvou MAIS que o motor' : totalDivergence < -0.01 ? 'Salvou MENOS que o motor' : 'Sem desvio'}</p>
                                        </div>
                                    </div>

                                    {/* Totalizador por fornecedor */}
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200">
                                            <h4 className="text-xs font-black text-indigo-800 uppercase flex items-center gap-2">
                                                <Scale size={14} /> Totalizador por Fornecedor
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[9px] font-black text-indigo-700 uppercase bg-indigo-50/40">
                                                        <th className="px-4 py-2">Fornecedor</th>
                                                        <th className="px-4 py-2 text-right">OS</th>
                                                        <th className="px-4 py-2 text-right">Divergentes</th>
                                                        <th className="px-4 py-2 text-right">Sugerido (Motor)</th>
                                                        <th className="px-4 py-2 text-right">Salvo</th>
                                                        <th className="px-4 py-2 text-right">Divergência</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {providerRows.length === 0 ? (
                                                        <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">Nenhum registro do motor automático no período.</td></tr>
                                                    ) : providerRows.map((p, i) => {
                                                        const div = p.saved - p.suggested;
                                                        return (
                                                            <tr key={i} className="border-t border-gray-100 hover:bg-indigo-50/30" data-testid={`row-auto-engine-provider-${i}`}>
                                                                <td className="px-4 py-2 text-sm font-bold text-gray-800">{p.provider}</td>
                                                                <td className="px-4 py-2 text-sm text-gray-600 text-right">{p.count}</td>
                                                                <td className="px-4 py-2 text-sm text-right">
                                                                    {p.divergent > 0
                                                                        ? <span className="font-bold text-red-600">{p.divergent}</span>
                                                                        : <span className="text-gray-400">0</span>}
                                                                </td>
                                                                <td className="px-4 py-2 text-sm font-mono text-blue-700 text-right">{formatCurrencyBR(p.suggested)}</td>
                                                                <td className="px-4 py-2 text-sm font-mono text-amber-700 text-right">{formatCurrencyBR(p.saved)}</td>
                                                                <td className={`px-4 py-2 text-sm font-mono font-black text-right ${Math.abs(div) < 0.01 ? 'text-gray-500' : div > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {div >= 0 ? '+' : ''}{formatCurrencyBR(div)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {providerRows.length > 0 && (
                                                        <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                                                            <td className="px-4 py-2 text-xs font-black text-indigo-800 uppercase">Total</td>
                                                            <td className="px-4 py-2 text-sm font-black text-indigo-800 text-right">{filtered.length}</td>
                                                            <td className="px-4 py-2 text-sm font-black text-red-700 text-right">{divergentCount}</td>
                                                            <td className="px-4 py-2 text-sm font-mono font-black text-blue-800 text-right">{formatCurrencyBR(totalSuggested)}</td>
                                                            <td className="px-4 py-2 text-sm font-mono font-black text-amber-800 text-right">{formatCurrencyBR(totalSaved)}</td>
                                                            <td className={`px-4 py-2 text-sm font-mono font-black text-right ${Math.abs(totalDivergence) < 0.01 ? 'text-gray-500' : totalDivergence > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                                                                {totalDivergence >= 0 ? '+' : ''}{formatCurrencyBR(totalDivergence)}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Detalhe por OS */}
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                                            <h4 className="text-xs font-black text-gray-700 uppercase flex items-center gap-2">
                                                <FileText size={14} /> Detalhe por OS — Custo Sugerido vs. Custo Salvo
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                        <th className="px-4 py-2">Data</th>
                                                        <th className="px-4 py-2">OS</th>
                                                        <th className="px-4 py-2">Cliente</th>
                                                        <th className="px-4 py-2">Fornecedor</th>
                                                        <th className="px-4 py-2 text-right">KM (Real / Faixa)</th>
                                                        <th className="px-4 py-2 text-right">Horas</th>
                                                        <th className="px-4 py-2 text-right">Sugerido</th>
                                                        <th className="px-4 py-2 text-right">Salvo</th>
                                                        <th className="px-4 py-2 text-right">Divergência</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtered.length === 0 ? (
                                                        <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-400">Nenhum registro encontrado no período/filtro.</td></tr>
                                                    ) : filtered.slice(0, 500).map(r => (
                                                        <tr key={r.logId} className={`border-t border-gray-100 hover:bg-gray-50 ${r.divergent ? 'bg-red-50/30' : ''}`} data-testid={`row-auto-engine-${r.missionId}`}>
                                                            <td className="px-4 py-2 text-[11px] text-gray-500 font-mono whitespace-nowrap">{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                                                            <td className="px-4 py-2 text-xs font-black text-gray-800">{r.missionId}</td>
                                                            <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-[160px]" title={r.client}>{r.client}</td>
                                                            <td className="px-4 py-2 text-xs font-bold text-gray-700 truncate max-w-[160px]" title={r.provider}>{r.provider}</td>
                                                            <td className="px-4 py-2 text-[11px] font-mono text-gray-600 text-right whitespace-nowrap">{r.realKm ?? '-'} / {r.bandKm ?? '-'}</td>
                                                            <td className="px-4 py-2 text-[11px] font-mono text-gray-600 text-right">{r.goldenHours != null ? r.goldenHours.toFixed(2) : '-'}</td>
                                                            <td className="px-4 py-2 text-xs font-mono text-blue-700 text-right">{formatCurrencyBR(r.suggestedTotal)}</td>
                                                            <td className="px-4 py-2 text-xs font-mono text-amber-700 text-right">{formatCurrencyBR(r.savedCost)}</td>
                                                            <td className={`px-4 py-2 text-xs font-mono font-black text-right ${!r.divergent ? 'text-gray-400' : r.divergence > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                {r.divergent ? `${r.divergence >= 0 ? '+' : ''}${formatCurrencyBR(r.divergence)}` : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {filtered.length > 500 && (
                                                <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-200">
                                                    Exibindo as 500 OS mais recentes de {filtered.length}. Refine o período ou o filtro de fornecedor para reduzir.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}
            </div>
            
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .shadow-sm { box-shadow: none !important; }
                    .border { border: 1px solid #ddd !important; }
                    body { background: white; }
                }
            `}</style>
        </div>
    );
};

export default ReportsDashboard;
