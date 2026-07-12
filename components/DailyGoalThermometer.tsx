import React, { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { Target, Loader2, Trophy, Zap, Clock, RefreshCw, Coins, ShoppingCart, Landmark, TrendingDown, TrendingUp, Minus, ChevronRight } from 'lucide-react';
import { ClientPriceTable, ProviderCostTable, Client, Mission } from '../types';
import { useNotification } from '../lib/NotificationContext';
import { formatDateTimeAuditBR } from '../lib/dateUtils';
import {
  getCanonicalDateRange,
  sumCanonical,
  computeCanonicalRevenueCost,
  type CanonicalPeriod,
} from '../lib/missionFinancialsCanonical';
import {
  formatGoalDelta,
  GOAL_SAMPLE_INTERVAL_MS,
  loadGoalUpdateHistory,
  pushGoalUpdateHistory,
  resolveGoalHistoryKey,
  selectChartSnapshots,
  type GoalUpdateSnapshot,
} from '../lib/goalUpdateHistory';
import { canViewGoalMonetaryData } from '../lib/goalPermissions';
import LowMarginDialog, { LOW_MARGIN_THRESHOLD_PCT } from './LowMarginDialog';
import { MissionStatus } from '../types';
import {
  isLowMarginVerified,
  loadLowMarginVerifiedMap,
  resolveLowMarginScopeKey,
} from '../lib/lowMarginVerified';

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
    canSeeMonetary?: boolean; // permissão financeira resolvida pelo componente pai
    onOpenMission?: (m: Mission) => void;
}

const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const CHART_VIEW_W = 320;
const CHART_VIEW_H = 88;
const CHART_PAD_X = 4;
const CHART_PAD_Y = 10;
const VALUE_EPS = 0.01;

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
}

const GoalUpdateAreaChart: React.FC<{
    rows: GoalUpdateSnapshot[];
    stroke: string;
    gradientId: string;
    isRefreshing: boolean;
    onRefresh: () => void;
    title: string;
    periodLabel: string;
}> = ({ rows, stroke, gradientId, isRefreshing, onRefresh, title, periodLabel }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const chronological = useMemo(() => selectChartSnapshots(rows), [rows]);

    const points = useMemo(() => {
        if (chronological.length === 0) return [];
        const values = chronological.map(r => r.revenue);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        const innerW = CHART_VIEW_W - CHART_PAD_X * 2;
        const innerH = CHART_VIEW_H - CHART_PAD_Y * 2;
        const midY = CHART_PAD_Y + innerH / 2;
        const baseY = CHART_VIEW_H - CHART_PAD_Y;
        return chronological.map((row, i) => {
            const x = CHART_PAD_X + (chronological.length === 1 ? innerW / 2 : (i / (chronological.length - 1)) * innerW);
            const y = range < VALUE_EPS ? midY : CHART_PAD_Y + (1 - (row.revenue - min) / range) * innerH;
            const prev = i > 0 ? chronological[i - 1].revenue : null;
            const delta = prev !== null ? row.revenue - prev : null;
            return { x, y, baseY, row, delta, i };
        });
    }, [chronological]);

    const linePath = useMemo(() => buildSmoothPath(points), [points]);
    const areaPath = useMemo(() => {
        if (!linePath || points.length === 0) return '';
        const last = points[points.length - 1];
        const first = points[0];
        return `${linePath} L ${last.x.toFixed(1)} ${last.baseY.toFixed(1)} L ${first.x.toFixed(1)} ${first.baseY.toFixed(1)} Z`;
    }, [linePath, points]);

    const lastPoint = points.length > 0 ? points[points.length - 1] : null;

    const showTooltip = (idx: number, el: SVGCircleElement) => {
        setHoverIdx(idx);
        const r = el.getBoundingClientRect();
        setTooltipPos({ top: r.top - 8, left: r.left + r.width / 2 });
    };

    return (
        <div className="relative w-full select-none overflow-visible" data-testid="goal-update-sparkline">
            <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Últimas 5 atualizações · {periodLabel}</span>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    aria-label={title}
                    title={title}
                    data-testid="button-refresh-goal"
                >
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>
            <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="block w-full overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-300 rounded-lg"
                aria-label={title}
            >
                {points.length === 0 ? (
                    <div className="flex items-center justify-center h-[88px] rounded-lg border border-dashed border-slate-200/80 bg-gradient-to-b from-slate-50/50 to-white text-[9px] font-semibold text-slate-400 uppercase">
                        Sem histórico — aguardando atualização
                    </div>
                ) : (
                    <svg
                        viewBox={`0 0 ${CHART_VIEW_W} ${CHART_VIEW_H}`}
                        className="w-full h-[88px] overflow-visible"
                        preserveAspectRatio="none"
                    >
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={stroke} stopOpacity={0.42} />
                                <stop offset="55%" stopColor={stroke} stopOpacity={0.12} />
                                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
                        {linePath && (
                            <path
                                d={linePath}
                                fill="none"
                                stroke={stroke}
                                strokeWidth={2.25}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        )}
                        {points.map((p) => (
                            <circle
                                key={`${p.row.at}-hit`}
                                cx={p.x}
                                cy={p.y}
                                r={8}
                                fill="transparent"
                                className="cursor-pointer"
                                onMouseEnter={(e) => showTooltip(p.i, e.currentTarget)}
                                onMouseLeave={() => setHoverIdx(null)}
                            />
                        ))}
                        {lastPoint && (
                            <>
                                <circle cx={lastPoint.x} cy={lastPoint.y} r={11} fill={stroke} fillOpacity={0.18} />
                                <circle cx={lastPoint.x} cy={lastPoint.y} r={5.5} fill={stroke} stroke="#fff" strokeWidth={2} />
                            </>
                        )}
                    </svg>
                )}
            </button>
            {hoverIdx !== null && points[hoverIdx] && (
                <div
                    className="fixed z-[9999] -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white shadow-xl px-2.5 py-1.5 text-left pointer-events-none min-w-[150px]"
                    style={{ top: tooltipPos.top, left: tooltipPos.left }}
                    data-testid="sparkline-tooltip"
                >
                    <p className="text-[9px] font-bold text-slate-700">{formatDateTimeAuditBR(points[hoverIdx].row.at)}</p>
                    <p className="text-[10px] font-black text-slate-800">{formatCurrency(points[hoverIdx].row.revenue)}</p>
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

type MetricFlow = 'in' | 'out' | 'result';

const MetricRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    amount: number;
    flow: MetricFlow;
    suffix?: string;
    trailingAction?: React.ReactNode;
}> = ({ icon, label, amount, flow, suffix, trailingAction }) => {
    const isPositive = amount >= 0;
    const valueClass =
        flow === 'in'
            ? 'text-emerald-600'
            : flow === 'out'
                ? 'text-red-600'
                : isPositive
                    ? 'text-emerald-600'
                    : 'text-red-600';
    const sign = flow === 'in' ? '(+)' : flow === 'out' ? '(-)' : isPositive ? '(+)' : '(-)';
    const displayAmount = Math.abs(amount);
    const value = `${sign} ${formatCurrency(displayAmount)}${suffix ? ` ${suffix}` : ''}`;

    return (
        <div className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-b-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">{icon}</div>
            <span className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
            <div className="flex items-center gap-1 shrink-0">
                {trailingAction}
                <span className={`text-[11px] font-black tabular-nums ${valueClass}`}>{value}</span>
            </div>
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

const DailyGoalThermometer: React.FC<Props> = ({ viewPeriod = 'TODAY', customStartDate, customEndDate, missions: parentMissions, clientTables: parentClientTables, providerTables: parentProviderTables, clientsData: parentClientsData, lastDataUpdatedAt, onRefreshMissions, clientFilter, dailyGoalOverride, monthlyGoalOverride, titleSuffix, accentClass, historyKey: historyKeyProp, canSeeMonetary: canSeeMonetaryProp, onOpenMission }) => {
    const { showNotification } = useNotification();
    const dailyGoal = typeof dailyGoalOverride === 'number' ? dailyGoalOverride : DEFAULT_DAILY_GOAL;
    const monthlyGoal = typeof monthlyGoalOverride === 'number' ? monthlyGoalOverride : DEFAULT_MONTHLY_GOAL;
    const [isLoading, setIsLoading] = useState(false);
    const [userRole, setUserRole] = useState<string>('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [updateHistory, setUpdateHistory] = useState<GoalUpdateSnapshot[]>([]);
    const [isLowMarginOpen, setIsLowMarginOpen] = useState(false);
    const [lowMarginVerifiedTick, setLowMarginVerifiedTick] = useState(0);
    const lastRecordedFetchAt = useRef<{ key: string; ts: number } | null>(null);
    const pendingManualRecord = useRef(false);

    const resolvedHistoryKey = useMemo(() => {
        const base = historyKeyProp || `meta-${(titleSuffix || 'geral').toLowerCase().replace(/\s+/g, '-')}`;
        return resolveGoalHistoryKey(base, viewPeriod, customStartDate, customEndDate, currentTime);
    }, [historyKeyProp, titleSuffix, viewPeriod, customStartDate, customEndDate, currentTime]);

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

    const lowMarginScopeKey = useMemo(
        () => resolveLowMarginScopeKey(resolvedHistoryKey),
        [resolvedHistoryKey],
    );

    const lowMarginCount = useMemo(() => {
        if (!parentClientTables || !parentProviderTables || !parentClientsData) return 0;
        const refs = { clientTables: parentClientTables, providerTables: parentProviderTables, clientsData: parentClientsData };
        const verifiedMap = loadLowMarginVerifiedMap(lowMarginScopeKey);
        let count = 0;
        for (const m of filteredMissions) {
            if (m.status === MissionStatus.REFUSED) continue;
            const r = computeCanonicalRevenueCost(m, refs, currentTime);
            if (r.rev <= 0 && r.cost <= 0) continue;
            const marginPct = r.rev > 0 ? ((r.rev - r.cost) / r.rev) * 100 : -100;
            if (marginPct < LOW_MARGIN_THRESHOLD_PCT && !isLowMarginVerified(verifiedMap, m.id, r.rev, r.cost)) count += 1;
        }
        return count;
    }, [filteredMissions, parentClientTables, parentProviderTables, parentClientsData, currentTime, lowMarginScopeKey, lowMarginVerifiedTick]);

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

    const canSeeMonetary = canViewGoalMonetaryData(canSeeMonetaryProp, userRole);

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
        if (canSeeMonetary) {
            setUpdateHistory(loadGoalUpdateHistory(resolvedHistoryKey));
        }
    }, [resolvedHistoryKey, canSeeMonetary]);

    // Registra após cada sincronização (manual ou automática) quando os dados do pai mudam.
    // A chave inclui o filtro (ex.: MONTH-2026-03) — trocar filtro ou virar o dia grava no bucket correto.
    useEffect(() => {
        if (!canSeeMonetary || !lastDataUpdatedAt) return;
        const ts = lastDataUpdatedAt.getTime();
        const prev = lastRecordedFetchAt.current;
        if (prev && prev.key === resolvedHistoryKey && prev.ts === ts) return;
        lastRecordedFetchAt.current = { key: resolvedHistoryKey, ts };
        if (!parentClientTables?.length) return;
        const source = pendingManualRecord.current ? 'manual' : 'sync';
        pendingManualRecord.current = false;
        recordSnapshot(source);
    }, [lastDataUpdatedAt, canSeeMonetary, recordSnapshot, resolvedHistoryKey, parentClientTables?.length, currentRevenue, currentCost, stats.profit, stats.percentage, filteredMissions.length]);

    // Amostra automática a cada 30 min (atualiza o bucket corrente ou abre um novo).
    useEffect(() => {
        if (!canSeeMonetary || !parentClientTables?.length) return;
        recordSnapshot('sync');
        const id = setInterval(() => recordSnapshot('sync'), GOAL_SAMPLE_INTERVAL_MS);
        return () => clearInterval(id);
    }, [canSeeMonetary, parentClientTables?.length, recordSnapshot, resolvedHistoryKey]);

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
    const gradientId = useId().replace(/:/g, '');

    const variationPct = useMemo(() => {
        if (updateHistory.length < 2) return null;
        const prev = updateHistory[1].revenue;
        if (Math.abs(prev) < VALUE_EPS) return null;
        return ((updateHistory[0].revenue - prev) / prev) * 100;
    }, [updateHistory]);

    const statusTitle = stats.isGoalMet
        ? 'Meta atingida'
        : stats.percentage >= 91
            ? 'Quase na meta'
            : stats.percentage >= 50
                ? 'Meta em andamento'
                : 'Abaixo da meta';

    const suffix = titleSuffix ? ` ${titleSuffix}` : '';
    const chartPeriodLabel = viewPeriod === 'TODAY' ? 'Hoje' :
                      viewPeriod === 'YESTERDAY' ? 'Ontem' :
                      viewPeriod === 'WEEK' ? 'Semana' :
                      viewPeriod === 'MONTH' ? 'Mês' :
                      viewPeriod === 'YEAR' ? 'Ano' :
                      viewPeriod === 'CUSTOM' ? 'Período' :
                      'Geral';
    const labelText = viewPeriod === 'TODAY' ? `Meta Agendada${suffix} (Hoje)` :
                      viewPeriod === 'YESTERDAY' ? `Meta Agendada${suffix} (Ontem)` :
                      viewPeriod === 'WEEK' ? `Meta Semanal${suffix}` :
                      viewPeriod === 'MONTH' ? `Meta Mensal${suffix}` :
                      viewPeriod === 'YEAR' ? `Meta Anual${suffix}` :
                      viewPeriod === 'CUSTOM' ? `Meta Período${suffix}` :
                      `Faturamento Período${suffix}`;

    return (
        <div className="group w-full max-w-lg mx-auto h-full">
            <div className="relative bg-white rounded-[28px] p-4 sm:p-5 border border-gray-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.06)] w-full h-full overflow-visible transition-all duration-500 hover:shadow-[0_18px_48px_rgba(0,0,0,0.09)]">

                {/* Cabeçalho */}
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${stats.colorClass} ${stats.isGoalMet ? '' : 'animate-pulse'}`} />
                        <div className="min-w-0">
                            <p className={`text-[11px] font-black uppercase tracking-wide leading-tight ${stats.textClass}`}>{statusTitle}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider truncate">{labelText}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-slate-400">
                        <Clock size={10} className="animate-spin duration-[5000ms]" />
                        <span className="text-[8px] font-bold uppercase">{filteredMissions.length} missões</span>
                    </div>
                </div>

                {/* Valor + variação */}
                {canSeeMonetary ? (
                    <>
                        <div className="flex items-end justify-between gap-3 mb-1">
                            <p className={`text-xl sm:text-2xl font-black font-mono tracking-tight leading-none ${stats.textClass}`} data-testid="text-goal-revenue">
                                {isLoading ? <Loader2 size={20} className="animate-spin inline" /> : formatCurrency(currentRevenue)}
                            </p>
                            {variationPct !== null && (
                                <div className="text-right shrink-0 pb-0.5">
                                    <p className="text-[8px] font-bold uppercase text-slate-400">variação</p>
                                    <p className={`text-[11px] font-black flex items-center justify-end gap-0.5 ${Math.abs(variationPct) < 0.05 ? 'text-slate-500' : variationPct > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {Math.abs(variationPct) < 0.05 ? <Minus size={10} /> : variationPct > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                        {Math.abs(variationPct).toFixed(1).replace('.', ',')}%
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Gráfico área — últimas 5 atualizações */}
                        <div className="mb-3 -mx-1 overflow-visible">
                            <GoalUpdateAreaChart
                                rows={updateHistory}
                                stroke={chartStroke}
                                gradientId={gradientId}
                                isRefreshing={isRefreshing || isLoading}
                                onRefresh={handleManualRefresh}
                                title={refreshButtonTitle}
                                periodLabel={chartPeriodLabel}
                            />
                        </div>
                    </>
                ) : (
                    <div className="mb-3 flex items-center gap-2">
                        <div className={`p-2 rounded-[15px] text-white shadow-lg ${accentClass ? `bg-gradient-to-br ${accentClass}` : stats.colorClass}`}>
                            <Target size={16} strokeWidth={3} />
                        </div>
                        <span className="text-[9px] font-black text-slate-500 uppercase">Sincronização ativa</span>
                    </div>
                )}

                {/* Barra de progresso */}
                <div className="relative w-full h-2 bg-slate-100 rounded-full mb-3 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                            width: `${stats.percentage}%`,
                            backgroundColor: stats.percentage < 50 ? '#ef4444' : stats.percentage <= 90 ? '#eab308' : '#22c55e',
                        }}
                    />
                </div>

                <div className="flex justify-between items-center gap-2 mb-3">
                    <span className={`text-[11px] font-black ${stats.textClass}`}>{stats.percentage.toFixed(1)}% atingido</span>
                    {canSeeMonetary && (
                        stats.remaining > 0 ? (
                            <span className="text-[9px] font-bold text-slate-500">Restante: {formatCurrency(stats.remaining)}</span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600">
                                <Trophy size={10} /> Alvo superado
                            </span>
                        )
                    )}
                </div>

                {/* Detalhes financeiros */}
                {canSeeMonetary && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-2.5 py-0.5">
                        <MetricRow
                            icon={<Coins size={14} />}
                            label="Receita"
                            amount={currentRevenue}
                            flow="in"
                            suffix={`(${stats.percentage.toFixed(1)}%)`}
                        />
                        <MetricRow
                            icon={<ShoppingCart size={14} />}
                            label="Custos operacionais"
                            amount={currentCost}
                            flow="out"
                        />
                        <MetricRow
                            icon={<Landmark size={14} />}
                            label="Lucro líquido"
                            amount={stats.profit}
                            flow="result"
                            suffix={`(${stats.marginPercent.toFixed(1)}%)`}
                            trailingAction={
                                onOpenMission && lowMarginCount > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsLowMarginOpen(true)}
                                        className="inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-800 hover:bg-amber-100 transition"
                                        title={`Ver ${lowMarginCount} OS com margem abaixo de ${LOW_MARGIN_THRESHOLD_PCT}%`}
                                        data-testid="button-open-low-margin-from-goal"
                                    >
                                        {lowMarginCount} &lt;{LOW_MARGIN_THRESHOLD_PCT}%
                                        <ChevronRight size={10} />
                                    </button>
                                ) : null
                            }
                        />
                        {torresCost > 0 && (
                            <>
                                <MetricRow icon={<Zap size={14} />} label="Custo Torres" amount={torresCost} flow="out" />
                                <MetricRow icon={<Target size={14} />} label="Custo fornecedores" amount={otherCost} flow="out" />
                            </>
                        )}
                    </div>
                )}
            </div>

            {isLowMarginOpen && onOpenMission && parentClientTables && parentProviderTables && parentClientsData && (
                <LowMarginDialog
                    isOpen={isLowMarginOpen}
                    onClose={() => setIsLowMarginOpen(false)}
                    missions={filteredMissions}
                    allMissions={parentMissions}
                    clientTables={parentClientTables}
                    providerTables={parentProviderTables}
                    clientsData={parentClientsData}
                    periodLabel={chartPeriodLabel}
                    scopeLabel={titleSuffix ? `Meta ${titleSuffix}` : 'Meta Geral'}
                    verifiedScopeKey={lowMarginScopeKey}
                    onVerified={() => setLowMarginVerifiedTick((t) => t + 1)}
                    onOpenMission={onOpenMission}
                />
            )}

            <style>{`
                @keyframes shimmer-fast {
                    0% { transform: translateX(-150%) skewX(-20deg); }
                    100% { transform: translateX(150%) skewX(-20deg); }
                }
                .animate-shimmer-fast {
                    animation: shimmer-fast 3s infinite linear;
                }
            `}</style>
        </div>
    );
};

export default DailyGoalThermometer;
