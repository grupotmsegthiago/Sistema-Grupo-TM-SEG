import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Target, Loader2, Trophy, Zap, Clock } from 'lucide-react';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus } from '../types';

const DAILY_GOAL = 35000.00;

interface Props {
    viewPeriod?: string;
    customStartDate?: string;
    customEndDate?: string;
}

const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const DailyGoalThermometer: React.FC<Props> = ({ viewPeriod = 'TODAY', customStartDate, customEndDate }) => {
    const [missions, setMissions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<string>('');
    const [priceTables, setPriceTables] = useState<ClientPriceTable[]>([]);
    const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchPeriodData = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const now = new Date();
            let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

            if (viewPeriod === 'YESTERDAY') {
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
            } else if (viewPeriod === 'WEEK') {
                start.setDate(start.getDate() - 7);
            } else if (viewPeriod === 'MONTH') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (viewPeriod === 'YEAR') {
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            } else if (viewPeriod === 'CUSTOM' && customStartDate && customEndDate) {
                start = new Date(customStartDate + 'T00:00:00');
                end = new Date(customEndDate + 'T23:59:59');
            } else if (viewPeriod === 'ALL') {
                start = new Date(2000, 0, 1);
                end = new Date(2100, 0, 1);
            }

            if (priceTables.length === 0) {
                const [pTablesRes, prTablesRes] = await Promise.all([
                    supabase.from('client_price_tables').select('*'),
                    supabase.from('provider_cost_tables').select('*')
                ]);
                if (pTablesRes.data) setPriceTables(pTablesRes.data as any);
                if (prTablesRes.data) setProviderTables(prTablesRes.data as any);
            }

            const { data, error } = await supabase
                .from('missions')
                .select('*')
                .gte('start_time', start.toISOString())
                .lte('start_time', end.toISOString());

            if (error) throw error;
            setMissions(data || []);
        } catch (error) {
            console.error("Erro ao sincronizar meta diária:", error);
        } finally {
            setIsLoading(false);
        }
    }, [viewPeriod, customStartDate, customEndDate, priceTables.length]);

    useEffect(() => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole((user.role || '').toLowerCase());
            } catch (e) { console.error(e); }
        }
        
        fetchPeriodData();

        const channel = supabase
            .channel('daily-goal-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchPeriodData(true))
            .subscribe();

        return () => { 
            supabase.removeChannel(channel);
        };
    }, [fetchPeriodData]);

    const currentRevenue = useMemo(() => {
        return missions.reduce((acc, m) => {
            const isTerminal = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus);
            const isAudited = m.billing_approved;
            const hasBeenVerified = !!m.billing_verified_by;

            if (isTerminal || isAudited || hasBeenVerified) {
                 const storedVal = (m.revenue_value || 0) + (m.toll_value || 0);
                 return acc + storedVal;
            }

            const missionObj: Mission = {
                ...m,
                startKm: m.start_km,
                endKm: m.end_km,
                startTime: m.start_time,
                endTime: m.end_time
            };
            const financials = calculateMissionFinancials(
                missionObj, 
                priceTables, 
                providerTables, 
                undefined, 
                currentTime 
            );
            return acc + (financials.client.total || 0);

        }, 0);
    }, [missions, priceTables, providerTables, currentTime]);

    const stats = useMemo(() => {
        const percentage = Math.min(100, (currentRevenue / DAILY_GOAL) * 100);
        const remaining = Math.max(0, DAILY_GOAL - currentRevenue);
        
        let colorClass = 'bg-red-500'; 
        let textClass = 'text-red-500';
        
        if (percentage >= 91) {
            colorClass = 'bg-green-500';
            textClass = 'text-green-600';
        } else if (percentage >= 50) {
            colorClass = 'bg-yellow-500';
            textClass = 'text-yellow-600';
        }

        return { 
            percentage, 
            remaining, 
            isGoalMet: percentage >= 100,
            colorClass,
            textClass
        };
    }, [currentRevenue]);

    const isAuthorized = ['diretoria', 'administrativo', 'avançado', 'avancado', 'administrador', 'operador', 'comercial'].includes(userRole);
    const canSeeMonetary = ['diretoria', 'administrador', 'administrativo', 'comercial'].includes(userRole);

    if (!isAuthorized) return null;

    const labelText = viewPeriod === 'TODAY' ? 'Meta Agendada (Hoje)' : 
                      viewPeriod === 'YESTERDAY' ? 'Meta Agendada (Ontem)' :
                      viewPeriod === 'MONTH' ? 'Meta Mensal' : 'Faturamento Período';

    return (
        <div className="group perspective-1000 w-full max-w-lg mx-auto">
            <div className="bg-white rounded-[35px] p-5 border-x border-t border-gray-100 border-b-4 border-gray-200/60 shadow-[0_20px_50px_rgba(0,0,0,0.06)] w-full transition-all duration-700 hover:shadow-[0_25px_60px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 transform hover:rotate-0.5">
                
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                            <div className={`p-2 rounded-[15px] text-white shadow-lg transition-colors duration-500 ${stats.colorClass}`}>
                                <Target size={16} strokeWidth={3} />
                            </div>
                            <div className="absolute -top-1 -right-1">
                                <Zap size={12} className="text-yellow-400 fill-yellow-400 animate-pulse" />
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-0.5 truncate">
                                    {labelText}
                                </span>
                                <Clock size={10} className="text-gray-300 animate-spin duration-[5000ms]" />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${stats.isGoalMet ? 'bg-green-500' : 'animate-pulse ' + stats.colorClass}`}></span>
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Sincronização Ativa</span>
                            </div>
                        </div>
                    </div>
                    {canSeeMonetary && (
                        <div className="text-right shrink-0">
                            <p className={`text-sm md:text-base font-black font-mono tracking-tighter whitespace-nowrap transition-colors duration-500 ${stats.textClass}`}>
                                {isLoading ? (
                                    <Loader2 size={14} className="animate-spin inline text-red-500" />
                                ) : (
                                    formatCurrency(currentRevenue)
                                )}
                            </p>
                        </div>
                    )}
                </div>

                <div className="relative w-full h-3.5 bg-slate-100 rounded-full mb-3.5 shadow-[inset_0_1.5px_4px_rgba(0,0,0,0.1)] border border-gray-200/50 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out relative shadow-md`}
                        style={{ 
                            width: `${stats.percentage}%`,
                            backgroundColor: stats.percentage < 50 ? '#ef4444' : stats.percentage <= 90 ? '#eab308' : '#22c55e'
                        }}
                    >
                        <div className="absolute top-0 left-0 right-0 h-[30%] bg-white/20 rounded-full"></div>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer-fast"></div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center">
                    <div className={`px-3 py-1.5 rounded-2xl border shadow-inner flex items-baseline gap-1.5 shrink-0 transition-all ${stats.percentage < 50 ? 'bg-red-50 border-red-100' : stats.percentage <= 90 ? 'bg-yellow-50 border-yellow-100' : 'bg-green-50 border-green-100'}`}>
                        <span className={`text-sm font-black italic leading-none ${stats.textClass}`}>
                            {stats.percentage.toFixed(1)}% 
                        </span>
                        <span className="text-[8px] uppercase font-black text-slate-400 tracking-tight">
                            Atingido
                        </span>
                    </div>

                    {canSeeMonetary && (
                        <div className="text-right min-w-0 ml-4">
                            {stats.remaining > 0 ? (
                                <div className="flex flex-col items-end">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">Restante para Alvo</span>
                                    <span className="text-[9px] md:text-[10px] font-black text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-gray-100 shadow-sm whitespace-nowrap">
                                        {formatCurrency(stats.remaining)}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-2xl shadow-lg shadow-emerald-100 animate-bounce">
                                    <Trophy size={12} fill="currentColor" />
                                    <span className="text-[8px] font-black uppercase tracking-widest leading-none">Alvo Superado!</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes shimmer-fast {
                    0% { transform: translateX(-150%) skewX(-20deg); }
                    100% { transform: translateX(150%) skewX(-20deg); }
                }
                .animate-shimmer-fast {
                    animation: shimmer-fast 3s infinite linear;
                }
                .perspective-1000 {
                    perspective: 1000px;
                }
            `}</style>
        </div>
    );
};

export default DailyGoalThermometer;