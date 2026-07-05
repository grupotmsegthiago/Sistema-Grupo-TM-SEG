import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Target, Loader2, Trophy, Zap, Clock, RefreshCw } from 'lucide-react';
import { ClientPriceTable, ProviderCostTable, Client } from '../types';
import { useNotification } from '../lib/NotificationContext';
import { formatDateTimeAuditBR } from '../lib/dateUtils';
import {
  getCanonicalDateRange,
  sumCanonical,
  type CanonicalPeriod,
} from '../lib/missionFinancialsCanonical';
import {
  formatGoalDelta,
  loadGoalUpdateHistory,
  pushGoalUpdateHistory,
  type GoalUpdateSnapshot,
} from '../lib/goalUpdateHistory';

const DEFAULT_DAILY_GOAL = 35000.00;
const DEFAULT_MONTHLY_GOAL = 700000.00;

// Calcula a meta proporcional ao período selecionado no filtro.
// Para CUSTOM, prorata pelos dias do intervalo (usando dias úteis ~ 20/mês).
function getGoalForPeriod(viewPeriod: string, customStartDate: string | undefined, customEndDate: string | undefined, dailyGoal: number, monthlyGoal: number): number {
    const weekly = dailyGoal * 5;
    const yearly = monthlyGoal * 12;
    switch (viewPeriod) {
        case 'TODAY':
        case 'YESTERDAY':
            return dailyGoal;
        case 'WEEK':
            return weekly;
        case 'MONTH':
            return monthlyGoal;
        case 'YEAR':
            return yearly;
        case 'CUSTOM': {
            if (!customStartDate || !customEndDate) return monthlyGoal;
            const start = new Date(customStartDate);
            const end = new Date(customEndDate);
            const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
            return (days / 30) * monthlyGoal;
        }
        case 'ALL':
        default:
            return monthlyGoal;
    }
}

interface Props {
    viewPeriod?: string;
    customStartDate?: string;
    customEndDate?: string;
    missions?: any[];
    clientTables?: ClientPriceTable[];
    providerTables?: ProviderCostTable[];
    clientsData?: Client[];
    lastDataUpdatedAt?: Date | null;
    onRefreshMissions?: () => void | Promise<void | boolean>;
    // Filtros opcionais para criar variantes (ex.: META DHL)
    clientFilter?: (clientName: string) => boolean;
    dailyGoalOverride?: number;
    monthlyGoalOverride?: number;
    titleSuffix?: string; // ex.: "DHL" → "Meta Agendada DHL (Hoje)"
    accentClass?: string; // ex.: "from-yellow-400 to-red-600" para o ícone DHL
    historyKey?: string; // chave única para histórico de atualizações (diretoria)
}

const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const CHART_W = 132;
const CHART_H = 52;
const CHART_PAD = 10;
const VALUE_EPS = 0.01;

const GoalUpdateSparkline: React.FC<{
    rows: GoalUpdateSnapshot[];
    stroke: string;
    isRefreshing: boolean;
    onRefresh: () => void;
    title: string;
}> = ({ rows, stroke, isRefreshing, onRefresh, title }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const chartRef = useRef<HTMLDivElement>(null);
    const chronological = useMemo(() => [...rows].slice(0, 5).reverse(), [rows]);

    const points = useMemo(() => {
        if (chronological.length === 0) return [];
        const values = chronological.map(r => r.revenue);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        const innerW = CHART_W - CHART_PAD * 2;
        const innerH = CHART_H - CHART_PAD * 2;
        const midY = CHART_PAD + innerH / 2;
        return chronological.map((row, i) => {
            const x = CHART_PAD + (chronological.length === 1 ? innerW / 2 : (i / (chronological.length - 1)) * innerW);
            const y = range < VALUE_EPS
                ? midY
                : CHART_PAD + (1 - (row.revenue - min) / range) * innerH;
            const prev = i > 0 ? chronological[i - 1].revenue : null;
            const delta = prev !== null ? row.revenue - prev : null;
            return { x, y, row, delta, i };
        });
    }, [chronological]);

    const pathD = useMemo(() => {
        if (points.length < 2) return '';
        let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const same = Math.abs(curr.row.revenue - prev.row.revenue) < VALUE_EPS;
            if (same) {
                // Valor igual → segmento horizontal (linha reta)
                d += ` L ${curr.x.toFixed(1)} ${prev.y.toFixed(1)}`;
            } else {
                // Valor mudou → degrau: horizontal até o ponto, depois vertical
                d += ` L ${curr.x.toFixed(1)} ${prev.y.toFixed(1)} L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
            }
        }
        return d;
    }, [points]);

    const showTooltip = (idx: number, el: SVGCircleElement) => {
        setHoverIdx(idx);
        const r = el.getBoundingClientRect();
        setTooltipPos({ top: r.top - 8, left: r.left + r.width / 2 });
    };

    return (
        <div
            ref={chartRef}
            className="relative select-none overflow-visible z-[160]"
            style={{ width: CHART_W }}
            data-testid="goal-update-sparkline"
            title={title}
        >
            <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[7px] font-black uppercase text-slate-400 leading-none whitespace-nowrap">Monitoramento 24h</span>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                    disabled={isRefreshing}
                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-40 shrink-0"
                    aria-label={title}
                    data-testid="button-refresh-goal"
                >
                    <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>
            <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="block rounded-lg border border-slate-200/80 bg-white/95 shadow-md hover:bg-slate-50 transition-colors disabled:opacity-50 overflow-visible backdrop-blur-sm"
                style={{ width: CHART_W, height: CHART_H }}
                aria-label={title}
            >
                {points.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-[8px] font-semibold text-slate-400 uppercase">
                        Sem histórico
                    </div>
                ) : (
                    <svg
                        width={CHART_W}
                        height={CHART_H}
                        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                        className="overflow-visible"
                        style={{ overflow: 'visible' }}
                    >
                        {points.length > 1 && (
                            <path d={pathD} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                        )}
                        {points.map((p) => (
                            <circle
                                key={p.row.at}
                                cx={p.x}
                                cy={p.y}
                                r={hoverIdx === p.i ? 4.5 : 3.5}
                                fill={hoverIdx === p.i ? stroke : '#fff'}
                                stroke={stroke}
                                strokeWidth={2}
                                style={{ overflow: 'visible' }}
                                onMouseEnter={(e) => showTooltip(p.i, e.currentTarget)}
                                onMouseLeave={() => setHoverIdx(null)}
                            />
                        ))}
                    </svg>
                )}
            </button>
            {hoverIdx !== null && points[hoverIdx] && (
                <div
                    className="fixed z-[9999] -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white shadow-xl px-2.5 py-1.5 text-left pointer-events-none min-w-[140px]"
                    style={{ top: tooltipPos.top, left: tooltipPos.left }}
                    data-testid="sparkline-tooltip"
                >
                    <p className="text-[9px] font-bold text-slate-700">{formatDateTimeAuditBR(points[hoverIdx].row.at)}</p>
                    <p className="text-[9px] text-slate-600">{formatCurrency(points[hoverIdx].row.revenue)}</p>
                    {points[hoverIdx].delta !== null && (
                        <p className={`text-[9px] font-black ${Math.abs(points[hoverIdx].delta!) < VALUE_EPS ? 'text-slate-500' : points[hoverIdx].delta! > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            Δ {formatGoalDelta(points[hoverIdx].delta)}
                        </p>
                    )}
                    <p className="text-[8px] text-slate-400 mt-0.5">{points[hoverIdx].row.missionCount} missões</p>
                </div>
            )}
        </div>
    );
};

// Janela CANÔNICA delegada para lib/missionFinancialsCanonical (mesma usada
// pelo Relatório, Dashboard e worker do e-mail).
function getDateRange(viewPeriod: string, customStartDate?: string, customEndDate?: string): [Date, Date] {
    const allowed: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
    const period = (allowed.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY') as CanonicalPeriod;
    return getCanonicalDateRange(period, customStartDate, customEndDate);
}

const DailyGoalThermometer: React.FC<Props> = ({ viewPeriod = 'TODAY', customStartDate, customEndDate, missions: parentMissions, clientTables: parentClientTables, providerTables: parentProviderTables, clientsData: parentClientsData, lastDataUpdatedAt, onRefreshMissions, clientFilter, dailyGoalOverride, monthlyGoalOverride, titleSuffix, accentClass, historyKey: historyKeyProp }) => {
    const { showNotification } = useNotification();
    const dailyGoal = typeof dailyGoalOverride === 'number' ? dailyGoalOverride : DEFAULT_DAILY_GOAL;
    const monthlyGoal = typeof monthlyGoalOverride === 'number' ? monthlyGoalOverride : DEFAULT_MONTHLY_GOAL;
    const [isLoading, setIsLoading] = useState(false);
    const [userRole, setUserRole] = useState<string>('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [updateHistory, setUpdateHistory] = useState<GoalUpdateSnapshot[]>([]);
    const lastRecordedFetchAt = useRef<number | null>(null);
    const pendingManualRecord = useRef(false);

    const resolvedHistoryKey = historyKeyProp || `meta-${(titleSuffix || 'geral').toLowerCase().replace(/\s+/g, '-')}-${viewPeriod}`;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole((user.role || '').toLowerCase());
            } catch (e) { console.error(e); }
        }
    }, []);

    const filteredMissions = useMemo(() => {
        if (!parentMissions || parentMissions.length === 0) return [];
        const [start, end] = getDateRange(viewPeriod, customStartDate, customEndDate);
        return parentMissions.filter(m => {
            const d = new Date(m.startTime || m.start_time || m.createdAt || m.created_at);
            if (!(d >= start && d <= end)) return false;
            if (clientFilter) {
                const cname = ((m as any).originalClientName || (m as any).client || (m as any).client_name || '').toString();
                if (!clientFilter(cname)) return false;
            }
            return true;
        });
    }, [parentMissions, viewPeriod, customStartDate, customEndDate, clientFilter]);

    // CANÔNICO: delega o cálculo para a fonte única (mesma fórmula em todo o sistema).
    const { currentRevenue, currentCost } = useMemo(() => {
        if (!parentClientTables || !parentProviderTables || !parentClientsData) return { currentRevenue: 0, currentCost: 0 };
        const sums = sumCanonical(
            filteredMissions,
            { clientTables: parentClientTables, providerTables: parentProviderTables, clientsData: parentClientsData },
            currentTime,
        );
        return { currentRevenue: sums.rev, currentCost: sums.cost };
    }, [filteredMissions, parentClientTables, parentProviderTables, parentClientsData, currentTime]);

    // Custo separado do fornecedor TORRES (subconjunto das missões do período).
    const torresCost = useMemo(() => {
        if (!parentClientTables || !parentProviderTables || !parentClientsData) return 0;
        const torresMissions = filteredMissions.filter(m => {
            const p = ((m as any).provider || (m as any).providerName || (m as any).provider_name || '').toString().toUpperCase();
            return p.includes('TORRES');
        });
        if (torresMissions.length === 0) return 0;
        return sumCanonical(
            torresMissions,
            { clientTables: parentClientTables, providerTables: parentProviderTables, clientsData: parentClientsData },
            currentTime,
        ).cost;
    }, [filteredMissions, parentClientTables, parentProviderTables, parentClientsData, currentTime]);

    const otherCost = Math.max(0, currentCost - torresCost);

    const goal = useMemo(
        () => getGoalForPeriod(viewPeriod, customStartDate, customEndDate, dailyGoal, monthlyGoal),
        [viewPeriod, customStartDate, customEndDate, dailyGoal, monthlyGoal]
    );

    const stats = useMemo(() => {
        const percentage = goal > 0 ? Math.min(100, (currentRevenue / goal) * 100) : 0;
        const remaining = Math.max(0, goal - currentRevenue);
        const profit = currentRevenue - currentCost;
        const marginPercent = currentRevenue > 0 ? (profit / currentRevenue) * 100 : 0;
        
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
            textClass,
            profit,
            marginPercent
        };
    }, [currentRevenue, currentCost, goal]);

    const userPermissions = useMemo(() => {
        try {
            const storedUser = localStorage.getItem('userData');
            if (storedUser) {
                const user = JSON.parse(storedUser);
                return user.permissions || [];
            }
        } catch (e) {}
        return [];
    }, []);

    const canSeeMonetary = userRole === 'diretoria';

    const recordSnapshot = useCallback((source: 'manual' | 'sync') => {
        const next = pushGoalUpdateHistory(resolvedHistoryKey, {
            at: new Date().toISOString(),
            revenue: currentRevenue,
            cost: currentCost,
            profit: stats.profit,
            missionCount: filteredMissions.length,
            percentage: stats.percentage,
            source,
        });
        setUpdateHistory(next);
    }, [resolvedHistoryKey, currentRevenue, currentCost, stats.profit, stats.percentage, filteredMissions.length]);

    useEffect(() => {
        if (userRole === 'diretoria') {
            setUpdateHistory(loadGoalUpdateHistory(resolvedHistoryKey));
        }
    }, [resolvedHistoryKey, userRole]);

    // Registra após cada sincronização (manual ou automática) quando os dados do pai mudam
    useEffect(() => {
        if (userRole !== 'diretoria' || !lastDataUpdatedAt) return;
        const ts = lastDataUpdatedAt.getTime();
        if (lastRecordedFetchAt.current === ts) return;
        lastRecordedFetchAt.current = ts;
        if (!parentClientTables?.length) return;
        const source = pendingManualRecord.current ? 'manual' : 'sync';
        pendingManualRecord.current = false;
        recordSnapshot(source);
    }, [lastDataUpdatedAt, userRole, recordSnapshot, parentClientTables?.length, currentRevenue, currentCost, stats.profit, stats.percentage, filteredMissions.length]);

    const handleManualRefresh = useCallback(async () => {
        if (isRefreshing || isLoading) return;
        setIsRefreshing(true);
        try {
            if (onRefreshMissions) {
                pendingManualRecord.current = true;
                const result = await onRefreshMissions();
                if (result !== false) {
                    setCurrentTime(new Date());
                    showNotification('Sucesso', 'Meta atualizada com sucesso!', 'success');
                } else {
                    pendingManualRecord.current = false;
                }
            }
        } catch (e) {
            pendingManualRecord.current = false;
            console.error(e);
        } finally {
            setIsRefreshing(false);
        }
    }, [onRefreshMissions, showNotification, isRefreshing, isLoading]);

    const REFRESH_BUTTON_LABEL = 'Monitoramento 24h';

    const refreshButtonTitle = lastDataUpdatedAt
        ? `${REFRESH_BUTTON_LABEL} — Última atualização: ${formatDateTimeAuditBR(lastDataUpdatedAt)}`
        : `${REFRESH_BUTTON_LABEL} — Aguardando primeira sincronização`;

    const chartStroke = stats.percentage >= 91 ? '#16a34a' : stats.percentage >= 50 ? '#ca8a04' : '#dc2626';

    const suffix = titleSuffix ? ` ${titleSuffix}` : '';
    const labelText = viewPeriod === 'TODAY' ? `Meta Agendada${suffix} (Hoje)` :
                      viewPeriod === 'YESTERDAY' ? `Meta Agendada${suffix} (Ontem)` :
                      viewPeriod === 'WEEK' ? `Meta Semanal${suffix}` :
                      viewPeriod === 'MONTH' ? `Meta Mensal${suffix}` :
                      viewPeriod === 'YEAR' ? `Meta Anual${suffix}` :
                      viewPeriod === 'CUSTOM' ? `Meta Período${suffix}` :
                      `Faturamento Período${suffix}`;

    return (
        <div className="group perspective-1000 w-full max-w-lg mx-auto h-full overflow-visible">
            <div className="relative bg-white rounded-[35px] p-4 sm:p-5 border-x border-t border-b-4 border-gray-200/60 shadow-[0_20px_50px_rgba(0,0,0,0.06)] w-full h-full overflow-visible transition-all duration-700 hover:shadow-[0_25px_60px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 transform hover:rotate-0.5 border-r-[5px] ml-[0px] mr-[0px]">
                
                <div className="relative flex justify-between items-start gap-2 mb-4 min-w-0 min-h-[72px] overflow-visible">
                    <div className={`flex items-center gap-2.5 min-w-0 flex-1 ${canSeeMonetary ? 'pr-[138px]' : ''}`}>
                        <div className="relative shrink-0">
                            <div className={`p-2 rounded-[15px] text-white shadow-lg transition-colors duration-500 ${accentClass ? `bg-gradient-to-br ${accentClass}` : stats.colorClass}`}>
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
                            <div className="flex items-center gap-1 flex-wrap">
                                <span className={`w-1.5 h-1.5 rounded-full ${stats.isGoalMet ? 'bg-green-500' : 'animate-pulse ' + stats.colorClass}`}></span>
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Sincronização Ativa</span>
                                <span className="text-[8px] font-black text-slate-300">•</span>
                                <span
                                    className="text-[8px] font-black text-slate-700 uppercase tracking-widest bg-slate-100 px-1.5 py-[1px] rounded-md border border-slate-200 whitespace-nowrap"
                                    data-testid="text-mission-count"
                                    title="Quantidade de missões no período"
                                >
                                    {filteredMissions.length} {filteredMissions.length === 1 ? 'Missão' : 'Missões'}
                                </span>
                            </div>
                        </div>
                    </div>
                    {canSeeMonetary && (
                        <div className="absolute -right-1 -top-1 z-[160] flex flex-col items-end gap-1 overflow-visible pointer-events-auto">
                            <p className={`text-sm md:text-base font-black font-mono tracking-tighter whitespace-nowrap transition-colors duration-500 ${stats.textClass}`}>
                                {isLoading ? (
                                    <Loader2 size={14} className="animate-spin inline text-red-500" />
                                ) : (
                                    formatCurrency(currentRevenue)
                                )}
                            </p>
                            <GoalUpdateSparkline
                                rows={updateHistory}
                                stroke={chartStroke}
                                isRefreshing={isRefreshing || isLoading}
                                onRefresh={handleManualRefresh}
                                title={refreshButtonTitle}
                            />
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
                
                <div className="flex justify-between items-center gap-2 flex-wrap min-w-0">
                    <div className={`px-3 py-1.5 rounded-2xl border shadow-inner flex items-baseline gap-1.5 shrink-0 transition-all ${stats.percentage < 50 ? 'bg-red-50 border-red-100' : stats.percentage <= 90 ? 'bg-yellow-50 border-yellow-100' : 'bg-green-50 border-green-100'}`}>
                        <span className={`text-sm font-black italic leading-none ${stats.textClass}`}>
                            {stats.percentage.toFixed(1)}% 
                        </span>
                        <span className="text-[8px] uppercase font-black text-slate-400 tracking-tight">
                            Atingido
                        </span>
                    </div>

                    {canSeeMonetary && (
                        <div className="text-right min-w-0 shrink">
                            {stats.remaining > 0 ? (
                                <div className="flex flex-col items-end min-w-0">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate max-w-full">Restante para Alvo</span>
                                    <span className="text-[9px] md:text-[10px] font-black text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-gray-100 shadow-sm whitespace-nowrap">
                                        {formatCurrency(stats.remaining)}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 py-1 rounded-2xl shadow-lg shadow-emerald-100 animate-bounce">
                                    <Trophy size={11} fill="currentColor" />
                                    <span className="text-[8px] font-black uppercase tracking-widest leading-none whitespace-nowrap">Alvo Superado!</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {canSeeMonetary && currentRevenue > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                        <div className="flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="text-[7px] font-bold text-red-400 uppercase tracking-wide shrink-0">Custo:</span>
                                <span className="text-[10px] font-extrabold text-red-600 tracking-tight whitespace-nowrap truncate" data-testid="text-provider-cost">{formatCurrency(currentCost)}</span>
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                                <span className={`text-[7px] font-bold uppercase tracking-wide shrink-0 ${stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Lucro:</span>
                                <span className={`text-[10px] font-extrabold tracking-tight whitespace-nowrap truncate ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="text-profit">{formatCurrency(stats.profit)}</span>
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                                <span className={`text-[7px] font-bold uppercase tracking-wide shrink-0 ${stats.marginPercent >= 30 ? 'text-emerald-400' : stats.marginPercent >= 15 ? 'text-yellow-500' : 'text-red-400'}`}>Margem:</span>
                                <span className={`text-[10px] font-extrabold tracking-tight whitespace-nowrap truncate ${stats.marginPercent >= 30 ? 'text-emerald-600' : stats.marginPercent >= 15 ? 'text-yellow-600' : 'text-red-600'}`} data-testid="text-margin">{stats.marginPercent.toFixed(1)}%</span>
                            </div>
                        </div>
                        {torresCost > 0 && (
                            <div className="mt-2 pt-2 border-t border-dashed border-gray-200 flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap min-w-0">
                                <div className="flex items-center gap-1 min-w-0">
                                    <span className="text-[7px] font-bold text-amber-500 uppercase tracking-wide shrink-0">Custo Torres:</span>
                                    <span className="text-[10px] font-extrabold text-amber-600 tracking-tight whitespace-nowrap truncate" data-testid="text-torres-cost">{formatCurrency(torresCost)}</span>
                                </div>
                                <div className="flex items-center gap-1 min-w-0">
                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Custo Fornecedores:</span>
                                    <span className="text-[10px] font-extrabold text-slate-600 tracking-tight whitespace-nowrap truncate" data-testid="text-other-cost">{formatCurrency(otherCost)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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
