
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { FileText, Search, Printer, Download, Calendar, Filter, Loader2, Building2, BrainCircuit, AlertTriangle, CheckCircle, CalendarRange, PieChart, BarChart3, TrendingUp, DollarSign, MapPin } from 'lucide-react';
import { calculateMissionFinancials } from '../lib/financialUtils';

const ClientBillingReport: React.FC = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [missions, setMissions] = useState<any[]>([]);
    
    // Dados necessários para o cálculo detalhado linha a linha
    const [priceTables, setPriceTables] = useState<ClientPriceTable[]>([]);
    const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [reportGenerated, setReportGenerated] = useState(false);

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
        const yyyy = year;
        const mm = (month + 1).toString().padStart(2, '0');

        if (period === 1) {
            setStartDate(`${yyyy}-${mm}-01`);
            setEndDate(`${yyyy}-${mm}-15`);
        } else {
            const lastDay = new Date(year, month + 1, 0).getDate();
            setStartDate(`${yyyy}-${mm}-16`);
            setEndDate(`${yyyy}-${mm}-${lastDay}`);
        }
    };

    const handleGenerate = async () => {
        if (!selectedClient) {
            alert("Selecione um cliente.");
            return;
        }
        setIsLoading(true);
        setReportGenerated(false);

        try {
            const clientData = clients.find(c => c.id.toString() === selectedClient);
            const clientName = clientData?.name;

            let query = supabase
                .from('missions')
                .select(`
                    *,
                    client_vehicle_data:client_vehicles(*),
                    company_vehicle:vehicles(*)
                `)
                .eq('client', clientName)
                .eq('billing_approved', true)
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .neq('status', 'Cancelada')
                .order('created_at', { ascending: true });

            const { data: missionData, error: missionError } = await query;
            if (missionError) throw missionError;

            // Carrega tabelas para cálculo de breakdown (franquias, extras unitários)
            const [ptRes, pctRes] = await Promise.all([
                supabase.from('client_price_tables').select('*').eq('client', clientName),
                supabase.from('provider_cost_tables').select('*')
            ]);
            
            setPriceTables(ptRes.data as ClientPriceTable[] || []);
            setProviderTables(pctRes.data as any || []);
            setMissions(missionData || []);
            setReportGenerated(true);

        } catch (error) {
            console.error(error);
            alert("Erro ao gerar relatório.");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = () => { window.print(); };

    const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatNumber = (val: number, decimals = 0) => val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    
    // Funções auxiliares de data/hora
    const getDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '-';
    const getTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-';
    
    const formatDateDisplay = (dateString: string) => {
        if(!dateString) return '';
        const [y, m, d] = dateString.split('-');
        return `${d}/${m}/${y}`;
    }

    const formatDecimalToTime = (decimalHours: number) => {
        if (isNaN(decimalHours)) return '00:00:00';
        const h = Math.floor(decimalHours);
        const m = Math.floor((decimalHours - h) * 60);
        const s = Math.round(((decimalHours - h) * 60 - m) * 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const clientData = clients.find(c => c.id.toString() === selectedClient);
    const displayClientName = clientData ? (clientData.trading_name || clientData.name) : '';

    // Cálculo dos totais
    const totals = useMemo(() => {
        return missions.reduce((acc, m) => {
            const revenue = m.revenue_value || 0; 
            const tolls = m.toll_value || 0;
            const cost = m.cost_value || 0;
            return {
                tolls: acc.tolls + tolls,
                revenue: acc.revenue + revenue,
                cost: acc.cost + cost,
                total: acc.total + (revenue + tolls)
            };
        }, { tolls: 0, revenue: 0, cost: 0, total: 0 });
    }, [missions]);

    // Dados para Dashboards
    const analytics = useMemo(() => {
        // 1. Volume por Dia
        const dailyVolume: Record<string, number> = {};
        missions.forEach(m => {
            const d = new Date(m.start_time).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            dailyVolume[d] = (dailyVolume[d] || 0) + 1;
        });
        const dailyChart = Object.entries(dailyVolume).map(([label, value]) => ({ label, value }));

        // 2. Top Destinos
        const destinations: Record<string, number> = {};
        missions.forEach(m => {
            const dest = (m.destination || 'N/A').split('-')[0].trim(); // Pega só cidade
            destinations[dest] = (destinations[dest] || 0) + 1;
        });
        const destChart = Object.entries(destinations)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value]) => ({ label, value }));

        // 3. Frota Utilizada
        const vehicles: Record<string, number> = {};
        missions.forEach(m => {
            const plate = m.company_vehicle?.plate || m.vehicle_id || 'N/A';
            vehicles[plate] = (vehicles[plate] || 0) + 1;
        });
        const vehicleChart = Object.entries(vehicles)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value]) => ({ label, value }));

        return { dailyChart, destChart, vehicleChart };
    }, [missions]);

    // Componente de Barra Simples (Para impressão sem libs externas)
    const SimpleBar = ({ label, value, max, color = 'bg-blue-600' }: any) => (
        <div className="flex items-center gap-2 mb-1">
            <span className="text-[8px] font-bold w-20 truncate uppercase text-right">{label}</span>
            <div className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${(value / max) * 100}%` }}></div>
            </div>
            <span className="text-[8px] font-mono font-black w-6">{value}</span>
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in pb-20 relative">
            <style>{`
                @media print {
                    @page { size: landscape; margin: 5mm; }
                    body * { visibility: hidden; }
                    #print-area, #print-area * { visibility: visible; }
                    #print-area { position: absolute; left: 0; top: 0; width: 100%; min-width: 100%; }
                    .no-print { display: none !important; }
                    .print-text { font-size: 9px !important; }
                    .page-break { page-break-before: always; }
                    .dash-card { border: 1px solid #000; padding: 10px; border-radius: 4px; }
                }
            `}</style>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                            <FileText className="text-blue-700" /> Boletim de Medição Final
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Relatório detalhado para conferência e faturamento.</p>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-1">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Cliente</label>
                            <select 
                                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 bg-white uppercase font-bold"
                                value={selectedClient}
                                onChange={e => setSelectedClient(e.target.value)}
                            >
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
                        <div className="flex gap-2">
                            <button onClick={handleGenerate} disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                {isLoading ? <Loader2 size={18} className="animate-spin"/> : <Search size={18}/>} Gerar
                            </button>
                            {reportGenerated && (
                                <button onClick={handlePrint} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                    <Printer size={18}/> Imprimir
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {reportGenerated && (
                <div id="print-area" className="bg-white p-2 min-h-[210mm] w-full border border-black/5 rounded-lg">
                    {/* CABEÇALHO PÁGINA 1 */}
                    <div className="mb-4 border-b-2 border-black pb-2 flex justify-between items-end">
                         <div className="flex items-center gap-4">
                            <img src="/logo.png" alt="TMSEG" className="h-12 object-contain" />
                            <div>
                                <h1 className="text-xl font-black uppercase tracking-tighter text-gray-900 leading-none">Boletim de Medição</h1>
                                <p className="text-[10px] font-bold text-gray-600 uppercase mt-1">CLIENTE: <span className="text-black text-sm">{displayClientName}</span></p>
                                <p className="text-[10px] text-gray-400 font-mono">PERÍODO: {formatDateDisplay(startDate)} A {formatDateDisplay(endDate)}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="bg-gray-100 text-black px-2 py-0.5 rounded text-[8px] font-black uppercase border border-gray-300">PÁGINA 01 / 02</span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-[10px] text-left border-collapse font-sans uppercase print-text">
                            <thead>
                                <tr className="bg-gray-200 text-black font-bold border border-black text-center">
                                    <th className="border border-black p-1" rowSpan={2}>Nº OS</th>
                                    <th className="border border-black p-1" rowSpan={2}>STATUS</th>
                                    <th className="border border-black p-1" rowSpan={2}>CLIENTE</th>
                                    <th className="border border-black p-1" colSpan={2}>INÍCIO</th>
                                    <th className="border border-black p-1" colSpan={2}>TÉRMINO</th>
                                    <th className="border border-black p-1" rowSpan={2}>VIATURA</th>
                                    <th className="border border-black p-1" rowSpan={2}>PLACA CLIENTE</th>
                                    <th className="border border-black p-1" rowSpan={2}>ROTA / OPERAÇÃO</th>
                                    <th className="border border-black p-1" colSpan={3}>KM (ODÔMETRO)</th>
                                    <th className="border border-black p-1" rowSpan={2}>HORAS TOTAIS</th>
                                    <th className="border border-black p-1" colSpan={2}>FRANQUIA</th>
                                    <th className="border border-black p-1" colSpan={3}>KM EXTRA</th>
                                    <th className="border border-black p-1" colSpan={3}>HORA EXTRA</th>
                                    <th className="border border-black p-1" rowSpan={2}>ACIONAMENTO</th>
                                    <th className="border border-black p-1" rowSpan={2}>PEDÁGIO</th>
                                    <th className="border border-black p-1" rowSpan={2}>TOTAL GERAL</th>
                                </tr>
                                <tr className="bg-gray-200 text-black font-bold border border-black text-center">
                                    <th className="border border-black p-1">DATA</th>
                                    <th className="border border-black p-1">HORA</th>
                                    <th className="border border-black p-1">DATA</th>
                                    <th className="border border-black p-1">HORA</th>
                                    <th className="border border-black p-1">INICIAL</th>
                                    <th className="border border-black p-1">FINAL</th>
                                    <th className="border border-black p-1">TOTAL</th>
                                    <th className="border border-black p-1">KM</th>
                                    <th className="border border-black p-1">HR</th>
                                    <th className="border border-black p-1">QTD</th>
                                    <th className="border border-black p-1">VALOR</th>
                                    <th className="border border-black p-1">TOTAL</th>
                                    <th className="border border-black p-1">QTD</th>
                                    <th className="border border-black p-1">VALOR</th>
                                    <th className="border border-black p-1">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {missions.length === 0 ? (
                                    <tr><td colSpan={25} className="p-4 text-center font-bold text-gray-400">NENHUMA MISSÃO NO PERÍODO.</td></tr>
                                ) : (
                                    missions.map(m => {
                                        const financials = calculateMissionFinancials(m, priceTables, providerTables, clientData);
                                        const kmTotal = financials.realTraveledKm;
                                        const kmExtraQtd = financials.client.excessKm;
                                        const hrExtraQtd = financials.client.excessHours;
                                        const usedTable = priceTables.find(t => t.id.toString() === financials.client.tableId);
                                        const franchiseKm = usedTable ? usedTable.franchise_km : 0;
                                        const franchiseHours = usedTable ? usedTable.franchise_hours : 0;
                                        
                                        return (
                                            <tr key={m.id} className="hover:bg-gray-50">
                                                <td className="border border-gray-300 p-1 text-center font-bold">{m.id.replace('GTM-', '')}</td>
                                                <td className="border border-gray-300 p-1 text-center truncate max-w-[60px]">CONCLUÍDA</td>
                                                <td className="border border-gray-300 p-1 text-center truncate max-w-[80px]">{displayClientName}</td>
                                                <td className="border border-gray-300 p-1 text-center">{getDate(m.start_time)}</td>
                                                <td className="border border-gray-300 p-1 text-center">{getTime(m.start_time)}</td>
                                                <td className="border border-gray-300 p-1 text-center">{getDate(m.end_time)}</td>
                                                <td className="border border-gray-300 p-1 text-center">{getTime(m.end_time)}</td>
                                                <td className="border border-black/20 p-1 text-center font-mono">{m.company_vehicle?.plate || m.vehicle_id || '-'}</td>
                                                <td className="border border-black/20 p-1 text-center font-mono">{m.client_vehicle_data?.plate || '-'}</td>
                                                <td className="border border-black/20 p-1 text-left truncate max-w-[150px]" title={m.origin + ' > ' + m.destination}>
                                                    {m.origin?.split(',')[0]} X {m.destination?.split(',')[0]}
                                                </td>
                                                <td className="border border-gray-300 p-1 text-center">{formatNumber(m.start_km)}</td>
                                                <td className="border border-gray-300 p-1 text-center">{formatNumber(m.end_km)}</td>
                                                <td className="border border-gray-300 p-1 text-center font-bold">{formatNumber(kmTotal)}</td>
                                                <td className="border border-gray-300 p-1 text-center font-bold">{formatDecimalToTime(financials.durationHours)}</td>
                                                <td className="border border-gray-300 p-1 text-center">{franchiseKm}</td>
                                                <td className="border border-gray-300 p-1 text-center">{franchiseHours}</td>
                                                <td className="border border-gray-300 p-1 text-center">{kmExtraQtd > 0 ? formatNumber(kmExtraQtd) : '-'}</td>
                                                <td className="border border-gray-300 p-1 text-right">{kmExtraQtd > 0 ? formatMoney(financials.client.unitPriceKm) : '-'}</td>
                                                <td className="border border-gray-300 p-1 text-right font-bold">{financials.client.extraKmVal > 0 ? formatMoney(financials.client.extraKmVal) : '-'}</td>
                                                <td className="border border-gray-300 p-1 text-center">{hrExtraQtd > 0 ? formatNumber(hrExtraQtd, 2) : '-'}</td>
                                                <td className="border border-gray-300 p-1 text-right">{hrExtraQtd > 0 ? formatMoney(financials.client.unitPriceHour) : '-'}</td>
                                                <td className="border border-gray-300 p-1 text-right font-bold">{financials.client.extraHrVal > 0 ? formatMoney(financials.client.extraHrVal) : '-'}</td>
                                                <td className="border border-gray-300 p-1 text-right bg-gray-50">{formatMoney(financials.client.base)}</td>
                                                <td className="border border-gray-300 p-1 text-right">{formatMoney(m.toll_value || 0)}</td>
                                                <td className="border border-gray-300 p-1 text-right font-black bg-gray-100">
                                                    {formatMoney((m.revenue_value || 0) + (m.toll_value || 0))}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {missions.length > 0 && (
                                <tfoot className="bg-gray-900 text-white font-bold">
                                    <tr>
                                        <td colSpan={24} className="p-1 text-right uppercase">TOTAL GERAL DO PERÍODO:</td>
                                        <td className="p-1 text-right">{formatMoney(totals.total)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    
                    <div className="mt-4 flex justify-between px-10 no-print">
                        <div className="text-center border-t border-black w-64 pt-2 text-[8px] font-bold uppercase">Assinatura TMSEG</div>
                        <div className="text-center border-t border-black w-64 pt-2 text-[8px] font-bold uppercase">Assinatura Cliente</div>
                    </div>

                    {/* PÁGINA 2: DASHBOARDS */}
                    <div className="page-break"></div>
                    <div className="pt-8">
                         <div className="mb-6 border-b-2 border-black pb-2 flex justify-between items-end">
                            <div className="flex items-center gap-4">
                                <img src="/logo.png" alt="TMSEG" className="h-12 object-contain" />
                                <div>
                                    <h1 className="text-xl font-black uppercase tracking-tighter text-gray-900 leading-none">Indicadores de Performance</h1>
                                    <p className="text-[10px] font-bold text-gray-600 uppercase mt-1">ANÁLISE GERENCIAL DA OPERAÇÃO</p>
                                </div>
                            </div>
                            <span className="bg-gray-100 text-black px-2 py-0.5 rounded text-[8px] font-black uppercase border border-gray-300">PÁGINA 02 / 02</span>
                        </div>

                        {/* DASHBOARD GRID */}
                        <div className="grid grid-cols-2 gap-8">
                            
                            {/* 1. RESUMO FINANCEIRO */}
                            <div className="dash-card">
                                <h3 className="text-xs font-black uppercase mb-4 flex items-center gap-2 border-b border-black pb-1"><DollarSign size={14}/> Resumo Financeiro</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span>FATURAMENTO (SERVIÇO)</span>
                                        <span>{formatMoney(totals.revenue)}</span>
                                    </div>
                                    <div className="w-full h-4 bg-gray-200 rounded-sm overflow-hidden border border-black">
                                        <div className="h-full bg-green-600" style={{ width: '100%' }}></div>
                                    </div>
                                    
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span>REEMBOLSO DE PEDÁGIO</span>
                                        <span>{formatMoney(totals.tolls)}</span>
                                    </div>
                                    <div className="w-full h-4 bg-gray-200 rounded-sm overflow-hidden border border-black">
                                        <div className="h-full bg-blue-600" style={{ width: `${(totals.tolls / (totals.revenue || 1)) * 100}%` }}></div>
                                    </div>

                                    <div className="flex justify-between text-[10px] font-bold mt-2 pt-2 border-t border-gray-400">
                                        <span>TOTAL GERAL</span>
                                        <span className="text-lg">{formatMoney(totals.total)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. COMPOSIÇÃO DE CUSTOS */}
                            <div className="dash-card">
                                <h3 className="text-xs font-black uppercase mb-4 flex items-center gap-2 border-b border-black pb-1"><PieChart size={14}/> Composição de Valores</h3>
                                <div className="flex items-center justify-center h-32 gap-6">
                                    <div className="relative w-24 h-24 rounded-full border-4 border-gray-200 flex items-center justify-center">
                                        <div className="text-center">
                                            <span className="block text-xs font-black">{Math.round((totals.revenue / totals.total) * 100)}%</span>
                                            <span className="text-[8px] uppercase">Serviço</span>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-bold space-y-2">
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-600"></div> SERVIÇO DE ESCOLTA</div>
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-600"></div> PEDÁGIO / DESPESAS</div>
                                    </div>
                                </div>
                            </div>

                            {/* 3. VOLUME DIÁRIO */}
                            <div className="dash-card col-span-2">
                                <h3 className="text-xs font-black uppercase mb-4 flex items-center gap-2 border-b border-black pb-1"><BarChart3 size={14}/> Volume de Missões por Dia</h3>
                                <div className="flex items-end gap-1 h-32 border-b border-black pb-1">
                                    {analytics.dailyChart.map((d, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center justify-end group">
                                            <div className="w-full bg-slate-800 hover:bg-slate-600 transition-colors relative" style={{ height: `${(d.value / Math.max(...analytics.dailyChart.map(x=>x.value))) * 100}%`, minHeight: '4px' }}>
                                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold">{d.value}</span>
                                            </div>
                                            <span className="text-[8px] font-mono mt-1 transform -rotate-45 origin-left text-gray-500">{d.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 4. TOP DESTINOS */}
                            <div className="dash-card">
                                <h3 className="text-xs font-black uppercase mb-4 flex items-center gap-2 border-b border-black pb-1"><MapPin size={14}/> Top 5 Destinos</h3>
                                <div className="space-y-2">
                                    {analytics.destChart.map((d, i) => (
                                        <SimpleBar key={i} label={d.label} value={d.value} max={analytics.destChart[0].value} color="bg-orange-600" />
                                    ))}
                                </div>
                            </div>

                            {/* 5. UTILIZAÇÃO DE FROTA */}
                            <div className="dash-card">
                                <h3 className="text-xs font-black uppercase mb-4 flex items-center gap-2 border-b border-black pb-1"><TrendingUp size={14}/> Veículos Mais Utilizados</h3>
                                <div className="space-y-2">
                                    {analytics.vehicleChart.map((v, i) => (
                                        <SimpleBar key={i} label={v.label} value={v.value} max={analytics.vehicleChart[0].value} color="bg-indigo-600" />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientBillingReport;
