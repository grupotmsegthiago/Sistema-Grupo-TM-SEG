import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Mission, MissionStatus, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { calculateMissionFinancials } from '../lib/financialUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, Legend, LabelList
} from 'recharts';
import {
    Activity, TrendingUp, TrendingDown, Wallet, Percent, Truck, Target,
    DollarSign, Calendar, CheckCircle2, XCircle, AlertTriangle,
    Trophy, Briefcase, Shield, PieChart as PieChartIcon, Lock, RefreshCw,
    Upload, FileSpreadsheet, Loader2, Search, CheckCircle, XOctagon, Edit2, Download, Calculator
} from 'lucide-react';
import * as XLSX from 'xlsx';

const COLORS = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#ec4899', '#0891b2', '#84cc16'];
const STATUS_COLORS: Record<string, string> = {
    'Concluída': '#059669', 'Em Viagem': '#2563eb', 'Agendada': '#7c3aed',
    'Cancelada': '#d97706', 'Na Origem': '#0891b2', 'Solicitada': '#ec4899',
    'Documentação': '#84cc16', 'Pendente': '#94a3b8'
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(2)}M`;
    if (Math.abs(v) >= 10000) return `R$ ${(v / 1000).toFixed(1)}K`;
    return fmtBRL(v);
};

type DashPeriod = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

const PERIOD_LABELS: Record<DashPeriod, string> = {
    TODAY: 'Hoje', YESTERDAY: 'Ontem', WEEK: 'Semana', MONTH: 'Mês', YEAR: 'Ano', CUSTOM: 'Personalizado'
};

function getDateRange(period: DashPeriod, customStart: string, customEnd: string): [Date, Date] {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    switch (period) {
        case 'TODAY': return [startOfDay(now), endOfDay(now)];
        case 'YESTERDAY': { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)]; }
        case 'WEEK': { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return [startOfDay(s), endOfDay(now)]; }
        case 'MONTH': return [new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0), endOfDay(now)];
        case 'YEAR': return [new Date(now.getFullYear(), 0, 1, 0, 0, 0), endOfDay(now)];
        case 'CUSTOM': {
            const s = customStart ? new Date(customStart + 'T00:00:00') : startOfDay(now);
            const e = customEnd ? new Date(customEnd + 'T23:59:59') : endOfDay(now);
            return [s, e];
        }
    }
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
        <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-gray-700 max-w-xs">
            <p className="font-black text-gray-300 uppercase tracking-wider mb-1.5 text-[11px] border-b border-gray-700 pb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="font-bold text-[12px] leading-relaxed" style={{ color: p.color || '#fff' }}>
                    {p.name}: {typeof p.value === 'number' ? (p.value > 50 || p.name?.includes('aturamento') || p.name?.includes('usto') || p.name?.includes('ucro') || p.name?.includes('cumulado') ? fmtBRL(p.value) : p.value) : p.value}
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
    onOpenMission?: (mission: Mission) => void;
    onRefreshMissions?: () => void;
    viewPeriod?: string;
    customStartDate?: string;
    customEndDate?: string;
}

const AXIS_TICK = { fontSize: 11, fontWeight: 700, fill: '#64748b' };
const AXIS_TICK_SM = { fontSize: 10, fontWeight: 700, fill: '#64748b' };
const AXIS_LABEL_Y = { fontSize: 10, fontWeight: 800, fill: '#475569' };

const mapViewPeriodToDash = (vp?: string): DashPeriod => {
    if (!vp) return 'MONTH';
    const map: Record<string, DashPeriod> = { TODAY: 'TODAY', YESTERDAY: 'YESTERDAY', WEEK: 'WEEK', MONTH: 'MONTH', YEAR: 'YEAR', CUSTOM: 'CUSTOM', ALL: 'YEAR' };
    return map[vp] || 'MONTH';
};

const ExecutiveDashboard: React.FC<Props> = ({ missions, isDirector, clientTables, providerTables, clientsData, onOpenMission, onRefreshMissions, viewPeriod: parentPeriod, customStartDate: parentStartDate, customEndDate: parentEndDate }) => {

    const [refreshKey, setRefreshKey] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [period, setPeriod] = useState<DashPeriod>(mapViewPeriodToDash(parentPeriod));
    const [customStart, setCustomStart] = useState(parentStartDate || '');
    const [customEnd, setCustomEnd] = useState(parentEndDate || '');
    
    useEffect(() => {
        setPeriod(mapViewPeriodToDash(parentPeriod));
        if (parentStartDate) setCustomStart(parentStartDate);
        if (parentEndDate) setCustomEnd(parentEndDate);
    }, [parentPeriod, parentStartDate, parentEndDate]);
    const [excelComparison, setExcelComparison] = useState<any[] | null>(null);
    const [excelAiAnalysis, setExcelAiAnalysis] = useState<string | null>(null);
    const [isExcelLoading, setIsExcelLoading] = useState(false);
    const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
    const [showExcelPanel, setShowExcelPanel] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [adjustedOsIds, setAdjustedOsIds] = useState<Set<string>>(new Set());
    const prevMissionFinancialsRef = useRef<any[] | null>(null);
    const [showPasteArea, setShowPasteArea] = useState(false);
    const [pastedText, setPastedText] = useState('');

    const [isRefreshingExcel, setIsRefreshingExcel] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [recalcResults, setRecalcResults] = useState<any>(null);

    const handleRefresh = useCallback(() => {
        setRefreshKey(k => k + 1);
        setLastUpdate(new Date());
    }, []);

    const handleRefreshExcelComparison = useCallback(() => {
        if (onRefreshMissions) {
            setIsRefreshingExcel(true);
            onRefreshMissions();
            setTimeout(() => {
                setRefreshKey(k => k + 1);
                setLastUpdate(new Date());
                setIsRefreshingExcel(false);
            }, 2000);
        } else {
            setRefreshKey(k => k + 1);
            setLastUpdate(new Date());
        }
    }, [onRefreshMissions]);

    const handleBatchRecalculate = useCallback(async (dryRun: boolean) => {
        setIsRecalculating(true);
        setRecalcResults(null);
        try {
            const resp = await fetch('/api/billing/recalculate-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Erro ao recalcular');
            setRecalcResults(data);
            if (!dryRun && onRefreshMissions) onRefreshMissions();
        } catch (e: any) {
            alert('Erro: ' + e.message);
        } finally {
            setIsRecalculating(false);
        }
    }, [onRefreshMissions]);

    const filteredMissions = useMemo(() => {
        const [start, end] = getDateRange(period, customStart, customEnd);
        return missions.filter(m => {
            const activeStatuses = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN, MissionStatus.SCHEDULED, MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION];
            const isActive = activeStatuses.includes(m.status as MissionStatus);
            if (period === 'TODAY' && isActive) return true;
            const d = new Date(m.startTime || m.createdAt);
            return d >= start && d <= end;
        });
    }, [missions, period, customStart, customEnd, refreshKey]);

    const missionFinancials = useMemo(() => {
        return filteredMissions.map(m => {
            if (m.status === MissionStatus.REFUSED) return { ...m, rev: 0, cost: 0, profit: 0 };

            const hasStoredRevenue = (m.revenue_value != null && m.revenue_value > 0);
            const hasStoredCost = (m.cost_value != null && m.cost_value > 0);

            if (hasStoredRevenue || hasStoredCost) {
                const rev = (m.revenue_value || 0) + Math.max(0, m.toll_value || 0);
                const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
                const cost = (m.cost_value || 0) + tollProv;
                return { ...m, rev, cost, profit: rev - cost };
            }

            const isCancelledMission = m.status === MissionStatus.CANCELLED;
            const missionObj: Mission = {
                ...m,
                startKm: m.startKm ?? m.start_km,
                endKm: m.endKm ?? m.end_km,
                startTime: m.startTime ?? m.start_time,
                endTime: m.endTime ?? m.end_time,
                ...(isCancelledMission ? { status: MissionStatus.COMPLETED } : {})
            };
            const clientName = (m.originalClientName || m.client || '').trim();
            const matchedClient = clientsData.find(c => c.name === clientName);
            const financials = calculateMissionFinancials(
                missionObj,
                clientTables,
                providerTables,
                matchedClient,
                new Date()
            );
            const rev = financials.client.total || 0;
            const cost = financials.provider.total || 0;

            return { ...m, rev, cost, profit: rev - cost };
        });
    }, [filteredMissions, clientTables, providerTables, clientsData, refreshKey]);

    useEffect(() => {
        if (!excelComparison || excelComparison.length === 0) {
            prevMissionFinancialsRef.current = missionFinancials;
            return;
        }
        const prev = prevMissionFinancialsRef.current;
        prevMissionFinancialsRef.current = missionFinancials;
        if (!prev || prev === missionFinancials) return;

        let hasChanges = false;
        const newAdjustedIds = new Set(adjustedOsIds);
        const updated = excelComparison.map(c => {
            if (!c.found) return c;
            const systemMission = missionFinancials.find((m: any) => {
                const sysId = String(m.id || '').toUpperCase().trim();
                const cId = c.osId.replace('GTM-', '');
                return sysId === c.osId || `GTM-${sysId}` === c.osId || sysId.replace('GTM-', '') === cId;
            });
            if (!systemMission) return c;
            const newSysRev = systemMission.rev || 0;
            const newSysCost = systemMission.cost || 0;
            if (Math.abs(newSysRev - c.sysRev) < 0.01 && Math.abs(newSysCost - c.sysCost) < 0.01) return c;
            hasChanges = true;
            newAdjustedIds.add(c.osId);
            const revDiff = c.excelRev > 0 ? Math.abs(newSysRev - c.excelRev) : 0;
            const costDiff = c.excelCost > 0 ? Math.abs(newSysCost - c.excelCost) : 0;
            const revMatch = c.excelRev > 0 ? revDiff <= 10 : true;
            const costMatch = c.excelCost > 0 ? costDiff <= 10 : true;
            return { ...c, sysRev: newSysRev, sysCost: newSysCost, revDiff, costDiff, revMatch, costMatch };
        });
        if (hasChanges) {
            setAdjustedOsIds(newAdjustedIds);
            setExcelComparison(updated);
        }
    }, [missionFinancials]);

    const parseExcelValue = (val: any): number => {
        if (val == null) return 0;
        if (typeof val === 'number') return val;
        const str = String(val).replace(/[R$\s.]/g, '').replace(',', '.');
        const n = parseFloat(str);
        return isNaN(n) ? 0 : n;
    };

    const extractOsNumber = (val: any): string => {
        if (!val) return '';
        const str = String(val).trim().toUpperCase();
        const match = str.match(/GTM[-\s]?(\d+)/i);
        if (match) return `GTM-${match[1]}`;
        const numOnly = str.replace(/\D/g, '');
        if (numOnly.length >= 3) return `GTM-${numOnly}`;
        return str;
    };

    const extractSysMissionDetails = (sm: any) => {
        if (!sm) return null;
        const startKm = sm.startKm ?? sm.start_km ?? null;
        const endKm = sm.endKm ?? sm.end_km ?? null;
        const sysKm = (startKm != null && endKm != null && endKm > startKm) ? endKm - startKm : (sm.traveled_km ?? sm.traveledKm ?? null);
        const st = sm.startTime ?? sm.start_time;
        const et = sm.endTime ?? sm.end_time;
        const sysHoraInicio = st ? new Date(st).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
        const sysHoraFim = et ? new Date(et).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
        const sysDataInicial = st ? new Date(st).toLocaleDateString('pt-BR') : '';
        const sysDataFinal = et ? new Date(et).toLocaleDateString('pt-BR') : '';
        const sysToll = Math.max(0, sm.toll_value || 0);
        const sysActivation = sm.revenue_value || 0;
        const sysStartKm = startKm;
        const sysEndKm = endKm;
        const sysRota = sm.origin && sm.destination ? `${sm.origin} → ${sm.destination}` : (sm.origin || sm.destination || '');
        const sysOperacao = sm.operation_type || '';
        return { sysKm, sysStartKm, sysEndKm, sysHoraInicio, sysHoraFim, sysDataInicial, sysDataFinal, sysToll, sysActivation, sysRota, sysOperacao };
    };

    const detectSheetLayout = (ws: XLSX.WorkSheet) => {
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        let headerRow = -1;
        let osCol = -1;
        let clienteCol = -1;
        let revTotalCol = -1;
        let costTotalCol = -1;
        let fornecedorCol = -1;
        let rotaCol = -1;
        let operacaoCol = -1;
        let valorBaseCol = -1;
        let hrFranqCol = -1;
        let kmFranqCol = -1;
        let hrExtraCol = -1;
        let kmExtraCol = -1;
        let pedagioCol = -1;
        let dataInicialCol = -1;
        let horaInicioCol = -1;
        let dataFinalCol = -1;
        let horaFimCol = -1;
        let viaturaCol = -1;
        let veiculoEscoltadoCol = -1;
        let kmInicialCol = -1;
        let kmFinalCol = -1;
        let kmTotalCol = -1;
        let totalFinalCol = -1;
        let estacionamentoCol = -1;

        for (let r = 0; r <= Math.min(20, range.e.r); r++) {
            for (let c = 0; c <= Math.min(range.e.c, 100); c++) {
                const cell = ws[XLSX.utils.encode_cell({r, c})];
                if (!cell) continue;
                const v = String(cell.v).toUpperCase().trim();
                if (v === 'Nº' || v === 'N°' || v === 'NR' || v === 'OS' || v === 'NUM' || v === 'NÚMERO' || v === 'NUMERO' || v === 'N' || v === 'COD' || v === 'CODIGO' || v === 'CÓDIGO') {
                    if (headerRow === -1 || r === headerRow) {
                        headerRow = r;
                        if (osCol === -1) osCol = c;
                    }
                }
            }
        }

        if (headerRow >= 0) {
            const seenTotal: number[] = [];
            const seenInicial: number[] = [];
            const seenFinal: number[] = [];
            for (let c = 0; c <= Math.min(range.e.c, 100); c++) {
                const cell = ws[XLSX.utils.encode_cell({r: headerRow, c})];
                if (!cell) continue;
                const v = String(cell.v).toUpperCase().trim();
                if (v === 'CLIENTE' && clienteCol === -1) clienteCol = c;
                if (v === 'FORNECEDOR' && fornecedorCol === -1) fornecedorCol = c;
                if ((v === 'ROTA') && rotaCol === -1) rotaCol = c;
                if ((v === 'OPERAÇÃO' || v === 'OPERACAO') && operacaoCol === -1) operacaoCol = c;
                if ((v === 'VALOR' || v === 'VALOR BASE') && valorBaseCol === -1) valorBaseCol = c;
                if ((v === 'HR FRANQ' || v === 'HR FRANQ.' || v === 'HORA FRANQUIA' || v === 'HORAS FRANQUIA') && hrFranqCol === -1) hrFranqCol = c;
                if ((v === 'KM FRANQ' || v === 'KM FRANQ.' || v === 'KM FRANQUIA') && kmFranqCol === -1) kmFranqCol = c;
                if ((v === 'HR EXTRA' || v === 'HR EXTRA.' || v === 'HORA EXTRA' || v === 'HORAS EXTRA' || v === 'HORAS EXTRAS') && hrExtraCol === -1) hrExtraCol = c;
                if ((v === 'KM EXTRA' || v === 'KM EXTRA.' || v === 'KM EXCEDENTE') && kmExtraCol === -1) kmExtraCol = c;
                if ((v === 'PEDÁGIO' || v === 'PEDAGIO' || v === 'VALOR PEDÁGIO' || v === 'VALOR PEDAGIO') && pedagioCol === -1) pedagioCol = c;
                if ((v === 'DATA INICIAL' || v === 'DATA INÍCIO' || v === 'DATA INICIO' || v === 'DT INICIAL' || v === 'DT INICIO') && dataInicialCol === -1) dataInicialCol = c;
                if ((v === 'HORA INICIAL' || v === 'HORA INÍCIO' || v === 'HORA INICIO' || v === 'HR INÍCIO' || v === 'HR INICIO' || v === 'H. INÍCIO' || v === 'H. INICIO') && horaInicioCol === -1) horaInicioCol = c;
                if ((v === 'DATA FINAL' || v === 'DATA FIM' || v === 'DT FINAL' || v === 'DT FIM') && dataFinalCol === -1) dataFinalCol = c;
                if ((v === 'HORA FINAL' || v === 'HORA FIM' || v === 'HR FIM' || v === 'HR FINAL' || v === 'H. FIM' || v === 'H. FINAL') && horaFimCol === -1) horaFimCol = c;
                if ((v === 'VIATURA' || v === 'PLACA' || v === 'VTR') && viaturaCol === -1) viaturaCol = c;
                if ((v === 'VEICULO ESCOLTADO' || v === 'VEÍCULO ESCOLTADO' || v === 'ESCOLTADO' || v === 'CARGA') && veiculoEscoltadoCol === -1) veiculoEscoltadoCol = c;
                if ((v === 'ESTACIONAMENTO' || v === 'PERNOITE') && estacionamentoCol === -1) estacionamentoCol = c;
                if (v === 'VALOR TOTAL' && revTotalCol === -1) revTotalCol = c;
                if (v === 'TOTAL') {
                    seenTotal.push(c);
                    totalFinalCol = c;
                }
                if (v === 'INICIAL') seenInicial.push(c);
                if (v === 'FINAL') seenFinal.push(c);
            }

            if (seenInicial.length >= 2 && seenFinal.length >= 2) {
                kmInicialCol = seenInicial[1];
                kmFinalCol = seenFinal[1];
            }
            if (seenInicial.length >= 1 && seenFinal.length >= 1 && kmInicialCol === -1) {
                kmInicialCol = seenInicial[0];
                kmFinalCol = seenFinal[0];
            }

            const totalCols = seenTotal.filter(c => c > 20);
            if (totalCols.length >= 2) {
                kmTotalCol = totalCols[0];
                costTotalCol = totalCols[totalCols.length - 1];
            } else if (totalCols.length === 1) {
                costTotalCol = totalCols[0];
            }

            if (revTotalCol === -1 && totalFinalCol >= 0) {
                revTotalCol = totalFinalCol;
            }
        }

        return { headerRow, osCol, clienteCol, fornecedorCol, rotaCol, operacaoCol, valorBaseCol, hrFranqCol, kmFranqCol, hrExtraCol, kmExtraCol, pedagioCol, dataInicialCol, horaInicioCol, dataFinalCol, horaFimCol, viaturaCol, veiculoEscoltadoCol, kmInicialCol, kmFinalCol, kmTotalCol, estacionamentoCol, revTotalCol, costTotalCol, totalFinalCol, maxRow: range.e.r };
    };

    const handleExcelUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsExcelLoading(true);
        setExcelComparison(null);
        setExcelAiAnalysis(null);
        setAdjustedOsIds(new Set());

        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];

            const layout = detectSheetLayout(ws);
            const getCell = (r: number, c: number) => {
                const cell = ws[XLSX.utils.encode_cell({r, c})];
                return cell ? cell.v : null;
            };

            let { headerRow, osCol, clienteCol, fornecedorCol, rotaCol, operacaoCol, valorBaseCol, hrFranqCol, kmFranqCol, hrExtraCol, kmExtraCol, pedagioCol, dataInicialCol, horaInicioCol, dataFinalCol, horaFimCol, viaturaCol, veiculoEscoltadoCol, kmInicialCol, kmFinalCol, kmTotalCol, estacionamentoCol, revTotalCol, costTotalCol, totalFinalCol, maxRow } = layout;

            const parseExcelTime = (val: any): string => {
                if (val == null) return '';
                if (typeof val === 'number' && val < 1) {
                    const totalMinutes = Math.round(val * 24 * 60);
                    const h = Math.floor(totalMinutes / 60);
                    const m = totalMinutes % 60;
                    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                }
                if (typeof val === 'number' && val >= 1) {
                    const d = new Date((val - 25569) * 86400 * 1000);
                    if (!isNaN(d.getTime())) return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
                }
                return String(val).trim();
            };

            const parseExcelDate = (val: any): string => {
                if (val == null) return '';
                if (typeof val === 'number') {
                    const d = new Date((val - 25569) * 86400 * 1000);
                    if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
                }
                return String(val).trim();
            };

            if (headerRow === -1) {
                const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                const keys = Object.keys(rows[0] || {});
                osCol = 0;
                const osKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('OS') || kn.includes('GTM') || kn === 'Nº' || kn === 'N°' || kn === 'NR' || kn === 'NUM' || kn === 'NÚMERO' || kn === 'NUMERO' || kn === 'COD' || kn === 'CODIGO' || kn === 'CÓDIGO' || kn === 'N'; }) || keys[0];
                const revKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('VALOR TOTAL') || kn.includes('RECEITA') || kn.includes('FATURAMENTO'); });
                const costKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('CUSTO') || kn.includes('PAGAMENTO'); });
                const kmKey = keys.find(k => { const kn = k.toUpperCase(); return kn === 'KM' || kn.includes('KM TOTAL') || kn.includes('QUILOMETRAGEM') || kn.includes('DISTÂNCIA') || kn.includes('DISTANCIA') || kn.includes('KM REAL') || kn.includes('KM PERCORRIDO'); });
                const horaIniKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('HORA INÍCIO') || kn.includes('HORA INICIO') || kn.includes('HR INÍCIO') || kn.includes('HR INICIO') || kn === 'INÍCIO' || kn === 'INICIO' || kn.includes('SAÍDA') || kn.includes('SAIDA'); });
                const horaFimKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('HORA FIM') || kn.includes('HORA FINAL') || kn.includes('HR FIM') || kn.includes('HR FINAL') || kn === 'FIM' || kn === 'FINAL' || kn.includes('CHEGADA'); });
                const acionKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('ACIONAMENTO') || kn.includes('VALOR BASE') || kn === 'BASE' || kn.includes('ATIVAÇÃO') || kn.includes('ATIVACAO'); });
                const tollKey = keys.find(k => { const kn = k.toUpperCase(); return kn.includes('PEDÁGIO') || kn.includes('PEDAGIO'); });

                const comparisons: any[] = [];
                for (const row of rows) {
                    const osId = extractOsNumber(row[osKey]);
                    if (!osId) continue;
                    const excelRev = revKey ? parseExcelValue(row[revKey]) : 0;
                    const excelCost = costKey ? parseExcelValue(row[costKey]) : 0;
                    const excelKm = kmKey ? parseExcelValue(row[kmKey]) : null;
                    const excelHoraInicio = horaIniKey ? parseExcelTime(row[horaIniKey]) : '';
                    const excelHoraFim = horaFimKey ? parseExcelTime(row[horaFimKey]) : '';
                    const excelAcionamento = acionKey ? parseExcelValue(row[acionKey]) : null;
                    const excelToll = tollKey ? parseExcelValue(row[tollKey]) : null;
                    const systemMission = missionFinancials.find(m => {
                        const sysId = String(m.id || '').toUpperCase().trim();
                        return sysId === osId || `GTM-${sysId}` === osId || sysId.replace('GTM-', '') === osId.replace('GTM-', '');
                    });
                    const sysRev = systemMission?.rev || 0;
                    const sysCost = systemMission?.cost || 0;
                    const sysDetails = extractSysMissionDetails(systemMission);
                    const revDiff = excelRev > 0 ? Math.abs(sysRev - excelRev) : 0;
                    const costDiff = excelCost > 0 ? Math.abs(sysCost - excelCost) : 0;
                    const revMatch = excelRev > 0 ? revDiff <= 10 : true;
                    const costMatch = excelCost > 0 ? costDiff <= 10 : true;
                    comparisons.push({ osId, found: !!systemMission, excelRev, excelCost, sysRev, sysCost, revDiff, costDiff, revMatch, costMatch, status: systemMission?.status || 'Não encontrada', client: systemMission?.client || '-', excelKm, excelHoraInicio, excelHoraFim, excelAcionamento, excelToll, ...(sysDetails || {}) });
                }
                comparisons.sort((a, b) => (!a.found ? -1 : !b.found ? 1 : (!a.revMatch||!a.costMatch) ? -1 : (!b.revMatch||!b.costMatch) ? 1 : (b.revDiff+b.costDiff)-(a.revDiff+a.costDiff)));
                setExcelComparison(comparisons);
                setShowExcelPanel(true);
                setIsExcelLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            const comparisons: any[] = [];
            for (let r = headerRow + 1; r <= maxRow; r++) {
                const osRaw = getCell(r, osCol);
                if (!osRaw || (typeof osRaw !== 'number' && !String(osRaw).match(/\d{3,}/))) continue;

                const osId = extractOsNumber(osRaw);
                if (!osId) continue;

                const clienteRaw = clienteCol >= 0 ? String(getCell(r, clienteCol) || '') : '';
                const fornRaw = fornecedorCol >= 0 ? String(getCell(r, fornecedorCol) || '') : '';
                const excelRev = revTotalCol >= 0 ? parseExcelValue(getCell(r, revTotalCol)) : 0;
                const excelCost = costTotalCol >= 0 ? parseExcelValue(getCell(r, costTotalCol)) : 0;
                const excelRota = rotaCol >= 0 ? String(getCell(r, rotaCol) || '') : '';
                const excelOperacao = operacaoCol >= 0 ? String(getCell(r, operacaoCol) || '') : '';
                const excelValorBase = valorBaseCol >= 0 ? parseExcelValue(getCell(r, valorBaseCol)) : null;
                const excelHrFranq = hrFranqCol >= 0 ? parseExcelValue(getCell(r, hrFranqCol)) : null;
                const excelKmFranq = kmFranqCol >= 0 ? parseExcelValue(getCell(r, kmFranqCol)) : null;
                const excelHrExtra = hrExtraCol >= 0 ? parseExcelValue(getCell(r, hrExtraCol)) : null;
                const excelKmExtra = kmExtraCol >= 0 ? parseExcelValue(getCell(r, kmExtraCol)) : null;
                const excelToll = pedagioCol >= 0 ? parseExcelValue(getCell(r, pedagioCol)) : null;
                const excelDataInicial = dataInicialCol >= 0 ? parseExcelDate(getCell(r, dataInicialCol)) : '';
                const excelHoraInicio = horaInicioCol >= 0 ? parseExcelTime(getCell(r, horaInicioCol)) : '';
                const excelDataFinal = dataFinalCol >= 0 ? parseExcelDate(getCell(r, dataFinalCol)) : '';
                const excelHoraFim = horaFimCol >= 0 ? parseExcelTime(getCell(r, horaFimCol)) : '';
                const excelKmInicial = kmInicialCol >= 0 ? parseExcelValue(getCell(r, kmInicialCol)) : null;
                const excelKmFinal = kmFinalCol >= 0 ? parseExcelValue(getCell(r, kmFinalCol)) : null;
                const excelKmTotal = kmTotalCol >= 0 ? parseExcelValue(getCell(r, kmTotalCol)) : null;
                const excelKm = excelKmTotal || (excelKmInicial != null && excelKmFinal != null && excelKmFinal > excelKmInicial ? excelKmFinal - excelKmInicial : null);
                const excelEstacionamento = estacionamentoCol >= 0 ? parseExcelValue(getCell(r, estacionamentoCol)) : null;
                const excelTotalFinal = totalFinalCol >= 0 && totalFinalCol !== revTotalCol ? parseExcelValue(getCell(r, totalFinalCol)) : null;

                const systemMission = missionFinancials.find(m => {
                    const sysId = String(m.id || '').toUpperCase().trim();
                    return sysId === osId || `GTM-${sysId}` === osId || sysId.replace('GTM-', '') === osId.replace('GTM-', '');
                });

                const sysRev = systemMission?.rev || 0;
                const sysCost = systemMission?.cost || 0;
                const sysDetails = extractSysMissionDetails(systemMission);

                const revDiff = excelRev > 0 ? Math.abs(sysRev - excelRev) : 0;
                const costDiff = excelCost > 0 ? Math.abs(sysCost - excelCost) : 0;
                const revMatch = excelRev > 0 ? revDiff <= 10 : true;
                const costMatch = excelCost > 0 ? costDiff <= 10 : true;

                comparisons.push({
                    osId,
                    found: !!systemMission,
                    excelRev, excelCost,
                    sysRev, sysCost,
                    revDiff, costDiff,
                    revMatch, costMatch,
                    status: systemMission?.status || 'Não encontrada',
                    client: systemMission?.client || clienteRaw || '-',
                    provider: systemMission?.provider || fornRaw || '-',
                    excelRota, excelOperacao, excelValorBase, excelHrFranq, excelKmFranq,
                    excelHrExtra, excelKmExtra, excelToll, excelDataInicial, excelHoraInicio,
                    excelDataFinal, excelHoraFim, excelKm, excelKmInicial, excelKmFinal,
                    excelEstacionamento, excelTotalFinal,
                    ...(sysDetails || {})
                });
            }

            comparisons.sort((a, b) => {
                if (!a.found && b.found) return -1;
                if (a.found && !b.found) return 1;
                if (!a.revMatch || !a.costMatch) return -1;
                if (!b.revMatch || !b.costMatch) return 1;
                return (b.revDiff + b.costDiff) - (a.revDiff + a.costDiff);
            });

            setExcelComparison(comparisons);
            setShowExcelPanel(true);

            const divergences = comparisons.filter(c => !c.found || !c.revMatch || !c.costMatch);
            if (divergences.length > 0) {
                setIsAiAnalyzing(true);
                try {
                    const summaryData = divergences.slice(0, 30).map(d => {
                        const entry: any = {
                            os: d.osId,
                            encontrada: d.found,
                            cliente: d.client,
                            fornecedor: d.provider || '-',
                            status: d.status,
                        };
                        if (d.excelRota || d.sysRota) {
                            entry.planilha_rota = d.excelRota || '-';
                            entry.sistema_rota = d.sysRota || '-';
                        }
                        if (d.excelOperacao || d.sysOperacao) {
                            entry.planilha_operacao = d.excelOperacao || '-';
                            entry.sistema_operacao = d.sysOperacao || '-';
                        }
                        entry.planilha_valor_base = d.excelValorBase;
                        entry.planilha_receita_total = d.excelRev;
                        entry.sistema_receita_total = d.sysRev;
                        entry.diff_receita = d.revDiff;
                        if (d.excelCost > 0 || d.sysCost > 0) {
                            entry.planilha_custo_total = d.excelCost;
                            entry.sistema_custo_total = d.sysCost;
                            entry.diff_custo = d.costDiff;
                        }
                        if (d.excelHrFranq != null) entry.planilha_hr_franquia = d.excelHrFranq;
                        if (d.excelKmFranq != null) entry.planilha_km_franquia = d.excelKmFranq;
                        if (d.excelHrExtra != null) entry.planilha_hr_extra = d.excelHrExtra;
                        if (d.excelKmExtra != null) entry.planilha_km_extra = d.excelKmExtra;
                        if (d.excelKm != null || d.sysKm != null) {
                            entry.planilha_km_total = d.excelKm;
                            entry.sistema_km_total = d.sysKm;
                            if (d.excelKm != null && d.sysKm != null) entry.diff_km = Math.abs(d.excelKm - d.sysKm);
                        }
                        if (d.excelKmInicial != null || d.sysStartKm != null) {
                            entry.planilha_km_inicial = d.excelKmInicial;
                            entry.sistema_km_inicial = d.sysStartKm;
                        }
                        if (d.excelKmFinal != null || d.sysEndKm != null) {
                            entry.planilha_km_final = d.excelKmFinal;
                            entry.sistema_km_final = d.sysEndKm;
                        }
                        if (d.excelDataInicial || d.sysDataInicial) {
                            entry.planilha_data_inicial = d.excelDataInicial || '-';
                            entry.sistema_data_inicial = d.sysDataInicial || '-';
                        }
                        if (d.excelHoraInicio || d.sysHoraInicio) {
                            entry.planilha_hora_inicio = d.excelHoraInicio || '-';
                            entry.sistema_hora_inicio = d.sysHoraInicio || '-';
                        }
                        if (d.excelDataFinal || d.sysDataFinal) {
                            entry.planilha_data_final = d.excelDataFinal || '-';
                            entry.sistema_data_final = d.sysDataFinal || '-';
                        }
                        if (d.excelHoraFim || d.sysHoraFim) {
                            entry.planilha_hora_fim = d.excelHoraFim || '-';
                            entry.sistema_hora_fim = d.sysHoraFim || '-';
                        }
                        if (d.excelToll != null || d.sysToll != null) {
                            entry.planilha_pedagio = d.excelToll;
                            entry.sistema_pedagio = d.sysToll;
                            if (d.excelToll != null && d.sysToll != null) entry.diff_pedagio = Math.abs(d.excelToll - d.sysToll);
                        }
                        if (d.excelEstacionamento != null) entry.planilha_estacionamento = d.excelEstacionamento;
                        if (d.excelTotalFinal != null) entry.planilha_total_final_faturar = d.excelTotalFinal;
                        return entry;
                    });

                    const res = await fetch('/api/gemini/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: `Você é auditor financeiro da TM SEG (empresa de escolta armada). Analise as divergências entre a planilha Excel do fornecedor/cliente e o sistema de gestão.\n\nA planilha segue este layout:\n- Nº (OS), ROTA, CLIENTE, FORNECEDOR, OPERAÇÃO (CTS/PADLOCK/etc), VALOR (base/acionamento)\n- HR FRANQ (horas franquia), KM FRANQ (km franquia), HR EXTRA, KM EXTRA\n- PEDÁGIO, DATA INICIAL, HORA INICIAL, DATA FINAL, HORA FINAL\n- KM INICIAL (odômetro), KM FINAL (odômetro), KM TOTAL\n- TOTAL FINAL (valor a faturar = base + extras + despesas)\n\nPara CADA OS divergente, faça análise DETALHADA campo a campo:\n\n1. **KM**: Compare KM Total da planilha vs sistema. Se diferente, o KM extra pode estar errado.\n2. **Horários**: Compare Hora Inicial e Hora Final. Se diferente, a hora extra pode estar errada.\n3. **Valor Base/Acionamento**: Se o valor base da planilha difere, pode ser tabela de preço errada.\n4. **KM Franquia vs KM Extra**: Se a franquia de KM da planilha difere da tabela do sistema, o cálculo de KM extra muda.\n5. **HR Franquia vs HR Extra**: Se a franquia de horas difere, o cálculo de hora extra muda.\n6. **Pedágio**: Valores diferentes impactam o total.\n7. **Total**: Compare receita/custo total.\n\nPara cada OS, diga EXATAMENTE:\n- Qual(is) campo(s) está(ão) divergente(s)\n- Valor na planilha vs valor no sistema\n- Ação corretiva recomendada (ex: "ajustar KM final de 45.230 para 45.180", "corrigir hora inicial de 08:30 para 09:15", "aplicar tabela de 200km ao invés de 300km", etc.)\n\nSeja DIRETO e OBJETIVO. Use português do Brasil. Valores em R$. Organize por OS.\n\nDivergências:\n${JSON.stringify(summaryData, null, 2)}\n\nResumo: ${comparisons.length} OS na planilha, ${divergences.length} com divergência, ${comparisons.filter(c => !c.found).length} não encontradas no sistema.`,
                            stream: false
                        })
                    });
                    const data = await res.json();
                    setExcelAiAnalysis(data.text || data.response || 'Análise indisponível');
                } catch { setExcelAiAnalysis('Erro ao gerar análise com IA'); }
                finally { setIsAiAnalyzing(false); }
            }
        } catch (err: any) {
            alert(`Erro ao processar planilha: ${err.message}`);
        } finally {
            setIsExcelLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [missionFinancials]);

    const handlePasteAnalysis = useCallback(async () => {
        if (!pastedText.trim()) return;
        setIsExcelLoading(true);
        setExcelComparison(null);
        setExcelAiAnalysis(null);
        setAdjustedOsIds(new Set());

        try {
            const lines = pastedText.trim().split('\n').map(l => l.split('\t'));
            if (lines.length < 2) throw new Error('Dados insuficientes. Cole ao menos cabeçalho + 1 linha.');

            const headers = lines[0].map(h => h.trim().toUpperCase());
            const findColExact = (...keywords: string[]) => headers.findIndex(h => keywords.some(k => h === k));
            const findColContains = (...keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

            const osCol = findColExact('Nº', 'N°', 'NR', 'OS', 'NUM', 'NÚMERO', 'NUMERO', 'N', 'COD', 'CODIGO', 'CÓDIGO');
            const clienteCol = findColExact('CLIENTE');
            const fornecedorCol = findColExact('FORNECEDOR');
            const rotaCol = findColExact('ROTA');
            const operacaoCol = findColExact('OPERAÇÃO', 'OPERACAO');
            const valorBaseCol = findColExact('VALOR BASE', 'VALOR');
            const hrFranqCol = findColContains('HR FRANQ', 'HORA FRANQUIA', 'HORAS FRANQUIA');
            const kmFranqCol = findColContains('KM FRANQ', 'KM FRANQUIA');
            const hrExtraCol = findColContains('HR EXTRA', 'HORA EXTRA', 'HORAS EXTRA', 'HORAS EXTRAS');
            const kmExtraCol = findColContains('KM EXTRA', 'KM EXCEDENTE');
            const pedagioCol = findColContains('PEDÁGIO', 'PEDAGIO');
            const dataInicialCol = findColContains('DATA INICIAL', 'DATA INÍCIO', 'DATA INICIO', 'DT INICIAL');
            const horaInicioCol = findColContains('HORA INICIAL', 'HORA INÍCIO', 'HORA INICIO', 'HR INÍCIO', 'HR INICIO', 'H. INÍCIO', 'H. INICIO');
            const dataFinalCol = findColContains('DATA FINAL', 'DATA FIM', 'DT FINAL', 'DT FIM');
            const horaFimCol = findColContains('HORA FINAL', 'HORA FIM', 'HR FIM', 'HR FINAL', 'H. FIM', 'H. FINAL');
            const kmInicialCol = findColExact('KM INICIAL', 'INICIAL');
            const kmFinalCol = findColExact('KM FINAL', 'FINAL');
            const kmTotalCol = findColContains('KM TOTAL');
            const estacionamentoCol = findColExact('ESTACIONAMENTO', 'PERNOITE');

            let revTotalCol = findColContains('VALOR TOTAL', 'TOTAL CLIENTE', 'RECEITA TOTAL', 'FATURAMENTO');
            if (revTotalCol === -1) revTotalCol = findColExact('TOTAL');
            let costTotalCol = findColContains('TOTAL CUSTO', 'CUSTO TOTAL', 'TOTAL FORNECEDOR', 'PAGAMENTO');
            if (costTotalCol === -1) {
                const lastTotal = headers.lastIndexOf('TOTAL');
                if (lastTotal >= 0 && lastTotal !== revTotalCol) costTotalCol = lastTotal;
            }

            const parseVal = (v: string): number => {
                if (!v || v.trim() === '' || v === '-') return 0;
                const cleaned = v.replace(/[R$\s.]/g, '').replace(',', '.');
                return parseFloat(cleaned) || 0;
            };

            const comparisons: any[] = [];
            const rawPastedRows: any[] = [];

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (row.length < 2) continue;

                const osRaw = osCol >= 0 ? row[osCol]?.trim() : row[0]?.trim();
                if (!osRaw || !osRaw.match(/\d{3,}/)) continue;

                const osId = extractOsNumber(osRaw);
                if (!osId) continue;

                const getCellStr = (col: number) => col >= 0 && col < row.length ? row[col]?.trim() || '' : '';
                const getCellNum = (col: number) => col >= 0 && col < row.length ? parseVal(row[col] || '') : 0;

                const excelRev = revTotalCol >= 0 ? getCellNum(revTotalCol) : 0;
                const excelCost = costTotalCol >= 0 ? getCellNum(costTotalCol) : 0;
                const excelValorBase = valorBaseCol >= 0 ? getCellNum(valorBaseCol) : null;
                const excelHrFranq = hrFranqCol >= 0 ? getCellNum(hrFranqCol) : null;
                const excelKmFranq = kmFranqCol >= 0 ? getCellNum(kmFranqCol) : null;
                const excelHrExtra = hrExtraCol >= 0 ? getCellNum(hrExtraCol) : null;
                const excelKmExtra = kmExtraCol >= 0 ? getCellNum(kmExtraCol) : null;
                const excelToll = pedagioCol >= 0 ? getCellNum(pedagioCol) : null;
                const excelKmInicial = kmInicialCol >= 0 ? getCellNum(kmInicialCol) : null;
                const excelKmFinal = kmFinalCol >= 0 ? getCellNum(kmFinalCol) : null;
                const excelKmTotalVal = kmTotalCol >= 0 ? getCellNum(kmTotalCol) : null;
                const excelKm = excelKmTotalVal || (excelKmInicial != null && excelKmFinal != null && excelKmFinal > excelKmInicial ? excelKmFinal - excelKmInicial : null);
                const excelEstacionamento = estacionamentoCol >= 0 ? getCellNum(estacionamentoCol) : null;
                const excelRota = getCellStr(rotaCol);
                const excelOperacao = getCellStr(operacaoCol);
                const excelDataInicial = getCellStr(dataInicialCol);
                const excelHoraInicio = getCellStr(horaInicioCol);
                const excelDataFinal = getCellStr(dataFinalCol);
                const excelHoraFim = getCellStr(horaFimCol);
                const clienteRaw = getCellStr(clienteCol);
                const fornRaw = getCellStr(fornecedorCol);

                const systemMission = missionFinancials.find(m => {
                    const sysId = String(m.id || '').toUpperCase().trim();
                    return sysId === osId || `GTM-${sysId}` === osId || sysId.replace('GTM-', '') === osId.replace('GTM-', '');
                });

                const sysRev = systemMission?.rev || 0;
                const sysCost = systemMission?.cost || 0;
                const sysDetails = extractSysMissionDetails(systemMission);

                const revDiff = excelRev > 0 ? Math.abs(sysRev - excelRev) : 0;
                const costDiff = excelCost > 0 ? Math.abs(sysCost - excelCost) : 0;
                const revMatch = excelRev > 0 ? revDiff <= 10 : true;
                const costMatch = excelCost > 0 ? costDiff <= 10 : true;

                const comp = {
                    osId, found: !!systemMission, excelRev, excelCost, sysRev, sysCost,
                    revDiff, costDiff, revMatch, costMatch,
                    status: systemMission?.status || 'Não encontrada',
                    client: systemMission?.client || clienteRaw || '-',
                    provider: systemMission?.provider || fornRaw || '-',
                    excelRota, excelOperacao, excelValorBase, excelHrFranq, excelKmFranq,
                    excelHrExtra, excelKmExtra, excelToll, excelDataInicial, excelHoraInicio,
                    excelDataFinal, excelHoraFim, excelKm, excelKmInicial, excelKmFinal,
                    excelEstacionamento,
                    ...(sysDetails || {})
                };
                comparisons.push(comp);
                rawPastedRows.push({ linha: i, colunas: row.map((c: string, idx: number) => `${headers[idx] || `Col${idx}`}: ${c}`).join(' | ') });
            }

            comparisons.sort((a, b) => {
                if (!a.found && b.found) return -1;
                if (a.found && !b.found) return 1;
                if (!a.revMatch || !a.costMatch) return -1;
                if (!b.revMatch || !b.costMatch) return 1;
                return (b.revDiff + b.costDiff) - (a.revDiff + a.costDiff);
            });

            setExcelComparison(comparisons);
            setShowExcelPanel(true);
            setShowPasteArea(false);

            setIsAiAnalyzing(true);
            setIsExcelLoading(false);

            try {
                const analysisData = comparisons.slice(0, 40).map(d => {
                    const entry: any = {
                        os: d.osId,
                        encontrada_no_sistema: d.found,
                        cliente: d.client,
                        fornecedor: d.provider || '-',
                        status_os: d.status,
                    };
                    if (d.excelRota || d.sysRota) { entry.planilha_rota = d.excelRota || '-'; entry.sistema_rota = d.sysRota || '-'; }
                    if (d.excelOperacao || d.sysOperacao) { entry.planilha_operacao = d.excelOperacao || '-'; entry.sistema_operacao = d.sysOperacao || '-'; }
                    entry.planilha_valor_base = d.excelValorBase;
                    entry.planilha_receita_total = d.excelRev;
                    entry.sistema_receita_total = d.sysRev;
                    entry.diff_receita = d.revDiff;
                    if (d.excelCost > 0 || d.sysCost > 0) { entry.planilha_custo_total = d.excelCost; entry.sistema_custo_total = d.sysCost; entry.diff_custo = d.costDiff; }
                    if (d.excelHrFranq != null) entry.planilha_hr_franquia = d.excelHrFranq;
                    if (d.excelKmFranq != null) entry.planilha_km_franquia = d.excelKmFranq;
                    if (d.excelHrExtra != null) entry.planilha_hr_extra = d.excelHrExtra;
                    if (d.excelKmExtra != null) entry.planilha_km_extra = d.excelKmExtra;
                    if (d.excelKm != null || d.sysKm != null) { entry.planilha_km_total = d.excelKm; entry.sistema_km_total = d.sysKm; }
                    if (d.excelKmInicial != null || d.sysStartKm != null) { entry.planilha_km_inicial = d.excelKmInicial; entry.sistema_km_inicial = d.sysStartKm; }
                    if (d.excelKmFinal != null || d.sysEndKm != null) { entry.planilha_km_final = d.excelKmFinal; entry.sistema_km_final = d.sysEndKm; }
                    if (d.excelDataInicial || d.sysDataInicial) { entry.planilha_data_inicial = d.excelDataInicial || '-'; entry.sistema_data_inicial = d.sysDataInicial || '-'; }
                    if (d.excelHoraInicio || d.sysHoraInicio) { entry.planilha_hora_inicio = d.excelHoraInicio || '-'; entry.sistema_hora_inicio = d.sysHoraInicio || '-'; }
                    if (d.excelDataFinal || d.sysDataFinal) { entry.planilha_data_final = d.excelDataFinal || '-'; entry.sistema_data_final = d.sysDataFinal || '-'; }
                    if (d.excelHoraFim || d.sysHoraFim) { entry.planilha_hora_fim = d.excelHoraFim || '-'; entry.sistema_hora_fim = d.sysHoraFim || '-'; }
                    if (d.excelToll != null || d.sysToll != null) { entry.planilha_pedagio = d.excelToll; entry.sistema_pedagio = d.sysToll; }
                    if (d.excelEstacionamento != null) entry.planilha_estacionamento = d.excelEstacionamento;
                    entry.receita_confere = d.revMatch ? 'SIM' : 'NÃO';
                    entry.custo_confere = d.costMatch ? 'SIM' : 'NÃO';
                    return entry;
                });

                const divergences = comparisons.filter(c => !c.found || !c.revMatch || !c.costMatch);
                const matched = comparisons.filter(c => c.found && c.revMatch && c.costMatch);

                const res = await fetch('/api/gemini/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: `Você é auditor financeiro da TM SEG (empresa de escolta armada). O usuário colou dados de uma planilha e precisa que você analise LINHA POR LINHA comparando com o sistema de gestão.\n\n## DADOS COMPARADOS (Planilha vs Sistema)\n${JSON.stringify(analysisData, null, 2)}\n\n## RESUMO RÁPIDO\n- Total de OS na planilha: ${comparisons.length}\n- OS conferidas (valores batem): ${matched.length}\n- OS com divergência: ${divergences.filter(d => d.found).length}\n- OS não encontradas no sistema: ${divergences.filter(d => !d.found).length}\n\n## INSTRUÇÕES\nPara CADA OS da planilha, diga se CONFERE ou se há DIVERGÊNCIA.\n\nPara cada OS DIVERGENTE, analise campo a campo:\n1. **Receita**: Planilha vs Sistema — se diferente, investigue valor base, KM extra, hora extra\n2. **KM**: Compare KM Total. Se diferente, verifique KM inicial/final e KM extra\n3. **Horários**: Compare hora início e fim. Se diferente, pode impactar hora extra\n4. **Pedágio**: Valores diferentes?\n5. **Custo**: Se informado, compare custo total\n\nPara cada divergência, recomende ação corretiva ESPECÍFICA.\n\nSeja DIRETO e OBJETIVO. Use português do Brasil. Valores em R$. Organize por OS.\nAo final, dê um resumo executivo com o impacto financeiro total das divergências.`,
                        stream: false
                    })
                });
                const data = await res.json();
                setExcelAiAnalysis(data.text || data.response || 'Análise indisponível');
            } catch { setExcelAiAnalysis('Erro ao gerar análise com IA'); }
            finally { setIsAiAnalyzing(false); }
        } catch (err: any) {
            alert(`Erro ao processar dados colados: ${err.message}`);
            setIsExcelLoading(false);
        }
    }, [pastedText, missionFinancials]);

    const totals = useMemo(() => {
        const valid = missionFinancials.filter(m => m.status !== MissionStatus.REFUSED);
        const totalRev = valid.reduce((a, m) => a + m.rev, 0);
        const totalCost = valid.reduce((a, m) => a + m.cost, 0);
        const totalProfit = totalRev - totalCost;
        const margin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
        const completed = valid.filter(m => m.status === MissionStatus.COMPLETED).length;
        const inTransit = valid.filter(m => m.status === MissionStatus.IN_TRANSIT).length;
        const cancelled = valid.filter(m => m.status === MissionStatus.CANCELLED).length;
        const total = valid.length;
        const avgTicket = total > 0 ? totalRev / total : 0;
        const pendingAudit = valid.filter(m => !m.billing_approved && m.status === MissionStatus.COMPLETED).length;
        return { totalRev, totalCost, totalProfit, margin, completed, inTransit, cancelled, total, avgTicket, pendingAudit };
    }, [missionFinancials]);

    const anomalies = useMemo(() => {
        const MARGIN_ALERT_LOW = -10;
        const MARGIN_ALERT_HIGH = 85;

        return missionFinancials
            .filter(m => m.status !== MissionStatus.REFUSED && !m.billing_approved)
            .map(m => {
                const issues: string[] = [];

                const startT = m.startTime || m.start_time;
                const endT = m.endTime || m.end_time;
                let opHours = 0;
                if (startT && endT) {
                    opHours = (new Date(endT).getTime() - new Date(startT).getTime()) / 3600000;
                }
                const hasKm = ((m.startKm || (m as any).start_km) > 0 && (m.endKm || (m as any).end_km) > 0);
                const km = hasKm ? ((m.endKm || (m as any).end_km) - (m.startKm || (m as any).start_km)) : 0;

                const expectedMaxRev = Math.max(3000, (opHours > 0 ? opHours * 250 : 0) + (km > 0 ? km * 15 : 0));
                const expectedMaxCost = Math.max(2000, (opHours > 0 ? opHours * 180 : 0) + (km > 0 ? km * 10 : 0));

                if (m.rev > expectedMaxRev && m.rev > 8000) issues.push(`Receita alta: ${fmtBRL(m.rev)}`);
                if (m.cost > expectedMaxCost && m.cost > 6000) issues.push(`Custo alto: ${fmtBRL(m.cost)}`);

                if (m.rev > 0 && m.cost > 0 && !m.is_same_os) {
                    const mg = ((m.rev - m.cost) / m.rev) * 100;
                    if (mg < MARGIN_ALERT_LOW) issues.push(`Margem negativa: ${mg.toFixed(1)}%`);
                    if (mg > MARGIN_ALERT_HIGH) issues.push(`Margem suspeita: ${mg.toFixed(1)}%`);
                }
                if (m.rev === 0 && m.status === MissionStatus.COMPLETED && !m.billing_approved) issues.push('Concluída sem valor');
                if (m.rev > 0 && m.cost === 0 && m.status === MissionStatus.COMPLETED && !m.is_same_os) issues.push('Sem custo registrado');

                if (km > 2000) issues.push(`KM suspeito: ${km.toLocaleString('pt-BR')} km`);
                if (km < 0) issues.push(`KM negativo: ${km} km`);

                return issues.length > 0 ? { id: m.id, client: m.client, status: m.status, rev: m.rev, cost: m.cost, issues } : null;
            })
            .filter(Boolean) as { id: string; client: string; status: string; rev: number; cost: number; issues: string[] }[];
    }, [missionFinancials]);

    const dailyData = useMemo(() => {
        const [start, end] = getDateRange(period, customStart, customEnd);
        const days: Record<string, { day: string, missoes: number, faturamento: number, custo: number, lucro: number }> = {};
        const current = new Date(start);
        while (current <= end) {
            const key = `${current.getDate().toString().padStart(2, '0')}/${(current.getMonth() + 1).toString().padStart(2, '0')}`;
            days[key] = { day: key, missoes: 0, faturamento: 0, custo: 0, lucro: 0 };
            current.setDate(current.getDate() + 1);
        }
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            const date = new Date(m.startTime || m.createdAt);
            const key = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            if (days[key]) { days[key].missoes++; days[key].faturamento += m.rev; days[key].custo += m.cost; days[key].lucro += m.profit; }
        });
        return Object.values(days);
    }, [missionFinancials, period, customStart, customEnd]);

    const cumulativeRevenue = useMemo(() => {
        let acc = 0;
        return dailyData.map(d => { acc += d.faturamento; return { day: d.day, acumulado: acc }; });
    }, [dailyData]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMissions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
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
        return Object.entries(counts).map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#94a3b8' })).sort((a, b) => b.value - a.value);
    }, [filteredMissions]);

    const topClientsByVolume = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMissions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => { counts[m.client] = (counts[m.client] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
            .map(([name, missoes]) => ({ name: name.length > 22 ? name.substring(0, 22) + '...' : name, missoes }));
    }, [filteredMissions]);

    const topClientsByRevenue = useMemo(() => {
        const revs: Record<string, number> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => { revs[m.client] = (revs[m.client] || 0) + m.rev; });
        return Object.entries(revs).sort((a, b) => b[1] - a[1]).slice(0, 7)
            .map(([name, faturamento]) => ({ name: name.length > 22 ? name.substring(0, 22) + '...' : name, faturamento: Math.round(faturamento * 100) / 100 }));
    }, [missionFinancials]);

    const typeData = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMissions.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => { counts[m.mission_type || 'Caracterizada'] = (counts[m.mission_type || 'Caracterizada'] || 0) + 1; });
        return Object.entries(counts).map(([name, value], i) => ({ name, value, color: i === 0 ? '#dc2626' : i === 1 ? '#0f172a' : '#6366f1' }));
    }, [filteredMissions]);

    const providerCosts = useMemo(() => {
        const costs: Record<string, { custo: number, qtd: number }> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED && m.provider).forEach(m => {
            if (!costs[m.provider]) costs[m.provider] = { custo: 0, qtd: 0 };
            costs[m.provider].custo += m.cost; costs[m.provider].qtd++;
        });
        return Object.entries(costs).sort((a, b) => b[1].custo - a[1].custo).slice(0, 7)
            .map(([name, data]) => ({ name: name.length > 22 ? name.substring(0, 22) + '...' : name, custo: Math.round(data.custo * 100) / 100, missoes: data.qtd }));
    }, [missionFinancials]);

    const clientMargins = useMemo(() => {
        const data: Record<string, { rev: number, cost: number }> = {};
        missionFinancials.filter(m => m.status !== MissionStatus.REFUSED).forEach(m => {
            if (!data[m.client]) data[m.client] = { rev: 0, cost: 0 };
            data[m.client].rev += m.rev; data[m.client].cost += m.cost;
        });
        return Object.entries(data).filter(([_, d]) => d.rev > 0)
            .map(([name, d]) => ({ name: name.length > 22 ? name.substring(0, 22) + '...' : name, margem: parseFloat(((d.rev - d.cost) / d.rev * 100).toFixed(1)) }))
            .sort((a, b) => b.margem - a.margem).slice(0, 7);
    }, [missionFinancials]);

    const efficiencyData = useMemo(() => {
        const completed = filteredMissions.filter(m => m.status === MissionStatus.COMPLETED).length;
        const cancelled = filteredMissions.filter(m => m.status === MissionStatus.CANCELLED).length;
        const refused = filteredMissions.filter(m => m.status === MissionStatus.REFUSED).length;
        const active = filteredMissions.filter(m => ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length;
        return [
            { name: 'Concluídas', value: completed, color: '#059669' },
            { name: 'Canceladas', value: cancelled, color: '#d97706' },
            { name: 'Recusadas', value: refused, color: '#dc2626' },
            { name: 'Em Andamento', value: active, color: '#2563eb' }
        ].filter(d => d.value > 0);
    }, [filteredMissions]);

    const KpiCard = ({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) => (
        <div className={`p-5 rounded-xl border shadow-sm group ${color}`} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
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
                <div className="p-2 bg-gray-900 text-white rounded-lg"><Icon size={14} /></div>
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">{title}</h4>
            </div>
            <div className="w-full" style={{ minHeight: 240 }}>{children}</div>
        </div>
    );

    const periodLabel = period === 'CUSTOM' && customStart && customEnd
        ? `${new Date(customStart + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(customEnd + 'T00:00:00').toLocaleDateString('pt-BR')}`
        : PERIOD_LABELS[period];

    const renderPieLabel = ({ name, value, percent, cx, x }: any) => {
        const isLeft = x < cx;
        return (
            <text x={x} y={0} dominantBaseline="central" textAnchor={isLeft ? 'end' : 'start'} style={{ fontSize: 11, fontWeight: 800, fill: '#334155' }}>
                {`${name} ${value} (${(percent * 100).toFixed(0)}%)`}
            </text>
        );
    };

    return (
        <div className="space-y-5">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-900 text-white rounded-lg"><Activity size={16} /></div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Dashboard Executivo</h3>
                        <p className="text-[11px] font-bold text-gray-400">{periodLabel} &middot; Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-gray-100 rounded-lg border border-gray-200 p-0.5">
                        {(Object.keys(PERIOD_LABELS) as DashPeriod[]).map(p => (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={`px-3 py-2 rounded-md text-[11px] font-black uppercase tracking-wide transition-all ${period === p ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                data-testid={`filter-${p.toLowerCase()}`}
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
                    <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-gray-800 transition-all active:scale-95" data-testid="button-refresh-dashboard">
                        <RefreshCw size={13} /> Atualizar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total Missões" value={totals.total.toString()} icon={Activity} color="bg-gray-900 text-white" sub={`${totals.completed} concluídas`} />
                <KpiCard label="Em Trânsito" value={totals.inTransit.toString()} icon={Truck} color="bg-white text-gray-900 border-gray-200" sub="Em operação agora" />
                <KpiCard label="Canceladas" value={totals.cancelled.toString()} icon={XCircle} color="bg-white text-gray-900 border-gray-200" sub="Incluídas no faturamento" />
                <KpiCard label="Eficiência" value={`${totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0}%`} icon={Target} color="bg-white text-gray-900 border-gray-200" sub={`${totals.pendingAudit} sem auditoria`} />
            </div>

            {isDirector && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard label="Faturamento" value={fmtBRL(totals.totalRev)} icon={TrendingUp} color="bg-emerald-50 text-emerald-800 border-emerald-200" />
                    <KpiCard label="Custo" value={fmtBRL(totals.totalCost)} icon={TrendingDown} color="bg-red-50 text-red-800 border-red-200" />
                    <KpiCard label="Lucro" value={fmtBRL(totals.totalProfit)} icon={Wallet} color={`${totals.totalProfit >= 0 ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-red-50 text-red-800 border-red-200'}`} />
                    <KpiCard label="Margem" value={`${totals.margin.toFixed(1)}%`} icon={Percent} color="bg-slate-900 text-white border-slate-800" sub={`Ticket: ${fmtBRL(totals.avgTicket)}`} />
                </div>
            )}

            {anomalies.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-sm" data-testid="anomaly-alerts-panel">
                    <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-amber-200">
                        <div className="p-2 bg-amber-500 text-white rounded-lg"><AlertTriangle size={14} /></div>
                        <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest">Alertas de OS ({anomalies.length})</h4>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                        {anomalies.slice(0, 20).map((a, i) => (
                            <div key={i} className="flex items-start gap-3 bg-white border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-50 transition-colors cursor-pointer" data-testid={`anomaly-row-${a.id}`}
                                onClick={() => {
                                    if (onOpenMission) {
                                        const mission = filteredMissions.find(m => String(m.id) === String(a.id));
                                        if (mission) onOpenMission(mission as Mission);
                                    }
                                }}
                            >
                                <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-black text-blue-600 underline decoration-blue-300 hover:text-blue-800">OS {a.id}</span>
                                        <span className="text-[10px] font-bold text-gray-400">{(a.client || '').substring(0, 25)}</span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${a.status === MissionStatus.COMPLETED ? 'bg-green-100 text-green-700' : a.status === MissionStatus.IN_TRANSIT ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {a.issues.map((issue, j) => (
                                            <span key={j} className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{issue}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-[10px] font-bold text-gray-500">Receita: <span className="text-gray-900">{fmtBRL(a.rev)}</span></p>
                                    <p className="text-[10px] font-bold text-gray-500">Custo: <span className="text-gray-900">{fmtBRL(a.cost)}</span></p>
                                </div>
                            </div>
                        ))}
                        {anomalies.length > 20 && (
                            <p className="text-[11px] font-bold text-amber-600 text-center pt-1">+{anomalies.length - 20} alertas adicionais</p>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-blue-600 text-white rounded-lg"><FileSpreadsheet size={14} /></div>
                        <div>
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Comparativo Planilha vs Sistema</h4>
                            <p className="text-[10px] text-gray-400 font-bold">Cole os dados da planilha e a IA analisa linha por linha</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {excelComparison && (
                            <>
                            <button onClick={handleRefreshExcelComparison} disabled={isRefreshingExcel}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-100 transition-all disabled:opacity-50" data-testid="button-refresh-excel">
                                <RefreshCw size={11} className={isRefreshingExcel ? 'animate-spin' : ''} /> {isRefreshingExcel ? 'Atualizando...' : 'Atualizar'}
                            </button>
                            <button onClick={() => { setExcelComparison(null); setExcelAiAnalysis(null); setShowExcelPanel(false); setAdjustedOsIds(new Set()); setPastedText(''); }}
                                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-black uppercase hover:bg-gray-200 transition-all" data-testid="button-clear-excel">
                                Limpar
                            </button>
                            </>
                        )}
                        <button onClick={() => setShowPasteArea(!showPasteArea)} disabled={isExcelLoading || isAiAnalyzing}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50" data-testid="button-paste-spreadsheet">
                            {isExcelLoading ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                            {isExcelLoading ? 'Processando...' : showPasteArea ? 'Fechar' : 'Colar Planilha'}
                        </button>
                        <button onClick={() => handleBatchRecalculate(true)} disabled={isRecalculating}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-50" data-testid="button-batch-recalculate">
                            {isRecalculating ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}
                            {isRecalculating ? 'Analisando...' : 'Auditar Todas OS'}
                        </button>
                    </div>
                </div>

                {showPasteArea && (
                    <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-3" data-testid="paste-area-container">
                        <div className="flex items-center gap-2 mb-1">
                            <FileSpreadsheet size={14} className="text-blue-600" />
                            <p className="text-[11px] font-black text-blue-800 uppercase tracking-wide">Cole os dados da planilha abaixo</p>
                        </div>
                        <p className="text-[10px] text-blue-600 font-bold">Selecione as linhas na planilha Excel (incluindo o cabeçalho), copie (Ctrl+C) e cole aqui (Ctrl+V). A IA vai analisar cada OS comparando com o sistema.</p>
                        <textarea
                            value={pastedText}
                            onChange={e => setPastedText(e.target.value)}
                            placeholder={"Nº\tROTA\tCLIENTE\tFORNECEDOR\tVALOR TOTAL\tCUSTO\n3800\tSP → RJ\tCEVA\tMACOR\t2.500,00\t1.800,00\n3801\tRJ → MG\tRACER\tNOVA ERA\t1.900,00\t1.200,00"}
                            className="w-full h-40 bg-white border border-blue-200 rounded-lg p-3 text-[11px] font-mono text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y"
                            data-testid="textarea-paste-spreadsheet"
                        />
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] text-gray-400 font-bold">
                                {pastedText.trim() ? `${pastedText.trim().split('\n').length - 1} linhas de dados detectadas` : 'Aguardando dados...'}
                            </p>
                            <button
                                onClick={handlePasteAnalysis}
                                disabled={!pastedText.trim() || isExcelLoading || isAiAnalyzing}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                                data-testid="button-analyze-pasted"
                            >
                                {isAiAnalyzing ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                                {isAiAnalyzing ? 'IA Analisando...' : 'Analisar com IA'}
                            </button>
                        </div>
                    </div>
                )}

                {recalcResults && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black text-gray-800 uppercase tracking-wide">
                                {recalcResults.dryRun ? 'Auditoria Geral — Simulação' : 'Auditoria Geral — Correção Aplicada'}
                            </h4>
                            <button onClick={() => setRecalcResults(null)} className="text-gray-400 hover:text-gray-600">
                                <XCircle size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Total OS</p>
                                <p className="text-lg font-black text-gray-900">{recalcResults.total}</p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-2.5 text-center border border-red-100">
                                <p className="text-[10px] font-bold text-red-600 uppercase">Divergentes</p>
                                <p className="text-lg font-black text-red-700">{recalcResults.divergent}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2.5 text-center border border-green-100">
                                <p className="text-[10px] font-bold text-green-600 uppercase">Corretas</p>
                                <p className="text-lg font-black text-green-700">{recalcResults.skipped}</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-2.5 text-center border border-amber-100">
                                <p className="text-[10px] font-bold text-amber-600 uppercase">Erros</p>
                                <p className="text-lg font-black text-amber-700">{recalcResults.errors}</p>
                            </div>
                        </div>

                        {recalcResults.results?.length > 0 && (
                            <>
                                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg scrollbar-thin">
                                    <table className="w-full text-[11px]">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-black text-gray-600 uppercase">OS</th>
                                                <th className="text-left px-3 py-2 font-black text-gray-600 uppercase">Cliente</th>
                                                <th className="text-left px-3 py-2 font-black text-gray-600 uppercase">Fornecedor</th>
                                                <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Receita Salva</th>
                                                <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Receita Calc.</th>
                                                <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Diff. Rec.</th>
                                                <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Custo Salvo</th>
                                                <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Custo Calc.</th>
                                                <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Diff. Cst.</th>
                                                <th className="text-center px-3 py-2 font-black text-gray-600 uppercase">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recalcResults.results.map((r: any, i: number) => (
                                                <tr key={i} className="border-t border-gray-100 hover:bg-red-50/30"
                                                    onClick={() => {
                                                        if (onOpenMission) {
                                                            const mission = missions.find(m => String(m.id).toUpperCase().replace('GTM-', '') === String(r.osId).replace('GTM-', ''));
                                                            if (mission) onOpenMission(mission as any);
                                                        }
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <td className="px-3 py-2 font-black text-blue-600">{r.osId}</td>
                                                    <td className="px-3 py-2 font-bold text-gray-600 truncate max-w-[100px]">{(r.client || '').substring(0, 18)}</td>
                                                    <td className="px-3 py-2 font-bold text-gray-600 truncate max-w-[100px]">{(r.provider || '').substring(0, 18)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-gray-700">{fmtBRL(r.storedRev)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-green-700">{fmtBRL(r.calcRev)}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${r.revDiff > 10 ? 'text-red-600' : 'text-amber-600'}`}>{fmtBRL(r.revDiff)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-gray-700">{fmtBRL(r.storedCost)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-green-700">{fmtBRL(r.calcCost)}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${r.costDiff > 10 ? 'text-red-600' : 'text-amber-600'}`}>{fmtBRL(r.costDiff)}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        {r.error ? <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{r.error}</span> :
                                                         r.updated ? <span className="text-[9px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded-full">CORRIGIDA</span> :
                                                         r.approved ? <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">APROVADA</span> :
                                                         <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full">DIVERGENTE</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-gray-400 font-bold">
                                        {recalcResults.dryRun ? 'Simulação: nenhum valor foi alterado. Clique "Aplicar Correções" para corrigir.' : `${recalcResults.corrected} OS corrigidas no banco de dados.`}
                                    </p>
                                    <div className="flex gap-2">
                                        <button onClick={() => {
                                            const mapRow = (r: any) => ({
                                                'OS': r.osId, 'Cliente': r.client, 'Fornecedor': r.provider,
                                                'Receita Salva': r.storedRev, 'Receita Calculada': r.calcRev, 'Diff. Receita': r.revDiff,
                                                'Custo Salvo': r.storedCost, 'Custo Calculado': r.calcCost, 'Diff. Custo': r.costDiff,
                                                'Status OS': r.status, 'Aprovada': r.approved ? 'Sim' : 'Não',
                                            });
                                            const wb = XLSX.utils.book_new();
                                            const ws = XLSX.utils.json_to_sheet(recalcResults.results.map(mapRow));
                                            XLSX.utils.book_append_sheet(wb, ws, 'Divergências');
                                            XLSX.writeFile(wb, `Auditoria_Geral_${new Date().toISOString().slice(0,10)}.xlsx`);
                                        }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors"
                                            data-testid="btn-export-audit"
                                        >
                                            <Download size={12} /> Exportar
                                        </button>
                                        {recalcResults.dryRun && recalcResults.divergent > 0 && (
                                            <button onClick={() => {
                                                if (confirm(`Tem certeza? Isso vai corrigir ${recalcResults.divergent} OS no banco de dados.`)) {
                                                    handleBatchRecalculate(false);
                                                }
                                            }}
                                                disabled={isRecalculating}
                                                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                                                data-testid="btn-apply-corrections"
                                            >
                                                {isRecalculating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                                Aplicar Correções ({recalcResults.divergent} OS)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {recalcResults.results?.length === 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                <CheckCircle className="mx-auto text-green-600 mb-2" size={24} />
                                <p className="text-sm font-black text-green-700">Todas as OS estão com valores corretos!</p>
                                <p className="text-[10px] text-green-500 mt-1">Nenhuma divergência encontrada (tolerância: R$ 10,00)</p>
                            </div>
                        )}
                    </div>
                )}

                {showExcelPanel && excelComparison && (() => {
                    const total = excelComparison.length;
                    const adjusted = excelComparison.filter(c => c.found && adjustedOsIds.has(c.osId)).length;
                    const matched = excelComparison.filter(c => c.found && c.revMatch && c.costMatch && !adjustedOsIds.has(c.osId)).length;
                    const divergent = excelComparison.filter(c => c.found && (!c.revMatch || !c.costMatch) && !adjustedOsIds.has(c.osId)).length;
                    const notFound = excelComparison.filter(c => !c.found).length;

                    return (
                        <div className="space-y-3">
                            <div className={`grid ${adjusted > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
                                <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Total OS</p>
                                    <p className="text-lg font-black text-gray-900">{total}</p>
                                </div>
                                <div className="bg-green-50 rounded-lg p-2.5 text-center border border-green-100">
                                    <p className="text-[10px] font-bold text-green-600 uppercase">Conferidos</p>
                                    <p className="text-lg font-black text-green-700">{matched}</p>
                                </div>
                                <div className="bg-red-50 rounded-lg p-2.5 text-center border border-red-100">
                                    <p className="text-[10px] font-bold text-red-600 uppercase">Divergentes</p>
                                    <p className="text-lg font-black text-red-700">{divergent}</p>
                                </div>
                                {adjusted > 0 && (
                                    <div className="bg-blue-50 rounded-lg p-2.5 text-center border border-blue-100">
                                        <p className="text-[10px] font-bold text-blue-600 uppercase">Ajustados</p>
                                        <p className="text-lg font-black text-blue-700">{adjusted}</p>
                                    </div>
                                )}
                                <div className="bg-amber-50 rounded-lg p-2.5 text-center border border-amber-100">
                                    <p className="text-[10px] font-bold text-amber-600 uppercase">Não Encontradas</p>
                                    <p className="text-lg font-black text-amber-700">{notFound}</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[11px] font-black text-slate-700 uppercase">{divergent > 0 ? 'Resumo das Divergências' : 'Resumo da Comparação'}</p>
                                    <button
                                        data-testid="btn-export-divergence-report"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const conferidos = excelComparison.filter(c => c.found && c.revMatch && c.costMatch);
                                            const divergentes = excelComparison.filter(c => c.found && (!c.revMatch || !c.costMatch));
                                            const naoEncontradas = excelComparison.filter(c => !c.found);
                                            const mapRow = (c: any, status: string) => ({
                                                'OS': c.osId,
                                                'Cliente': c.client || '-',
                                                'Status': status,
                                                'Planilha Receita': c.excelRev || 0,
                                                'Sistema Receita': c.sysRev || 0,
                                                'Diff. Receita': c.revDiff || 0,
                                                'Planilha Custo': c.excelCost || 0,
                                                'Sistema Custo': c.sysCost || 0,
                                                'Diff. Custo': c.costDiff || 0,
                                            });
                                            const wb = XLSX.utils.book_new();
                                            const wsConf = XLSX.utils.json_to_sheet(conferidos.map(c => mapRow(c, 'CONFERIDO')));
                                            XLSX.utils.book_append_sheet(wb, wsConf, `Conferidos (${conferidos.length})`);
                                            if (divergentes.length > 0) {
                                                const wsDiv = XLSX.utils.json_to_sheet(divergentes.map(c => mapRow(c, 'DIVERGENTE')));
                                                XLSX.utils.book_append_sheet(wb, wsDiv, `Divergentes (${divergentes.length})`);
                                            }
                                            if (naoEncontradas.length > 0) {
                                                const wsNE = XLSX.utils.json_to_sheet(naoEncontradas.map(c => mapRow(c, 'NÃO ENCONTRADA')));
                                                XLSX.utils.book_append_sheet(wb, wsNE, `Não Encontradas (${naoEncontradas.length})`);
                                            }
                                            const wsAll = XLSX.utils.json_to_sheet(excelComparison.map(c => mapRow(c, c.found ? (c.revMatch && c.costMatch ? 'CONFERIDO' : 'DIVERGENTE') : 'NÃO ENCONTRADA')));
                                            XLSX.utils.book_append_sheet(wb, wsAll, 'Todas as OS');
                                            XLSX.writeFile(wb, `Relatorio_Comparativo_${new Date().toISOString().slice(0,10)}.xlsx`);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors"
                                    >
                                        <Download size={12} /> Exportar Relatório
                                    </button>
                                </div>
                                <div className="text-[11px] font-bold text-slate-600 space-y-0.5">
                                    {(() => {
                                        const divItems = excelComparison.filter(c => c.found && (!c.revMatch || !c.costMatch));
                                        const onlyRevDiff = divItems.filter(c => !c.revMatch && c.costMatch).length;
                                        const onlyCostDiff = divItems.filter(c => c.revMatch && !c.costMatch).length;
                                        const bothDiff = divItems.filter(c => !c.revMatch && !c.costMatch).length;
                                        const totalRevDiff = divItems.reduce((a, c) => a + c.revDiff, 0);
                                        const totalCostDiff = divItems.reduce((a, c) => a + c.costDiff, 0);
                                        return (<>
                                            {onlyRevDiff > 0 && <p>• {onlyRevDiff} OS com divergência apenas na <span className="text-red-600">receita</span> (diferença total: {fmtBRL(totalRevDiff)})</p>}
                                            {onlyCostDiff > 0 && <p>• {onlyCostDiff} OS com divergência apenas no <span className="text-red-600">custo</span> (diferença total: {fmtBRL(totalCostDiff)})</p>}
                                            {bothDiff > 0 && <p>• {bothDiff} OS com divergência em <span className="text-red-600">receita e custo</span></p>}
                                            {divergent === 0 && <p className="text-green-600">Todas as OS estão conferidas!</p>}
                                            <p className="text-[10px] text-slate-400 pt-1">Tolerância: diferenças até R$ 10,00 são consideradas CONFERIDO</p>
                                        </>);
                                    })()}
                                </div>
                            </div>

                            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-black text-gray-600 uppercase">OS</th>
                                            <th className="text-left px-3 py-2 font-black text-gray-600 uppercase">Cliente</th>
                                            <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Planilha Receita</th>
                                            <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Sistema Receita</th>
                                            <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Diff. Receita</th>
                                            <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Planilha Custo</th>
                                            <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Sistema Custo</th>
                                            <th className="text-right px-3 py-2 font-black text-gray-600 uppercase">Diff. Custo</th>
                                            <th className="text-center px-3 py-2 font-black text-gray-600 uppercase">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {excelComparison.map((c, i) => {
                                            const hasIssue = !c.found || !c.revMatch || !c.costMatch;
                                            const isAdjusted = adjustedOsIds.has(c.osId);
                                            return (
                                                <tr key={i} className={`border-t border-gray-100 ${isAdjusted ? 'bg-blue-50/50' : hasIssue ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}
                                                    onClick={() => {
                                                        if (c.found && onOpenMission) {
                                                            const mission = filteredMissions.find(m => String(m.id).toUpperCase().replace('GTM-', '') === c.osId.replace('GTM-', ''));
                                                            if (mission) onOpenMission(mission as Mission);
                                                        }
                                                    }}
                                                    style={{ cursor: c.found ? 'pointer' : 'default' }}
                                                    data-testid={`excel-row-${c.osId}`}
                                                >
                                                    <td className="px-3 py-2 font-black text-blue-600">{c.osId}</td>
                                                    <td className="px-3 py-2 font-bold text-gray-600 truncate max-w-[120px]">{(c.client || '').substring(0, 20)}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${!c.revMatch && !isAdjusted ? 'text-red-600' : isAdjusted ? 'text-blue-700' : 'text-gray-700'}`}>{c.excelRev > 0 ? fmtBRL(c.excelRev) : '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${!c.revMatch && !isAdjusted ? 'text-red-600' : isAdjusted ? 'text-blue-700' : 'text-gray-700'}`}>{c.found ? fmtBRL(c.sysRev) : '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${c.revDiff > 10 && !isAdjusted ? 'text-red-600' : c.revDiff > 0.01 && !isAdjusted ? 'text-emerald-600' : isAdjusted ? 'text-blue-600' : 'text-gray-400'}`}>{c.found && c.excelRev > 0 ? (c.revDiff > 0.01 ? fmtBRL(c.revDiff) : '-') : '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${!c.costMatch && !isAdjusted ? 'text-red-600' : isAdjusted ? 'text-blue-700' : 'text-gray-700'}`}>{c.excelCost > 0 ? fmtBRL(c.excelCost) : '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${!c.costMatch && !isAdjusted ? 'text-red-600' : isAdjusted ? 'text-blue-700' : 'text-gray-700'}`}>{c.found ? fmtBRL(c.sysCost) : '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${c.costDiff > 10 && !isAdjusted ? 'text-red-600' : c.costDiff > 0.01 && !isAdjusted ? 'text-emerald-600' : isAdjusted ? 'text-blue-600' : 'text-gray-400'}`}>{c.found && c.excelCost > 0 ? (c.costDiff > 0.01 ? fmtBRL(c.costDiff) : '-') : '-'}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        {!c.found ? <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">NÃO ENCONTRADA</span> :
                                                         isAdjusted && c.revMatch && c.costMatch ? <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center justify-center gap-1"><CheckCircle size={10} /> AJUSTADO</span> :
                                                         isAdjusted ? <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center justify-center gap-1"><Edit2 size={10} /> ALTERADO</span> :
                                                         hasIssue ? <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center justify-center gap-1"><XOctagon size={10} /> DIVERGENTE</span> :
                                                         <span className="text-[9px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center justify-center gap-1"><CheckCircle size={10} /> CONFERIDO</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {isAiAnalyzing && (
                                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <Loader2 size={16} className="animate-spin text-blue-600" />
                                    <p className="text-xs font-bold text-blue-700">IA analisando divergências...</p>
                                </div>
                            )}

                            {excelAiAnalysis && (
                                <div className="bg-gray-900 text-white rounded-xl p-4 border border-gray-700">
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
                                        <Search size={14} className="text-blue-400" />
                                        <h5 className="text-xs font-black uppercase tracking-widest text-blue-400">Análise da IA</h5>
                                    </div>
                                    <div className="text-[12px] font-medium leading-relaxed whitespace-pre-wrap text-gray-200">{excelAiAnalysis}</div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="Missões por Dia" icon={Calendar} span={2}>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyData} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="day" tick={AXIS_TICK_SM} interval={dailyData.length > 15 ? 1 : 0} />
                            <YAxis tick={AXIS_TICK} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={dailyData.length > 20 ? 14 : 22}>
                                <LabelList dataKey="missoes" position="top" style={{ fontSize: 11, fontWeight: 900, fill: '#334155' }} formatter={(v: number) => v > 0 ? v : ''} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {isDirector && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <ChartCard title="Faturamento vs Custo vs Lucro" icon={DollarSign} span={2}>
                        <ResponsiveContainer width="100%" height={280}>
                            <ComposedChart data={dailyData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="day" tick={AXIS_TICK_SM} interval={dailyData.length > 15 ? 1 : 0} />
                                <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtShort(v)} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800, paddingTop: 8 }} />
                                <Bar dataKey="faturamento" name="Faturamento" fill="#059669" radius={[3, 3, 0, 0]} opacity={0.85} barSize={dailyData.length > 20 ? 10 : 16} />
                                <Bar dataKey="custo" name="Custo" fill="#dc2626" radius={[3, 3, 0, 0]} opacity={0.7} barSize={dailyData.length > 20 ? 10 : 16} />
                                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#2563eb" strokeWidth={3} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Receita Acumulada" icon={TrendingUp}>
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={cumulativeRevenue} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="day" tick={AXIS_TICK_SM} interval={cumulativeRevenue.length > 15 ? 1 : 0} />
                                <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtShort(v)} />
                                <Tooltip content={<CustomTooltip />} />
                                <defs>
                                    <linearGradient id="gradRevAcc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                                        <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke="#059669" strokeWidth={3} fill="url(#gradRevAcc)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Margem de Lucro por Cliente" icon={Percent}>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={clientMargins} layout="vertical" margin={{ top: 5, right: 55, left: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => `${v}%`} />
                                <YAxis dataKey="name" type="category" tick={AXIS_LABEL_Y} width={130} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="margem" name="Margem %" fill="#2563eb" radius={[0, 6, 6, 0]} barSize={18}>
                                    {clientMargins.map((entry, i) => (
                                        <Cell key={i} fill={entry.margem >= 20 ? '#059669' : entry.margem >= 10 ? '#2563eb' : '#dc2626'} />
                                    ))}
                                    <LabelList dataKey="margem" position="right" style={{ fontSize: 12, fontWeight: 900, fill: '#334155' }} formatter={(v: number) => `${v}%`} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <ChartCard title="Distribuição por Status" icon={PieChartIcon}>
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

                <ChartCard title="Top Clientes por Volume" icon={Trophy}>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={topClientsByVolume} layout="vertical" margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" tick={AXIS_LABEL_Y} width={130} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="missoes" name="Missões" fill="#dc2626" radius={[0, 6, 6, 0]} barSize={18}>
                                <LabelList dataKey="missoes" position="right" style={{ fontSize: 13, fontWeight: 900, fill: '#1e293b' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {isDirector ? (
                    <ChartCard title="Top Clientes por Faturamento" icon={DollarSign}>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={topClientsByRevenue} layout="vertical" margin={{ top: 5, right: 65, left: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => fmtShort(v)} />
                                <YAxis dataKey="name" type="category" tick={AXIS_LABEL_Y} width={130} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="faturamento" name="Faturamento" fill="#059669" radius={[0, 6, 6, 0]} barSize={18}>
                                    <LabelList dataKey="faturamento" position="right" style={{ fontSize: 11, fontWeight: 900, fill: '#334155' }} formatter={(v: number) => fmtShort(v)} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ) : (
                    <ChartCard title="Top Clientes por Faturamento" icon={DollarSign}>
                        <div className="flex flex-col items-center justify-center h-full text-gray-300"><Lock size={32} /><span className="text-xs font-black uppercase mt-3">Restrito</span></div>
                    </ChartCard>
                )}

                <ChartCard title="Mix de Operação" icon={Shield}>
                    <div className="flex flex-col">
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={4} dataKey="value" label={false}>
                                    {typeData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1 px-2">
                            {typeData.map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                                    <span className="text-[11px] font-bold text-gray-600">{s.name}: <span className="text-gray-900 font-black">{s.value}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>

                {isDirector ? (
                    <ChartCard title="Custo por Fornecedor" icon={Briefcase}>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={providerCosts} layout="vertical" margin={{ top: 5, right: 65, left: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => fmtShort(v)} />
                                <YAxis dataKey="name" type="category" tick={AXIS_LABEL_Y} width={130} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="custo" name="Custo Total" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={18}>
                                    <LabelList dataKey="custo" position="right" style={{ fontSize: 11, fontWeight: 900, fill: '#334155' }} formatter={(v: number) => fmtShort(v)} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ) : (
                    <ChartCard title="Custo por Fornecedor" icon={Briefcase}>
                        <div className="flex flex-col items-center justify-center h-full text-gray-300"><Lock size={32} /><span className="text-xs font-black uppercase mt-3">Restrito</span></div>
                    </ChartCard>
                )}

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
            </div>
        </div>
    );
};

export default React.memo(ExecutiveDashboard, (prev, next) => {
    return prev.missions === next.missions &&
           prev.isDirector === next.isDirector &&
           prev.clientTables === next.clientTables &&
           prev.providerTables === next.providerTables &&
           prev.clientsData === next.clientsData;
});
