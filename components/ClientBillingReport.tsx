
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { FileText, Search, Printer, Loader2, FileSpreadsheet, BarChart3, Users, Building2, ChevronDown, ChevronRight, ArrowRight, List } from 'lucide-react';
import { calculateMissionFinancials, extractCityFromAddress } from '../lib/financialUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import * as XLSX from 'xlsx';

interface ClientBillingReportProps { onNavigate?: (screen: string) => void; }
const ClientBillingReport: React.FC<ClientBillingReportProps> = ({ onNavigate }) => {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [missions, setMissions] = useState<any[]>([]);
    const [priceTables, setPriceTables] = useState<ClientPriceTable[]>([]);
    const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [reportGenerated, setReportGenerated] = useState(false);
    const [allPeriodMissions, setAllPeriodMissions] = useState<any[]>([]);
    const [allClientTables, setAllClientTables] = useState<ClientPriceTable[]>([]);
    const [allProviderTables, setAllProviderTables] = useState<ProviderCostTable[]>([]);
    const [chartsLoading, setChartsLoading] = useState(false);
    const [chartsGenerated, setChartsGenerated] = useState(false);

    useEffect(() => {
        fetchClients();
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
        setStartDate(firstDay);
        setEndDate(lastDay);
    }, []);

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('*').eq('status', 'Ativo').order('name');
        if (data) setClients(data as any);
    };

    const handleSetFortnight = (period: 1 | 2) => {
        const refDate = startDate ? new Date(startDate + 'T12:00:00') : new Date();
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        const mm = (month + 1).toString().padStart(2, '0');
        if (period === 1) {
            setStartDate(`${year}-${mm}-01`);
            setEndDate(`${year}-${mm}-15`);
        } else {
            const lastDay = new Date(year, month + 1, 0).getDate();
            setStartDate(`${year}-${mm}-16`);
            setEndDate(`${year}-${mm}-${lastDay}`);
        }
    };

    const handleGenerate = async () => {
        if (!selectedClient) { alert("Selecione um cliente."); return; }
        setIsLoading(true);
        setReportGenerated(false);
        try {
            const clientObj = clients.find(c => c.id.toString() === selectedClient);
            const clientName = clientObj?.name;
            const { data: missionData, error } = await supabase
                .from('missions')
                .select('*, company_vehicle:vehicles(*)')
                .eq('client', clientName)
                .eq('billing_approved', true)
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .neq('status', 'Cancelada')
                .order('created_at', { ascending: true });
            if (error) throw error;

            const clientVehicleIds = [...new Set((missionData || []).map((m: any) => m.client_vehicle).filter((id: any) => id))];
            let clientVehiclesMap: Record<string, any> = {};
            if (clientVehicleIds.length > 0) {
                const { data: cvData } = await supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', clientVehicleIds);
                if (cvData) {
                    cvData.forEach((v: any) => { clientVehiclesMap[v.id.toString()] = v; });
                }
            }

            const enrichedMissions = (missionData || []).map((m: any) => ({
                ...m,
                _clientVehicle: m.client_vehicle ? clientVehiclesMap[m.client_vehicle.toString()] : null
            }));

            const [ptRes, pctRes] = await Promise.all([
                supabase.from('client_price_tables').select('*').eq('client', clientName),
                supabase.from('provider_cost_tables').select('*')
            ]);
            setPriceTables(ptRes.data as ClientPriceTable[] || []);
            setProviderTables(pctRes.data as any || []);
            setMissions(enrichedMissions);
            setReportGenerated(true);
        } catch (err) {
            console.error(err);
            alert("Erro ao gerar relatório.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFetchCharts = async () => {
        if (!startDate || !endDate) { alert("Selecione o período."); return; }
        setChartsLoading(true);
        setChartsGenerated(false);
        try {
            const { data: missionData, error } = await supabase
                .from('missions')
                .select('*')
                .eq('billing_approved', true)
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .neq('status', 'Cancelada')
                .order('created_at', { ascending: true });
            if (error) throw error;

            const [ptRes, pctRes] = await Promise.all([
                supabase.from('client_price_tables').select('*'),
                supabase.from('provider_cost_tables').select('*')
            ]);
            setAllClientTables(ptRes.data as ClientPriceTable[] || []);
            setAllProviderTables(pctRes.data as any || []);
            setAllPeriodMissions(missionData || []);
            setChartsGenerated(true);
        } catch (err) {
            console.error(err);
            alert("Erro ao carregar dados dos gráficos.");
        } finally {
            setChartsLoading(false);
        }
    };

    interface MissionDetail { id: string; route: string; revenue: number; cost: number; lucro: number; pct: number; date: string; provider: string; client: string; km: number; }
    type ChartItem = { nome: string; valor: number; custo: number; lucro: number; pct: number; count: number; fullName: string; missions: MissionDetail[]; receita?: number; };

    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<'valor' | 'pct'>('valor');
    const [chartTab, setChartTab] = useState<'clientes' | 'fornecedores' | 'geral'>('clientes');

    const chartComputedData = useMemo(() => {
        if (!chartsGenerated || allPeriodMissions.length === 0) return { clientData: [] as ChartItem[], providerData: [] as ChartItem[] };
        const clientTotals: Record<string, { revenue: number; cost: number; count: number; missions: MissionDetail[] }> = {};
        const providerTotals: Record<string, { cost: number; revenue: number; count: number; missions: MissionDetail[] }> = {};

        allPeriodMissions.forEach(m => {
            const clientName = m.client || 'Sem Cliente';
            const providerName = m.provider || 'Sem Fornecedor';
            const clientObj = clients.find(c => c.name === clientName);
            const displayClient = clientObj?.trading_name || clientName;

            const clientTablesForM = allClientTables.filter(t => t.client === clientName);
            const fin = calculateMissionFinancials(m, clientTablesForM, allProviderTables, clientObj);

            const revenue = fin.client.total + (m.toll_value || 0);
            const cost = fin.provider.total + (m.toll_value_provider || m.toll_value || 0);
            const mLucro = revenue - cost;
            const mPct = revenue > 0 ? Math.round((mLucro / revenue) * 100) : 0;

            const cidadeO = extractCityFromAddress(m.origin || '');
            const cidadeD = extractCityFromAddress(m.destination || '');
            const route = cidadeO && cidadeD ? `${cidadeO} → ${cidadeD}` : m.region || '-';

            const detail: MissionDetail = {
                id: m.id || '',
                route,
                revenue: Math.round(revenue * 100) / 100,
                cost: Math.round(cost * 100) / 100,
                lucro: Math.round(mLucro * 100) / 100,
                pct: mPct,
                date: m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '-',
                provider: providerName,
                client: displayClient,
                km: m.total_distance || m.traveled_distance || 0
            };

            if (!clientTotals[displayClient]) clientTotals[displayClient] = { revenue: 0, cost: 0, count: 0, missions: [] };
            clientTotals[displayClient].revenue += revenue;
            clientTotals[displayClient].cost += cost;
            clientTotals[displayClient].count++;
            clientTotals[displayClient].missions.push(detail);

            if (!providerTotals[providerName]) providerTotals[providerName] = { cost: 0, revenue: 0, count: 0, missions: [] };
            providerTotals[providerName].cost += cost;
            providerTotals[providerName].revenue += revenue;
            providerTotals[providerName].count++;
            providerTotals[providerName].missions.push(detail);
        });

        const clientData: ChartItem[] = Object.entries(clientTotals)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .map(([nome, d]) => {
                const lucro = d.revenue - d.cost;
                const pct = d.revenue > 0 ? Math.round((lucro / d.revenue) * 100) : 0;
                const sortedMissions = d.missions.sort((a, b) => a.lucro - b.lucro);
                return { nome, valor: Math.round(d.revenue * 100) / 100, custo: Math.round(d.cost * 100) / 100, lucro: Math.round(lucro * 100) / 100, pct, count: d.count, fullName: nome, missions: sortedMissions };
            });

        const providerData: ChartItem[] = Object.entries(providerTotals)
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([nome, d]) => {
                const lucro = d.revenue - d.cost;
                const pct = d.revenue > 0 ? Math.round((lucro / d.revenue) * 100) : 0;
                const sortedMissions = d.missions.sort((a, b) => a.lucro - b.lucro);
                return { nome, valor: Math.round(d.cost * 100) / 100, receita: Math.round(d.revenue * 100) / 100, custo: Math.round(d.cost * 100) / 100, lucro: Math.round(lucro * 100) / 100, pct, count: d.count, fullName: nome, missions: sortedMissions };
            });

        const allMissions: MissionDetail[] = [];
        Object.values(clientTotals).forEach(ct => allMissions.push(...ct.missions));

        return { clientData, providerData, allMissions };
    }, [chartsGenerated, allPeriodMissions, clients, allClientTables, allProviderTables]);

    const clientChartData = chartComputedData.clientData;
    const providerChartData = chartComputedData.providerData;
    const allMissionsGeneral = chartComputedData.allMissions || [];

    const CHART_COLORS_CLIENT = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e3a5f', '#0c4a6e', '#0369a1', '#0284c7'];
    const CHART_COLORS_PROVIDER = ['#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#7f1d1d', '#9a3412', '#c2410c', '#ea580c'];

    const ChartTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.[0]) return null;
        const data = payload[0].payload;
        const isProvider = data.receita !== undefined;
        return (
            <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-gray-700 min-w-[200px]">
                <p className="font-black text-gray-300 uppercase tracking-wider mb-2 text-[11px] border-b border-gray-700 pb-2">{data.fullName || label}</p>
                {isProvider ? (
                    <>
                        <p className="text-[12px] font-bold text-gray-300">Custo: <span className="text-red-400 font-black">{fmtBRL(data.valor)}</span></p>
                        <p className="text-[12px] font-bold text-gray-300">Receita vinculada: <span className="text-blue-400 font-black">{fmtBRL(data.receita)}</span></p>
                    </>
                ) : (
                    <>
                        <p className="text-[12px] font-bold text-gray-300">Receita: <span className="text-blue-400 font-black">{fmtBRL(data.valor)}</span></p>
                        <p className="text-[12px] font-bold text-gray-300">Custo: <span className="text-red-400 font-black">{fmtBRL(data.custo)}</span></p>
                    </>
                )}
                <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-gray-300">Lucro: <span className={`font-black ${data.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtBRL(data.lucro)}</span></span>
                    <span className={`text-[13px] font-black px-2 py-0.5 rounded-md ${data.pct >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{data.pct}%</span>
                </div>
                <p className="text-[10px] text-gray-500 font-bold mt-1.5">{data.count} missões</p>
            </div>
        );
    };

    const handlePrint = () => { window.print(); };

    const fmtBRL = (val: number | null | undefined) => {
        const v = val ?? 0;
        return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    const fmtNum = (val: number | null | undefined, dec = 0) => (val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '-';
    const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const fmtDateDisp = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
    const fmtHHMM = (h: number) => {
        if (isNaN(h) || h <= 0) return '00:00';
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };
    const fmtFranchiseHr = (h: number) => {
        if (!h || h <= 0) return '00:00';
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    const clientData = clients.find(c => c.id.toString() === selectedClient);
    const displayClientName = clientData ? (clientData.trading_name || clientData.name) : '';

    const getPeriodLabel = () => {
        if (!startDate || !endDate) return '';
        const sDate = new Date(startDate + 'T12:00:00');
        const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        const month = months[sDate.getMonth()];
        const year = sDate.getFullYear();
        const sDay = sDate.getDate();
        const eDate = new Date(endDate + 'T12:00:00');
        const eDay = eDate.getDate();
        if (sDay === 1 && eDay === 15) return `GERAL - ${month} /${year} - 1ª QUINZENA DE ${month}`;
        if (sDay === 16) return `GERAL - ${month} /${year} - 2ª QUINZENA DE ${month}`;
        return `GERAL - ${month} /${year} - ${fmtDateDisp(startDate)} A ${fmtDateDisp(endDate)}`;
    };

    const rowsData = useMemo(() => {
        return missions.map(m => {
            const fin = calculateMissionFinancials(m, priceTables, providerTables, clientData);
            const usedTable = priceTables.find(t => t.id.toString() === fin.client.tableId);
            const franchiseKm = usedTable?.franchise_km ?? 0;
            const franchiseHours = usedTable?.franchise_hours ?? 0;
            const activationFee = usedTable?.activation_fee ?? 0;
            const unitKm = usedTable?.price_per_extra_km ?? 0;
            const unitHr = usedTable?.price_per_extra_hour ?? 0;
            const route = m.origin && m.destination
                ? `${(m.origin || '').split(',')[0].trim()} X ${(m.destination || '').split(',')[0].trim()}`
                : (usedTable?.route_name || '-');

            const kmTotal = fin.realTraveledKm;
            const kmExtraQtd = fin.client.excessKm;
            const kmExtraTotal = fin.client.extraKmVal;
            const hrExtraQtd = fin.client.excessHours;
            const hrExtraTotal = fin.client.extraHrVal;
            const durationHours = fin.durationHours;
            const tollVal = m.toll_value || 0;
            const totalGeral = (m.revenue_value || 0) + tollVal;

            const cargoPlate = m._clientVehicle?.plate || '-';

            const cidadeOrigem = extractCityFromAddress(m.origin || '');
            const cidadeDestino = extractCityFromAddress(m.destination || '');
            const refCidades = cidadeOrigem && cidadeDestino
                ? `${cidadeOrigem} X ${cidadeDestino}`
                : cidadeOrigem || cidadeDestino || m.region || '-';

            return {
                id: (m.id || '').replace('GTM-', ''),
                route: refCidades,
                client: displayClientName,
                activationFee,
                franchiseHours,
                franchiseKm,
                unitHr,
                unitKm,
                tollLabel: 'À PARTE',
                status: 'CONCLUÍDO',
                startDate: fmtDate(m.start_time),
                startTime: fmtTime(m.start_time),
                viatura: m.company_vehicle?.plate || m.vehicle_id || '-',
                cargoPlate,
                endDate: fmtDate(m.end_time),
                endTime: fmtTime(m.end_time),
                kmStart: m.start_km ?? 0,
                kmEnd: m.end_km ?? 0,
                kmTotal,
                timeStart: fmtTime(m.start_time),
                timeEnd: fmtTime(m.end_time),
                timeTotal: fmtHHMM(durationHours),
                kmExtraQtd,
                kmExtraUnit: unitKm,
                kmExtraTotal,
                hrExtraQtd,
                hrExtraUnit: unitHr,
                hrExtraTotal,
                escoltaVal: activationFee,
                tollVal,
                totalGeral,
                franchiseHoursFmt: fmtFranchiseHr(franchiseHours)
            };
        });
    }, [missions, priceTables, providerTables, clientData, displayClientName]);

    const grandTotal = useMemo(() => rowsData.reduce((s, r) => s + r.totalGeral, 0), [rowsData]);

    const fmtBRLExcel = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const handleExportExcel = useCallback(() => {
        if (rowsData.length === 0) return;

        const wb = XLSX.utils.book_new();

        const headerGroup = [
            'TABELA ACORDADA', '', '', '', '', '', '',
            'INFORMAÇÕES DA VIAGEM', '', '', '', '', '',
            'KILOMETRAGEM', '', '',
            'HORÁRIOS', '', '',
            'KM EXCEDENTE', '', '',
            'HORA EXCEDENTE', '', '',
            'VALORES', '', ''
        ];
        const headerSub = [
            'Nº', 'ROTA', 'VALOR', 'HR FRANQ', 'KM FRANQ', 'HR EXTRA', 'KM EXTRA',
            'DATA INÍCIO', 'HORA INÍCIO', 'VIATURA', 'VEÍC. ESCOLTADO', 'DATA FIM', 'HORA FIM',
            'INICIAL', 'FINAL', 'TOTAL',
            'INICIAL', 'FINAL', 'TOTAL',
            'KM', 'VALOR', 'TOTAL',
            'HORA', 'VALOR', 'TOTAL',
            'ESCOLTA', 'PEDÁGIO', 'TOTAL'
        ];

        const titleRow = ['BOLETIM DE MEDIÇÃO'];
        const periodRow = [getPeriodLabel()];
        const subtitleRow = ['REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS'];

        const dataRows = rowsData.map(r => [
            r.id,
            r.route,
            fmtBRLExcel(r.activationFee),
            r.franchiseHoursFmt,
            r.franchiseKm > 0 ? fmtNum(r.franchiseKm) : '-',
            fmtBRLExcel(r.unitHr),
            fmtBRLExcel(r.unitKm),
            r.startDate,
            r.startTime,
            r.viatura,
            r.cargoPlate,
            r.endDate,
            r.endTime,
            r.kmStart > 0 ? fmtNum(r.kmStart) : '-',
            r.kmEnd > 0 ? fmtNum(r.kmEnd) : '-',
            r.kmTotal > 0 ? fmtNum(r.kmTotal) : '-',
            r.timeStart,
            r.timeEnd,
            r.timeTotal,
            r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : '-',
            r.kmExtraQtd > 0 ? fmtBRLExcel(r.kmExtraUnit) : '-',
            r.kmExtraTotal > 0 ? fmtBRLExcel(r.kmExtraTotal) : 'R$ 0,00',
            r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : '-',
            r.hrExtraQtd > 0 ? fmtBRLExcel(r.hrExtraUnit) : '-',
            r.hrExtraTotal > 0 ? fmtBRLExcel(r.hrExtraTotal) : 'R$ 0,00',
            fmtBRLExcel(r.escoltaVal),
            r.tollVal > 0 ? fmtBRLExcel(r.tollVal) : 'R$ 0,00',
            fmtBRLExcel(r.totalGeral)
        ]);

        const totalRow = Array(28).fill('');
        totalRow[0] = 'TOTAL';
        totalRow[27] = fmtBRLExcel(grandTotal);

        const allRows = [titleRow, periodRow, subtitleRow, [], headerGroup, headerSub, ...dataRows, [], totalRow];
        const ws = XLSX.utils.aoa_to_sheet(allRows);

        ws['!cols'] = [
            { wch: 6 }, { wch: 30 }, { wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
            { wch: 9 }, { wch: 9 }, { wch: 8 },
            { wch: 7 }, { wch: 7 }, { wch: 7 },
            { wch: 6 }, { wch: 12 }, { wch: 12 },
            { wch: 7 }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 12 }, { wch: 14 }
        ];

        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 27 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 27 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 27 } },
            { s: { r: 4, c: 0 }, e: { r: 4, c: 6 } },
            { s: { r: 4, c: 7 }, e: { r: 4, c: 12 } },
            { s: { r: 4, c: 13 }, e: { r: 4, c: 15 } },
            { s: { r: 4, c: 16 }, e: { r: 4, c: 18 } },
            { s: { r: 4, c: 19 }, e: { r: 4, c: 21 } },
            { s: { r: 4, c: 22 }, e: { r: 4, c: 24 } },
            { s: { r: 4, c: 25 }, e: { r: 4, c: 27 } },
        ];

        const clientLabel = displayClientName || 'CLIENTE';
        const periodShort = startDate && endDate ? `${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}` : 'PERIODO';
        const fileName = `Boletim_${clientLabel.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}_${periodShort}.xlsx`;

        XLSX.utils.book_append_sheet(wb, ws, 'Boletim');
        XLSX.writeFile(wb, fileName, { compression: true });
    }, [rowsData, grandTotal, displayClientName, startDate, endDate]);

    const cellStyle: React.CSSProperties = {
        border: '1px solid #9ca3af',
        padding: '1px 2px',
        fontSize: '6.5px',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: '#1f2937',
        lineHeight: '1.3'
    };
    const cellRight: React.CSSProperties = { ...cellStyle, textAlign: 'right' };
    const cellBold: React.CSSProperties = { ...cellStyle, fontWeight: 800, color: '#111827' };
    const headerStyle: React.CSSProperties = {
        ...cellStyle,
        backgroundColor: '#e5e7eb',
        fontWeight: 900,
        fontSize: '6px',
        textTransform: 'uppercase' as const,
        color: '#000',
        padding: '2px 1px'
    };
    const groupHeaderStyle: React.CSSProperties = {
        ...headerStyle,
        backgroundColor: '#d1d5db',
        fontSize: '6.5px',
        letterSpacing: '0.3px',
        padding: '3px 2px'
    };

    const bgKm = '#eef2ff';
    const bgHr = '#fef9c3';
    const bgKmExc = '#ecfdf5';
    const bgHrExc = '#fdf2f8';
    const bgVal = '#f0f9ff';

    const hdrKm: React.CSSProperties = { ...headerStyle, backgroundColor: '#c7d2fe' };
    const hdrHr: React.CSSProperties = { ...headerStyle, backgroundColor: '#fde68a' };
    const hdrKmExc: React.CSSProperties = { ...headerStyle, backgroundColor: '#a7f3d0' };
    const hdrHrExc: React.CSSProperties = { ...headerStyle, backgroundColor: '#fbcfe8' };
    const hdrVal: React.CSSProperties = { ...headerStyle, backgroundColor: '#bae6fd' };

    const grpKm: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#a5b4fc' };
    const grpHr: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#fcd34d' };
    const grpKmExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#6ee7b7' };
    const grpHrExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#f9a8d4' };
    const grpVal: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#7dd3fc' };

    return (
        <div className="space-y-6 animate-fade-in pb-20 relative">
            <style>{`
                @media print {
                    @page { size: A4 landscape; margin: 2mm 2mm; }
                    body * { visibility: hidden !important; }
                    #print-area, #print-area * { visibility: visible !important; }
                    #print-area {
                        position: absolute; left: 0; top: 0;
                        width: 293mm;
                        transform-origin: top left;
                        overflow: visible !important;
                    }
                    #print-area .report-table-scroll {
                        overflow: visible !important;
                    }
                    #print-area table {
                        table-layout: fixed !important;
                        width: 293mm !important;
                        border-collapse: collapse !important;
                        page-break-inside: auto !important;
                    }
                    #print-area thead { display: table-header-group !important; }
                    #print-area tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    #print-area td, #print-area th {
                        padding: 0.3mm 0.5mm !important;
                        font-size: 1.6mm !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        border: 0.2px solid #888 !important;
                        line-height: 1.2 !important;
                    }
                    #print-area td.route-cell {
                        white-space: normal !important;
                        word-break: break-word !important;
                        line-height: 1.1 !important;
                        font-size: 1.5mm !important;
                    }
                    #print-area .group-hdr th { font-size: 1.7mm !important; padding: 0.5mm !important; }
                    #print-area .sub-hdr th { font-size: 1.5mm !important; padding: 0.3mm 0.4mm !important; }
                    #print-area h1 { font-size: 3.5mm !important; margin: 0 !important; }
                    #print-area .subtitle-line { font-size: 2.2mm !important; }
                    #print-area .ref-line { font-size: 1.8mm !important; }
                    .no-print { display: none !important; }
                    #print-area .sign-section {
                        margin-top: 15mm !important;
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                    #print-area .sign-box { font-size: 2mm !important; width: 60mm !important; }
                    #print-area tfoot tr {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                }
            `}</style>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                            <FileText className="text-blue-700" /> Boletim de Medição
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Relatório detalhado para conferência e faturamento.</p>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Cliente</label>
                            <select className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 bg-white uppercase font-bold" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                                <option value="">Selecione...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.trading_name || c.name}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex justify-between mb-1">
                                <label className="text-xs font-bold text-gray-500 uppercase block">Período</label>
                                <div className="flex gap-2">
                                    <button onClick={() => handleSetFortnight(1)} className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200">1ª Quinzena</button>
                                    <button onClick={() => handleSetFortnight(2)} className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200">2ª Quinzena</button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={handleGenerate} disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Gerar
                            </button>
                            <button onClick={handleFetchCharts} disabled={chartsLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="button-generate-charts">
                                {chartsLoading ? <Loader2 size={18} className="animate-spin" /> : <BarChart3 size={18} />} Gráficos
                            </button>
                            {reportGenerated && (
                                <>
                                    <button onClick={handleExportExcel} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                        <FileSpreadsheet size={18} /> Excel
                                    </button>
                                    <button onClick={handlePrint} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                        <Printer size={18} /> PDF
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {chartsGenerated && (clientChartData.length > 0 || providerChartData.length > 0) && (
                <div className="no-print" data-testid="billing-charts-section">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <button onClick={() => setChartTab('clientes')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${chartTab === 'clientes' ? 'bg-blue-700 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="tab-clientes"><Users size={12} />Clientes</button>
                        <button onClick={() => setChartTab('fornecedores')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${chartTab === 'fornecedores' ? 'bg-red-700 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="tab-fornecedores"><Building2 size={12} />Fornecedores</button>
                        <button onClick={() => setChartTab('geral')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${chartTab === 'geral' ? 'bg-gray-800 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="tab-geral"><List size={12} />Geral</button>
                        <div className="flex-1" />
                        {onNavigate && (
                            <button onClick={() => onNavigate('fin-billing-control')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black bg-amber-500 text-white hover:bg-amber-600 transition-all shadow-sm" data-testid="btn-auditoria">
                                <Search size={12} />Auditoria de Faturamento<ArrowRight size={10} />
                            </button>
                        )}
                    </div>

                    {chartTab === 'clientes' && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                            <div className="p-2 bg-blue-700 text-white rounded-lg"><Users size={14} /></div>
                            <div>
                                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">Faturamento por Cliente</h4>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{allPeriodMissions.length} missões &middot; Total: {fmtBRL(clientChartData.reduce((s, d) => s + d.valor, 0))}</p>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {clientChartData.map((item, i) => {
                                const maxVal = clientChartData[0]?.valor || 1;
                                const pctWidth = Math.max(3, (item.valor / maxVal) * 100);
                                const isExpanded = expandedClient === item.nome;
                                return (
                                    <div key={i}>
                                        <div className={`cursor-pointer rounded-lg p-2 transition-all hover:bg-gray-50 ${isExpanded ? 'bg-blue-50/50 ring-1 ring-blue-200' : ''}`} onClick={() => setExpandedClient(isExpanded ? null : item.nome)} data-testid={`chart-client-row-${i}`}>
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0 max-w-[55%]">
                                                    {isExpanded ? <ChevronDown size={12} className="text-blue-600 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
                                                    <span className="text-[12px] font-black text-gray-800 truncate" title={item.fullName}>{item.nome}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-black text-gray-700">{fmtBRL(item.valor)}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${item.pct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.pct}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctWidth}%`, backgroundColor: CHART_COLORS_CLIENT[i % CHART_COLORS_CLIENT.length] }} />
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[9px] text-gray-400 font-bold">{item.count} missões</span>
                                                <span className="text-[9px] text-gray-400 font-bold">Custo: {fmtBRL(item.custo)}</span>
                                                <span className={`text-[9px] font-bold ${item.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Lucro: {fmtBRL(item.lucro)}</span>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="ml-4 mr-1 mt-1 mb-2 border border-blue-100 rounded-lg overflow-hidden animate-fade-in">
                                                <div className="flex items-center gap-1 px-2 py-1.5 bg-blue-50/80 border-b border-blue-100">
                                                    <span className="text-[9px] font-bold text-blue-600 mr-1">Ordenar:</span>
                                                    <button onClick={(e) => { e.stopPropagation(); setSortMode('valor'); }} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'valor' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'}`} data-testid="sort-valor-client">R$ Valor</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setSortMode('pct'); }} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'pct' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'}`} data-testid="sort-pct-client">% Margem</button>
                                                </div>
                                                <table className="w-full text-[10px]">
                                                    <thead>
                                                        <tr className="bg-blue-50">
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">OS</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">Data</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">Rota</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">Fornecedor</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">KM</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">Receita</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">Custo</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">Lucro</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">%</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[...item.missions].sort((a, b) => sortMode === 'valor' ? a.lucro - b.lucro : a.pct - b.pct).map((m, mi) => (
                                                            <tr key={mi} className={`border-t border-blue-50 ${m.lucro < 0 ? 'bg-red-50' : mi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                                <td className="px-2 py-1 font-black text-gray-800">{m.id.replace('GTM-', '')}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold">{m.date}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[120px]" title={m.route}>{m.route}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.provider}>{m.provider}</td>
                                                                <td className="px-2 py-1 text-right text-gray-600 font-bold">{m.km > 0 ? Math.round(m.km) : '-'}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-blue-700">{fmtBRL(m.revenue)}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-red-600">{fmtBRL(m.cost)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.lucro >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{fmtBRL(m.lucro)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.pct >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{m.pct}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    )}

                    {chartTab === 'fornecedores' && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                            <div className="p-2 bg-red-700 text-white rounded-lg"><Building2 size={14} /></div>
                            <div>
                                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">Custo por Fornecedor</h4>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{allPeriodMissions.length} missões &middot; Total: {fmtBRL(providerChartData.reduce((s, d) => s + d.valor, 0))}</p>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {providerChartData.map((item, i) => {
                                const maxVal = providerChartData[0]?.valor || 1;
                                const pctWidth = Math.max(3, (item.valor / maxVal) * 100);
                                const isExpanded = expandedProvider === item.nome;
                                return (
                                    <div key={i}>
                                        <div className={`cursor-pointer rounded-lg p-2 transition-all hover:bg-gray-50 ${isExpanded ? 'bg-red-50/50 ring-1 ring-red-200' : ''}`} onClick={() => setExpandedProvider(isExpanded ? null : item.nome)} data-testid={`chart-provider-row-${i}`}>
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0 max-w-[55%]">
                                                    {isExpanded ? <ChevronDown size={12} className="text-red-600 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
                                                    <span className="text-[12px] font-black text-gray-800 truncate" title={item.fullName}>{item.nome}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-black text-gray-700">{fmtBRL(item.valor)}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${item.pct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.pct}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctWidth}%`, backgroundColor: CHART_COLORS_PROVIDER[i % CHART_COLORS_PROVIDER.length] }} />
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[9px] text-gray-400 font-bold">{item.count} missões</span>
                                                <span className="text-[9px] text-gray-400 font-bold">Receita: {fmtBRL(item.receita)}</span>
                                                <span className={`text-[9px] font-bold ${item.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Lucro: {fmtBRL(item.lucro)}</span>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="ml-4 mr-1 mt-1 mb-2 border border-red-100 rounded-lg overflow-hidden animate-fade-in">
                                                <div className="flex items-center gap-1 px-2 py-1.5 bg-red-50/80 border-b border-red-100">
                                                    <span className="text-[9px] font-bold text-red-600 mr-1">Ordenar:</span>
                                                    <button onClick={(e) => { e.stopPropagation(); setSortMode('valor'); }} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'valor' ? 'bg-red-600 text-white' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'}`} data-testid="sort-valor-provider">R$ Valor</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setSortMode('pct'); }} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'pct' ? 'bg-red-600 text-white' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'}`} data-testid="sort-pct-provider">% Margem</button>
                                                </div>
                                                <table className="w-full text-[10px]">
                                                    <thead>
                                                        <tr className="bg-red-50">
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">OS</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">Data</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">Rota</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">Cliente</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">KM</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">Receita</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">Custo</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">Lucro</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">%</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[...item.missions].sort((a, b) => sortMode === 'valor' ? a.lucro - b.lucro : a.pct - b.pct).map((m, mi) => (
                                                            <tr key={mi} className={`border-t border-red-50 ${m.lucro < 0 ? 'bg-red-50' : mi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                                <td className="px-2 py-1 font-black text-gray-800">{m.id.replace('GTM-', '')}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold">{m.date}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[120px]" title={m.route}>{m.route}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.client}>{m.client}</td>
                                                                <td className="px-2 py-1 text-right text-gray-600 font-bold">{m.km > 0 ? Math.round(m.km) : '-'}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-blue-700">{fmtBRL(m.revenue)}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-red-600">{fmtBRL(m.cost)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.lucro >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{fmtBRL(m.lucro)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.pct >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{m.pct}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    )}

                    {chartTab === 'geral' && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                            <div className="p-2 bg-gray-800 text-white rounded-lg"><List size={14} /></div>
                            <div className="flex-1">
                                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">Todas as OS do Período</h4>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{allMissionsGeneral.length} missões &middot; Receita: {fmtBRL(allMissionsGeneral.reduce((s, m) => s + m.revenue, 0))} &middot; Custo: {fmtBRL(allMissionsGeneral.reduce((s, m) => s + m.cost, 0))} &middot; Lucro: {fmtBRL(allMissionsGeneral.reduce((s, m) => s + m.lucro, 0))}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-gray-500 mr-1">Ordenar:</span>
                                <button onClick={() => setSortMode('valor')} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'valor' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="sort-valor-geral">R$ Valor</button>
                                <button onClick={() => setSortMode('pct')} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'pct' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="sort-pct-geral">% Margem</button>
                            </div>
                        </div>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div style={{ maxHeight: '600px', overflowY: 'auto' }} className="scrollbar-thin">
                                <table className="w-full text-[10px]">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100">
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">OS</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Data</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Cliente</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Fornecedor</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Rota</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">KM</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">Receita</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">Custo</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">Lucro</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...allMissionsGeneral].sort((a, b) => sortMode === 'valor' ? a.lucro - b.lucro : a.pct - b.pct).map((m, mi) => (
                                            <tr key={mi} className={`border-t border-gray-100 ${m.lucro < 0 ? 'bg-red-50' : mi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                <td className="px-2 py-1 font-black text-gray-800">{m.id.replace('GTM-', '')}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold">{m.date}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.client}>{m.client}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.provider}>{m.provider}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[120px]" title={m.route}>{m.route}</td>
                                                <td className="px-2 py-1 text-right text-gray-600 font-bold">{m.km > 0 ? Math.round(m.km) : '-'}</td>
                                                <td className="px-2 py-1 text-right font-bold text-blue-700">{fmtBRL(m.revenue)}</td>
                                                <td className="px-2 py-1 text-right font-bold text-red-600">{fmtBRL(m.cost)}</td>
                                                <td className={`px-2 py-1 text-right font-black ${m.lucro >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{fmtBRL(m.lucro)}</td>
                                                <td className={`px-2 py-1 text-right font-black ${m.pct >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{m.pct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {reportGenerated && (
                <div id="print-area" className="bg-white p-2 w-full border border-gray-200 rounded-lg">
                    <div className="mb-2 text-center">
                        <h1 style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>BOLETIM DE MEDIÇÃO</h1>
                        <p className="subtitle-line" style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>{getPeriodLabel()}</p>
                        <p className="ref-line" style={{ fontSize: '7px', fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginTop: '2px' }}>REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS</p>
                    </div>

                    <div className="report-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                                {/* TABELA ACORDADA: Nº, ROTA, VALOR, HR FRANQ, KM FRANQ, HR EXTRA, KM EXTRA */}
                                <col style={{ width: '2.6%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '4%' }} />
                                <col style={{ width: '3%' }} />
                                <col style={{ width: '3%' }} />
                                <col style={{ width: '3.6%' }} />
                                <col style={{ width: '3.6%' }} />
                                {/* INFO VIAGEM: DATA INÍCIO, HORA INI, VIATURA, VEÍC ESCOLT, DATA FIM, HORA FIM */}
                                <col style={{ width: '3.8%' }} />
                                <col style={{ width: '2.8%' }} />
                                <col style={{ width: '4%' }} />
                                <col style={{ width: '4%' }} />
                                <col style={{ width: '3.8%' }} />
                                <col style={{ width: '2.8%' }} />
                                {/* KILOMETRAGEM: INICIAL, FINAL, TOTAL */}
                                <col style={{ width: '3.2%' }} />
                                <col style={{ width: '3.2%' }} />
                                <col style={{ width: '3.2%' }} />
                                {/* HORÁRIOS: INICIAL, FINAL, TOTAL */}
                                <col style={{ width: '2.8%' }} />
                                <col style={{ width: '2.8%' }} />
                                <col style={{ width: '3%' }} />
                                {/* KM EXCEDENTE: KM, VALOR, TOTAL */}
                                <col style={{ width: '2.6%' }} />
                                <col style={{ width: '3.6%' }} />
                                <col style={{ width: '3.8%' }} />
                                {/* HORA EXCEDENTE: HORA, VALOR, TOTAL */}
                                <col style={{ width: '2.6%' }} />
                                <col style={{ width: '3.6%' }} />
                                <col style={{ width: '3.8%' }} />
                                {/* VALORES: ESCOLTA, PEDÁGIO, TOTAL */}
                                <col style={{ width: '4%' }} />
                                <col style={{ width: '3.6%' }} />
                                <col style={{ width: '4.8%' }} />
                            </colgroup>
                            <thead>
                                <tr className="group-hdr">
                                    <th style={groupHeaderStyle} colSpan={7}>TABELA ACORDADA</th>
                                    <th style={groupHeaderStyle} colSpan={6}>INFORMAÇÕES DA VIAGEM</th>
                                    <th style={grpKm} colSpan={3}>KILOMETRAGEM</th>
                                    <th style={grpHr} colSpan={3}>HORÁRIOS</th>
                                    <th style={grpKmExc} colSpan={3}>KM EXCEDENTE</th>
                                    <th style={grpHrExc} colSpan={3}>HORA EXCEDENTE</th>
                                    <th style={grpVal} colSpan={3}>VALORES</th>
                                </tr>
                                <tr className="sub-hdr">
                                    <th style={headerStyle}>Nº</th>
                                    <th style={{ ...headerStyle, textAlign: 'left' }}>ROTA</th>
                                    <th style={headerStyle}>VALOR</th>
                                    <th style={headerStyle}>HR FRANQ</th>
                                    <th style={headerStyle}>KM FRANQ</th>
                                    <th style={headerStyle}>HR EXTRA</th>
                                    <th style={headerStyle}>KM EXTRA</th>
                                    <th style={headerStyle}>DATA INÍCIO</th>
                                    <th style={headerStyle}>HORA INÍCIO</th>
                                    <th style={headerStyle}>VIATURA</th>
                                    <th style={headerStyle}>VEÍC. ESCOLTADO</th>
                                    <th style={headerStyle}>DATA FIM</th>
                                    <th style={headerStyle}>HORA FIM</th>
                                    <th style={hdrKm}>INICIAL</th>
                                    <th style={hdrKm}>FINAL</th>
                                    <th style={hdrKm}>TOTAL</th>
                                    <th style={hdrHr}>INICIAL</th>
                                    <th style={hdrHr}>FINAL</th>
                                    <th style={hdrHr}>TOTAL</th>
                                    <th style={hdrKmExc}>KM</th>
                                    <th style={hdrKmExc}>VALOR</th>
                                    <th style={hdrKmExc}>TOTAL</th>
                                    <th style={hdrHrExc}>HORA</th>
                                    <th style={hdrHrExc}>VALOR</th>
                                    <th style={hdrHrExc}>TOTAL</th>
                                    <th style={hdrVal}>ESCOLTA</th>
                                    <th style={hdrVal}>PEDÁGIO</th>
                                    <th style={hdrVal}>TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rowsData.length === 0 ? (
                                    <tr><td colSpan={28} style={{ ...cellStyle, padding: '16px', fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>NENHUMA MISSÃO NO PERÍODO.</td></tr>
                                ) : (
                                    rowsData.map((r, i) => (
                                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                            <td style={cellBold}>{r.id}</td>
                                            <td className="route-cell" style={{ ...cellStyle, textAlign: 'left' }} title={r.route}>{r.route}</td>
                                            <td style={cellStyle}>{fmtBRL(r.activationFee)}</td>
                                            <td style={cellStyle}>{r.franchiseHoursFmt}</td>
                                            <td style={cellStyle}>{fmtNum(r.franchiseKm)}</td>
                                            <td style={cellStyle}>{fmtBRL(r.unitHr)}</td>
                                            <td style={cellStyle}>{fmtBRL(r.unitKm)}</td>
                                            <td style={cellStyle}>{r.startDate}</td>
                                            <td style={cellStyle}>{r.startTime}</td>
                                            <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{r.viatura}</td>
                                            <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{r.cargoPlate}</td>
                                            <td style={cellStyle}>{r.endDate}</td>
                                            <td style={cellStyle}>{r.endTime}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgKm }}>{fmtNum(r.kmStart)}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgKm }}>{fmtNum(r.kmEnd)}</td>
                                            <td style={{ ...cellBold, backgroundColor: bgKm }}>{fmtNum(r.kmTotal)}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgHr }}>{r.timeStart}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgHr }}>{r.timeEnd}</td>
                                            <td style={{ ...cellBold, backgroundColor: bgHr }}>{r.timeTotal}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : '-'}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtBRL(r.kmExtraUnit) : '-'}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgKmExc }}>{r.kmExtraTotal > 0 ? fmtBRL(r.kmExtraTotal) : 'R$ 0,00'}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : '-'}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtBRL(r.hrExtraUnit) : '-'}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgHrExc }}>{r.hrExtraTotal > 0 ? fmtBRL(r.hrExtraTotal) : 'R$ 0,00'}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgVal }}>{fmtBRL(r.escoltaVal)}</td>
                                            <td style={{ ...cellStyle, backgroundColor: bgVal }}>{r.tollVal > 0 ? fmtBRL(r.tollVal) : 'R$ 0,00'}</td>
                                            <td style={{ ...cellBold, backgroundColor: bgVal }}>{fmtBRL(r.totalGeral)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {rowsData.length > 0 && (
                                <tfoot>
                                    <tr style={{ backgroundColor: '#111827', color: '#fff' }}>
                                        <td colSpan={27} style={{ ...cellStyle, textAlign: 'right', fontWeight: 900, fontSize: '8px', color: '#fff', border: '1px solid #000' }}>TOTAL</td>
                                        <td style={{ ...cellStyle, fontWeight: 900, fontSize: '9px', color: '#fff', border: '1px solid #000' }}>{fmtBRL(grandTotal)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    <div className="sign-section" style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between', padding: '0 40px' }}>
                        <div className="sign-box" style={{ textAlign: 'center', borderTop: '1px solid #000', width: '250px', paddingTop: '8px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' }}>Assinatura TMSEG</div>
                        <div className="sign-box" style={{ textAlign: 'center', borderTop: '1px solid #000', width: '250px', paddingTop: '8px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' }}>Assinatura Cliente</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientBillingReport;
