
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
    FileBarChart, Calendar, Clock, User, Download, Search, Loader2, 
    ArrowRight, Shield, Activity, FileText, BarChart2, PieChart, Users, 
    MousePointer2, AlertTriangle, CheckCircle2, TrendingUp
} from 'lucide-react';
import { SystemLog } from '../types';

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
    const [activeTab, setActiveTab] = useState<'dashboard' | 'ranking' | 'logs'>('dashboard');
    
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

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Busca expandida para incluir mais tipos de ações se necessário
            const { data, error } = await supabase
                .from('system_logs')
                .select('*')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false });

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

    const filteredLogs = logs.filter(log => 
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entity.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
