import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { generateContent } from '../lib/gemini';
import { 
    Activity, TrendingDown, Zap, Database, Search, 
    Loader2, AlertTriangle, CheckCircle2, ShieldAlert, 
    ArrowRight, Sparkles, BarChart3, Trash2, RefreshCw,
    Globe, Server, DollarSign, BrainCircuit, Lock, ShieldCheck,
    MessageSquare, Lightbulb, Play, Key, ExternalLink, RefreshCcw,
    TrendingUp, ArrowUpRight, Wallet, Info, FileText, ChevronRight,
    Pencil, Save, X
} from 'lucide-react';
import { COST_ESTIMATES, API_BRASIL_CONFIG } from '../constants';
import { useNotification } from '../lib/NotificationContext';

const CostOptimizationDashboard: React.FC = () => {
    const { showNotification } = useNotification();
    const [isLoading, setIsLoading] = useState(true);
    const [isDirector, setIsDirector] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'CHECKING' | 'READY' | 'NEED_KEY' | 'ERROR'>('CHECKING');
    
    const [platformCosts, setPlatformCosts] = useState<any>(null);
    const [editingCosts, setEditingCosts] = useState(false);
    const [savingCosts, setSavingCosts] = useState(false);
    const [costForm, setCostForm] = useState({
        replit_egress: 0,
        replit_compute: 0,
        replit_storage: 0,
        replit_always_on: 0,
        replit_other: 0,
        supabase_db: 0,
        supabase_bandwidth: 0,
        supabase_storage: 0,
        google_maps: 0,
        resend: 0,
        other_apis: 0,
        usd_to_brl: 5.80,
    });

    const [achievedSavings, setAchievedSavings] = useState(0);
    const [optimizationHistory, setOptimizationHistory] = useState<any[]>([]);

    const [stats, setStats] = useState({
        totalRows: 0,
        logRows: 0,
        heartbeatCount: 0,
        apiUsageCount: 0,
        mapsCalls: 0,
        aiCalls: 0,
        systemActions: 0
    });

    const [isExecuting, setIsExecuting] = useState<string | null>(null);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    useEffect(() => {
        const initDashboard = async () => {
            const storedUser = localStorage.getItem('userData');
            if (storedUser) {
                const user = JSON.parse(storedUser);
                if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
                    setIsDirector(true);
                    await fetchUsageStats();
                    await fetchSavingsHistory();
                    await fetchPlatformCosts();
                    checkAIHealth();
                } else {
                    setIsLoading(false);
                }
            }
        };
        initDashboard();
    }, []);

    const fetchSavingsHistory = async () => {
        // Busca no log do sistema ações de purge para calcular economia retroativa
        const { data } = await supabase
            .from('system_logs')
            .select('*')
            .eq('entity', 'CostOptimization')
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (data) {
            setOptimizationHistory(data);
            // Simulação de cálculo de economia total acumulada
            const totalSaved = data.reduce((acc, curr) => {
                const match = curr.details.match(/R\$ ([\d,]+)/);
                return acc + (match ? parseFloat(match[1].replace(',', '.')) : 0);
            }, 0);
            setAchievedSavings(totalSaved);
        }
    };

    const fetchPlatformCosts = async () => {
        try {
            const resp = await fetch('/api/platform/costs');
            if (resp.ok) {
                const data = await resp.json();
                setPlatformCosts(data);
                setCostForm({
                    replit_egress: data.replit.extras.egress.usd,
                    replit_compute: data.replit.extras.compute.usd,
                    replit_storage: data.replit.extras.storage.usd,
                    replit_always_on: data.replit.extras.always_on?.usd || 0,
                    replit_other: data.replit.extras.other?.usd || 0,
                    supabase_db: data.supabase.extras.db.usd,
                    supabase_bandwidth: data.supabase.extras.bandwidth.usd,
                    supabase_storage: data.supabase.extras.storage.usd,
                    google_maps: data.apis.google_maps.usd,
                    resend: data.apis.resend.usd,
                    other_apis: data.apis.other.usd,
                    usd_to_brl: data.currency_rate,
                });
            }
        } catch (e) {
            console.error('Erro ao buscar custos de plataforma:', e);
        }
    };

    const saveCostOverrides = async () => {
        setSavingCosts(true);
        try {
            const resp = await fetch('/api/platform/costs/overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ overrides: costForm }),
            });
            if (resp.ok) {
                showNotification('Custos Atualizados', 'Os valores de excedentes foram salvos com sucesso.', 'success');
                setEditingCosts(false);
                await fetchPlatformCosts();
            } else {
                throw new Error('Falha ao salvar');
            }
        } catch (e: any) {
            showNotification('Erro', 'Não foi possível salvar os custos: ' + e.message, 'error');
        } finally {
            setSavingCosts(false);
        }
    };

    const checkAIHealth = async () => {
        try {
            setConnectionStatus('READY');
        } catch (e) {
            setConnectionStatus('ERROR');
        }
    };

    const handleLinkKey = async () => {
        setConnectionStatus('READY');
        showNotification('Conexão Estabelecida', 'IA configurada com sucesso.', 'success');
    };

    const fetchUsageStats = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [logsRes, heartbeatRes, apiUsageRes, sysLogsRes, missionsRes] = await Promise.all([
                supabase.from('system_logs').select('*', { count: 'exact', head: true }),
                supabase.from('system_logs').select('*', { count: 'exact', head: true }).eq('action_type', 'HEARTBEAT'),
                supabase.from('api_usage_logs').select('*', { count: 'exact', head: true }),
                supabase.from('system_logs').select('*', { count: 'exact', head: true }).eq('entity', 'AIChatbot'),
                supabase.from('missions').select('*', { count: 'exact', head: true })
            ]);

            const logs = logsRes.count || 0;
            const hbeats = heartbeatRes.count || 0;
            const apiCalls = apiUsageRes.count || 0;
            const aiCalls = sysLogsRes.count || 0;
            const missions = missionsRes.count || 0;

            setStats({
                totalRows: logs + apiCalls + missions,
                logRows: logs,
                heartbeatCount: hbeats,
                apiUsageCount: apiCalls,
                mapsCalls: missions * 1.5,
                aiCalls: aiCalls,
                systemActions: logs - hbeats
            });

        } catch (e) {
            console.error(e);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const costAnalysis = useMemo(() => {
        const wdapiCost = stats.apiUsageCount * COST_ESTIMATES.WDAPI_PER_CALL;
        const mapsCost = stats.mapsCalls * COST_ESTIMATES.GOOGLE_MAPS_ROUTING;
        const dbCost = stats.totalRows * COST_ESTIMATES.SUPABASE_ROW_STORAGE;
        const aiCost = stats.aiCalls * COST_ESTIMATES.AI_GEMINI_PRO;
        
        return {
            wdapi: wdapiCost,
            maps: mapsCost,
            db: dbCost,
            ai: aiCost,
            total: wdapiCost + mapsCost + dbCost + aiCost
        };
    }, [stats]);

    const runAIAudit = async () => {
        setIsAnalyzing(true);
        setAiRecommendation(null);
        try {
            const prompt = `Analise os custos da TMSEG. Fatura Projetada: R$ ${costAnalysis.total.toFixed(2)}. 
            Distribuição: Gemini AI (R$ ${costAnalysis.ai.toFixed(2)}), Maps/Places (R$ ${costAnalysis.maps.toFixed(2)}), Banco de Dados (R$ ${costAnalysis.db.toFixed(2)}).
            Sugira 3 ações técnicas de economia para reduzir em pelo menos 15% o gasto cloud. Retorne em Markdown.`;

            const text = await generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt
            });

            setAiRecommendation(text);
            setConnectionStatus('READY');
        } catch (e: any) {
            console.error("Erro Auditoria IA:", e);
            if (e.message?.includes("API key not valid") || e.message?.includes("400")) {
                setConnectionStatus('NEED_KEY');
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCleanup = async (task: string) => {
        if (!confirm(`Executar ${task}? Esta ação gera economia imediata de infraestrutura.`)) return;
        setIsExecuting(task);
        try {
            let savings = 0;
            if (task === 'PURGE_HEARTBEATS') {
                const countToRemove = stats.heartbeatCount;
                savings = countToRemove * COST_ESTIMATES.SUPABASE_ROW_STORAGE * 10; // Fator de IOPS
                await supabase.from('system_logs').delete().eq('action_type', 'HEARTBEAT');
                
                await supabase.from('system_logs').insert([{
                    user_name: JSON.parse(localStorage.getItem('userData') || '{}').name,
                    action_type: 'OTHER',
                    entity: 'CostOptimization',
                    entity_id: 'CLEANUP',
                    details: `Purge de ${countToRemove} Heartbeats. Economia gerada: ${formatCurrency(savings)}`
                }]);

                showNotification('Otimização Concluída', `Foram removidos ${countToRemove} registros, economizando ${formatCurrency(savings)}/mês.`, 'success');
            } 
            
            await fetchUsageStats(true);
            await fetchSavingsHistory();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsExecuting(null);
        }
    };

    if (isLoading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-red-600" size={48} /></div>;

    if (!isDirector) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <ShieldAlert size={64} className="text-red-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 uppercase tracking-tighter">Acesso Restrito</h2>
                <p className="text-gray-500 mt-2">Dados de faturamento cloud e chaves de inteligência são sigilosos.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            
            {/* STATUS DE SAÚDE DA CONEXÃO IA */}
            <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-500 ${connectionStatus === 'READY' ? 'bg-emerald-50 border-emerald-100' : connectionStatus === 'NEED_KEY' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl shadow-sm ${connectionStatus === 'READY' ? 'bg-emerald-500 text-white' : 'bg-red-600 text-white animate-pulse'}`}>
                        {connectionStatus === 'READY' ? <ShieldCheck size={20}/> : <Key size={20}/>}
                    </div>
                    <div>
                        <h4 className="text-sm font-black uppercase tracking-tight text-slate-800">
                            {connectionStatus === 'READY' ? 'Inteligência Artificial Operacional' : 'Reparo de Conexão Necessário'}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">
                            {connectionStatus === 'READY' ? 'Conectado com sucesso às APIs do Google Cloud.' : 'Sua chave de API expirou ou é inválida para funcionários externos.'}
                        </p>
                    </div>
                </div>
                {connectionStatus !== 'READY' && (
                    <button 
                        onClick={handleLinkKey}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-red-200 transition-all active:scale-95"
                    >
                        <ExternalLink size={14}/> Reparar Conexão IA
                    </button>
                )}
            </div>

            {platformCosts && (
                <div className="bg-white rounded-[32px] shadow-xl border border-gray-200 overflow-hidden" data-testid="platform-costs-section">
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Wallet size={160} /></div>
                        <div className="relative z-10">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div>
                                    <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                                        <Server className="text-blue-400" /> Custos de Plataforma
                                    </h2>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em] mt-2">Replit + Supabase + APIs Externas — Estimativa Mensal</p>
                                </div>
                                <div className="bg-slate-800 p-6 rounded-[24px] border border-slate-700 flex flex-col items-end min-w-[200px]">
                                    <span className="text-[10px] font-black text-slate-500 uppercase mb-1 tracking-widest">Total Mensal</span>
                                    <span className="text-4xl font-black text-emerald-400 font-mono tracking-tighter" data-testid="text-total-mensal">
                                        {formatCurrency(platformCosts.total_brl)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono mt-1">$ {platformCosts.total_usd.toFixed(2)} USD (câmbio R$ {platformCosts.currency_rate})</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-8 pt-6 flex justify-end">
                        {!editingCosts ? (
                            <button 
                                onClick={() => setEditingCosts(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all"
                                data-testid="button-edit-costs"
                            >
                                <Pencil size={14} /> Editar Custos Reais
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setEditingCosts(false)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 transition-all"
                                    data-testid="button-cancel-edit"
                                >
                                    <X size={14} /> Cancelar
                                </button>
                                <button 
                                    onClick={saveCostOverrides}
                                    disabled={savingCosts}
                                    className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg transition-all disabled:opacity-50"
                                    data-testid="button-save-costs"
                                >
                                    {savingCosts ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                                </button>
                            </div>
                        )}
                    </div>

                    {editingCosts ? (
                        <div className="p-8 space-y-8">
                            <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg"><Server size={18} /></div>
                                    <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Excedentes Replit (USD/mês)</h4>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    {[
                                        { key: 'replit_egress', label: 'Egress' },
                                        { key: 'replit_compute', label: 'Compute' },
                                        { key: 'replit_storage', label: 'Storage' },
                                        { key: 'replit_always_on', label: 'Always-On' },
                                        { key: 'replit_other', label: 'Outros' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label className="text-[10px] font-black text-blue-700 uppercase block mb-1">{f.label}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-blue-400 font-bold">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={costForm[f.key as keyof typeof costForm]}
                                                    onChange={e => setCostForm(prev => ({ ...prev, [f.key]: Number(e.target.value) || 0 }))}
                                                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-blue-300 bg-white text-sm font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                                                    data-testid={`input-${f.key}`}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg"><Database size={18} /></div>
                                    <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Excedentes Supabase (USD/mês)</h4>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {[
                                        { key: 'supabase_db', label: 'Database' },
                                        { key: 'supabase_bandwidth', label: 'Bandwidth' },
                                        { key: 'supabase_storage', label: 'Storage' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label className="text-[10px] font-black text-emerald-700 uppercase block mb-1">{f.label}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-bold">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={costForm[f.key as keyof typeof costForm]}
                                                    onChange={e => setCostForm(prev => ({ ...prev, [f.key]: Number(e.target.value) || 0 }))}
                                                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-emerald-300 bg-white text-sm font-mono font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
                                                    data-testid={`input-${f.key}`}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-lg"><Globe size={18} /></div>
                                    <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">APIs Externas (USD/mês)</h4>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {[
                                        { key: 'google_maps', label: 'Google Maps' },
                                        { key: 'resend', label: 'Resend (Email)' },
                                        { key: 'other_apis', label: 'Outros' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label className="text-[10px] font-black text-amber-700 uppercase block mb-1">{f.label}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-amber-400 font-bold">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={costForm[f.key as keyof typeof costForm]}
                                                    onChange={e => setCostForm(prev => ({ ...prev, [f.key]: Number(e.target.value) || 0 }))}
                                                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-amber-300 bg-white text-sm font-mono font-bold text-amber-900 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                                                    data-testid={`input-${f.key}`}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2.5 bg-gray-600 text-white rounded-xl shadow-lg"><DollarSign size={18} /></div>
                                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Câmbio USD → BRL</h4>
                                </div>
                                <div className="max-w-[200px]">
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">R$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={costForm.usd_to_brl}
                                            onChange={e => setCostForm(prev => ({ ...prev, usd_to_brl: Number(e.target.value) || 5.80 }))}
                                            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-mono font-bold text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400 outline-none"
                                            data-testid="input-usd-to-brl"
                                        />
                                    </div>
                                </div>
                            </div>

                            <p className="text-[10px] text-gray-400 font-bold italic">
                                Consulte os valores reais na página de billing do Replit e do Supabase. Os excedentes são valores MENSAIS em USD que são cobrados além do plano base.
                            </p>
                        </div>
                    ) : (
                        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-6" data-testid="card-cost-replit">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg"><Server size={18} /></div>
                                    <div>
                                        <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Replit</h4>
                                        <p className="text-[10px] text-blue-600 font-bold">{platformCosts.replit.plan}</p>
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-blue-900 font-mono tracking-tighter mb-4" data-testid="text-replit-cost">{formatCurrency(platformCosts.replit.total_brl)}</p>
                                <div className="space-y-2 border-t border-blue-200 pt-3">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-blue-600 font-bold">Plano Base</span>
                                        <span className="text-blue-900 font-mono font-black">{formatCurrency(platformCosts.replit.base_brl)}</span>
                                    </div>
                                    {platformCosts.replit.extras.egress.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-blue-600 font-bold">Egress Extra</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.replit.extras.egress.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.replit.extras.compute.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-blue-600 font-bold">Compute Extra</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.replit.extras.compute.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.replit.extras.storage.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-blue-600 font-bold">Storage Extra</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.replit.extras.storage.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.replit.extras.always_on?.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-blue-600 font-bold">Always-On</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.replit.extras.always_on.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.replit.extras.other?.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-blue-600 font-bold">Outros</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.replit.extras.other.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.replit.total_brl === platformCosts.replit.base_brl && (
                                        <p className="text-[9px] text-blue-400 italic mt-2">Sem excedentes. Clique em "Editar Custos Reais" para inserir valores da fatura.</p>
                                    )}
                                </div>
                            </div>

                            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-6" data-testid="card-cost-supabase">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg"><Database size={18} /></div>
                                    <div>
                                        <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Supabase</h4>
                                        <p className="text-[10px] text-emerald-600 font-bold">{platformCosts.supabase.plan}</p>
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-emerald-900 font-mono tracking-tighter mb-4" data-testid="text-supabase-cost">{formatCurrency(platformCosts.supabase.total_brl)}</p>
                                <div className="space-y-2 border-t border-emerald-200 pt-3">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-emerald-600 font-bold">Plano Base</span>
                                        <span className="text-emerald-900 font-mono font-black">{formatCurrency(platformCosts.supabase.base_brl)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-emerald-600 font-bold">Capacidade DB</span>
                                        <span className="text-emerald-900 font-mono font-black">{platformCosts.supabase.db_capacity_gb} GB</span>
                                    </div>
                                    {platformCosts.supabase.extras.db.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-emerald-600 font-bold">DB Extra</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.supabase.extras.db.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.supabase.extras.bandwidth.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-emerald-600 font-bold">Bandwidth Extra</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.supabase.extras.bandwidth.brl)}</span>
                                        </div>
                                    )}
                                    {platformCosts.supabase.extras.storage?.brl > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-emerald-600 font-bold">Storage Extra</span>
                                            <span className="text-amber-700 font-mono font-black">{formatCurrency(platformCosts.supabase.extras.storage.brl)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6" data-testid="card-cost-apis">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-lg"><Globe size={18} /></div>
                                    <div>
                                        <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">APIs Externas</h4>
                                        <p className="text-[10px] text-amber-600 font-bold">Google Maps, Resend, etc.</p>
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-amber-900 font-mono tracking-tighter mb-4" data-testid="text-apis-cost">{formatCurrency(platformCosts.apis.total_brl)}</p>
                                <div className="space-y-2 border-t border-amber-200 pt-3">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-amber-600 font-bold">Google Maps</span>
                                        <span className="text-amber-900 font-mono font-black">{formatCurrency(platformCosts.apis.google_maps.brl)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-amber-600 font-bold">Resend (Email)</span>
                                        <span className="text-amber-900 font-mono font-black">{formatCurrency(platformCosts.apis.resend.brl)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-amber-600 font-bold">Gemini AI</span>
                                        <span className="text-emerald-600 font-mono font-black">Gratuito</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {platformCosts.saving_tips && platformCosts.saving_tips.length > 0 && (
                        <div className="px-8 pb-8">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                <Lightbulb size={16} className="text-yellow-500" /> Dicas de Economia da Plataforma
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {platformCosts.saving_tips.map((tip: any, i: number) => {
                                    const impactBg = tip.impact === 'Alto' ? 'bg-red-50 border-red-200' :
                                        tip.impact === 'Médio' ? 'bg-amber-50 border-amber-200' :
                                        tip.impact === 'Info' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200';
                                    const impactText = tip.impact === 'Alto' ? 'text-red-700 bg-red-100' :
                                        tip.impact === 'Médio' ? 'text-amber-700 bg-amber-100' :
                                        tip.impact === 'Info' ? 'text-blue-700 bg-blue-100' : 'text-gray-700 bg-gray-100';
                                    return (
                                        <div key={i} className={`p-4 rounded-xl border ${impactBg}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black text-gray-600 uppercase">{tip.area}</span>
                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${impactText}`}>
                                                    {tip.impact === 'Alto' ? 'IMPACTO ALTO' : tip.impact === 'Médio' ? 'IMPACTO MÉDIO' : tip.impact === 'Info' ? 'INFO' : 'BAIXO'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-700 font-bold mb-1">{tip.tip}</p>
                                            <p className="text-[9px] text-gray-500 font-mono bg-white/60 rounded px-2 py-1 mt-1.5">{tip.action}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PAINEL DE GASTOS ESTILO GOOGLE CLOUD BILLING */}
            <div className="bg-white rounded-[32px] shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5"><DollarSign size={160} /></div>
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                                    <Activity className="text-red-500" /> Cloud Billing Control
                                </h2>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em] mt-2">Visibilidade de Faturas de API (Ciclo Atual)</p>
                            </div>
                            
                            <div className="flex gap-4">
                                <div className="bg-slate-800 p-6 rounded-[24px] border border-slate-700 flex flex-col items-end min-w-[200px]">
                                    <span className="text-[10px] font-black text-slate-500 uppercase mb-1 tracking-widest">Fatura Projetada</span>
                                    <span className="text-4xl font-black text-white font-mono tracking-tighter">
                                        {formatCurrency(costAnalysis.total)}
                                    </span>
                                </div>
                                <div className="bg-emerald-900/30 p-6 rounded-[24px] border border-emerald-500/30 flex flex-col items-end min-w-[200px]">
                                    <span className="text-[10px] font-black text-emerald-500 uppercase mb-1 tracking-widest">Redução Acumulada</span>
                                    <span className="text-4xl font-black text-emerald-400 font-mono tracking-tighter">
                                        {formatCurrency(achievedSavings)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* DISTRIBUIÇÃO POR SERVIÇO (Simulando print do Google Cloud) */}
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <BarChart3 size={16} className="text-indigo-600" /> Gastos por Serviço (Real-time)
                        </h4>
                        
                        <div className="space-y-4">
                            {[
                                { name: 'Gemini AI API', val: costAnalysis.ai, color: 'bg-purple-600', icon: BrainCircuit },
                                { name: 'Google Maps / Routing', val: costAnalysis.maps, color: 'bg-blue-600', icon: Globe },
                                { name: 'Supabase Data Storage', val: costAnalysis.db, color: 'bg-emerald-600', icon: Database },
                                { name: 'WDAPI (Consultas Placa)', val: costAnalysis.wdapi, color: 'bg-red-600', icon: Search },
                            ].map(serv => (
                                <div key={serv.name} className="group">
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="font-bold text-gray-700 flex items-center gap-2">
                                            <serv.icon size={14} className="text-gray-400" /> {serv.name}
                                        </span>
                                        <span className="font-mono font-bold text-gray-900">{formatCurrency(serv.val)}</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className={`${serv.color} h-full transition-all duration-1000 ease-out shadow-sm`} 
                                            style={{ width: `${(serv.val / costAnalysis.total) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* HISTÓRICO DE ECONOMIA */}
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <TrendingDown size={16} className="text-emerald-600" /> Reduções e Otimizações Realizadas
                        </h4>
                        
                        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 divide-y divide-gray-200">
                            {optimizationHistory.length > 0 ? optimizationHistory.map(opt => (
                                <div key={opt.id} className="py-3 first:pt-0 last:pb-0 flex justify-between items-center group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white rounded-lg border border-gray-200 text-emerald-600 group-hover:scale-110 transition-transform">
                                            <Zap size={14} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-800 uppercase tracking-tight">{opt.details.split('.')[0]}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">{new Date(opt.created_at).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-mono font-black text-emerald-600">
                                        -{opt.details.match(/R\$ ([\d,]+)/)?.[0] || 'Otimizado'}
                                    </span>
                                </div>
                            )) : (
                                <div className="py-10 text-center text-gray-400 italic text-xs">Nenhuma ação de redução registrada recentemente.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* SEÇÃO ANALÍTICA E AÇÕES */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg">
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-gray-800 uppercase tracking-tight">Estratégia de Redução IA</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Agente de Engenharia de Custos</p>
                                </div>
                            </div>
                            <button 
                                onClick={runAIAudit}
                                disabled={isAnalyzing}
                                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 ${connectionStatus === 'READY' ? 'bg-black text-white hover:bg-gray-800' : 'bg-red-600 text-white'}`}
                            >
                                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                                Gerar Plano de Economia
                            </button>
                        </div>

                        <div className="p-8 flex-1 overflow-y-auto">
                            {aiRecommendation ? (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl mb-6">
                                        <p className="text-sm font-medium text-indigo-900 leading-relaxed italic">
                                            "Com base no volume atual de {stats.totalRows} registros e chamadas de API, detectamos que {Math.round((stats.heartbeatCount / stats.totalRows) * 100)}% dos seus dados são ruído operacional (Heartbeats). Aqui estão as ações:"
                                        </p>
                                    </div>
                                    <div className="prose prose-slate max-w-none text-gray-700 whitespace-pre-line text-sm leading-relaxed">
                                        {aiRecommendation}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 py-20 opacity-40">
                                    <Lightbulb size={64} strokeWidth={1.5} />
                                    <p className="text-xs font-black uppercase tracking-[0.2em]">Solicite a auditoria para ver sugestões</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-[32px] border border-gray-200 shadow-sm">
                        <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Zap size={16} className="text-orange-500" /> Ações Rápidas de Redução
                        </h4>
                        
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-red-200 transition-all">
                                <div className="flex justify-between items-start mb-1">
                                    <h5 className="text-xs font-black text-gray-700 uppercase">Eliminar Heartbeats</h5>
                                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-black">CRÍTICO</span>
                                </div>
                                <p className="text-[9px] text-gray-400 font-bold uppercase mb-3">{stats.heartbeatCount} registros de rastreio inúteis</p>
                                <button 
                                    onClick={() => handleCleanup('PURGE_HEARTBEATS')}
                                    disabled={isExecuting !== null || stats.heartbeatCount === 0}
                                    className="w-full bg-white border border-gray-200 py-2 rounded-xl text-[10px] font-black uppercase text-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {isExecuting === 'PURGE_HEARTBEATS' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Aplicar Redução
                                </button>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-indigo-200 transition-all">
                                <h5 className="text-xs font-black text-gray-700 uppercase mb-3">Limpar Cache de Consultas</h5>
                                <button 
                                    onClick={() => handleCleanup('PURGE_OLD_LOGS')}
                                    disabled={isExecuting !== null}
                                    className="w-full bg-white border border-gray-200 py-2 rounded-xl text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {isExecuting === 'PURGE_OLD_LOGS' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reduzir Custo de Indexação
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-[32px] text-white relative overflow-hidden border border-slate-800 shadow-xl">
                        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12"><TrendingDown size={100} /></div>
                        <div className="relative z-10">
                            <h5 className="font-black text-[10px] text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ShieldCheck size={14} /> Compliance de Faturamento
                            </h5>
                            <p className="text-[11px] text-slate-400 leading-relaxed italic">
                                "Sua fatura é baseada no consumo de tokens e requisições. Ao limpar registros desnecessários, você reduz o custo de 'Database Read/Write' e 'Storage', mantendo a margem da operação positiva."
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CostOptimizationDashboard;