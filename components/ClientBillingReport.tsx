
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { FileText, Search, Printer, Loader2 } from 'lucide-react';
import { calculateMissionFinancials } from '../lib/financialUtils';

const ClientBillingReport: React.FC = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [missions, setMissions] = useState<any[]>([]);
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
            const clientData = clients.find(c => c.id.toString() === selectedClient);
            const clientName = clientData?.name;
            const { data: missionData, error } = await supabase
                .from('missions')
                .select('*, client_vehicle_data:client_vehicles(*), company_vehicle:vehicles(*)')
                .eq('client', clientName)
                .eq('billing_approved', true)
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .neq('status', 'Cancelada')
                .order('created_at', { ascending: true });
            if (error) throw error;
            const [ptRes, pctRes] = await Promise.all([
                supabase.from('client_price_tables').select('*').eq('client', clientName),
                supabase.from('provider_cost_tables').select('*')
            ]);
            setPriceTables(ptRes.data as ClientPriceTable[] || []);
            setProviderTables(pctRes.data as any || []);
            setMissions(missionData || []);
            setReportGenerated(true);
        } catch (err) {
            console.error(err);
            alert("Erro ao gerar relatório.");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = () => { window.print(); };

    const fmtMoney = (val: number | null | undefined) => (val ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtNum = (val: number | null | undefined, dec = 0) => (val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '-';
    const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const fmtDateDisplay = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
    const fmtDecToTime = (h: number) => {
        if (isNaN(h) || h <= 0) return '00:00';
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    const clientData = clients.find(c => c.id.toString() === selectedClient);
    const displayClientName = clientData ? (clientData.trading_name || clientData.name) : '';

    const getPeriodLabel = () => {
        if (!startDate || !endDate) return '';
        const sDate = new Date(startDate + 'T12:00:00');
        const eDate = new Date(endDate + 'T12:00:00');
        const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        const month = months[sDate.getMonth()];
        const year = sDate.getFullYear();
        const sDay = sDate.getDate();
        const eDay = eDate.getDate();
        if (sDay === 1 && eDay === 15) return `GERAL - ${month} /${year} - 1ª QUINZENA DE ${month}`;
        if (sDay === 16) return `GERAL - ${month} /${year} - 2ª QUINZENA DE ${month}`;
        return `GERAL - ${month} /${year} - ${fmtDateDisplay(startDate)} A ${fmtDateDisplay(endDate)}`;
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
            const operationType = usedTable?.operation_type || m.operation_type || 'CARACTERIZADA';
            const region = m.region || '-';
            const route = m.origin && m.destination
                ? `${(m.origin || '').split(',')[0].trim()} X ${(m.destination || '').split(',')[0].trim()}`
                : (usedTable?.route_name || '-');

            const kmTotal = fin.realTraveledKm;
            const kmExtraQtd = fin.client.excessKm;
            const kmExtraTotal = fin.client.extraKmVal;
            const hrExtraQtd = fin.client.excessHours;
            const hrExtraTotal = fin.client.extraHrVal;
            const durationHours = fin.durationHours;

            const escoltaVal = activationFee;
            const tollVal = m.toll_value || 0;
            const totalGeral = (m.revenue_value || 0) + tollVal;

            return {
                id: (m.id || '').replace('GTM-', ''),
                route: usedTable?.route_name || route,
                client: displayClientName,
                operationType,
                activationFee,
                franchiseHours,
                franchiseKm,
                unitHr,
                unitKm,
                tollLabel: tollVal > 0 ? 'À PARTE' : '-',
                status: 'CONCLUÍDO',
                startDate: fmtDate(m.start_time),
                startTime: fmtTime(m.start_time),
                region,
                routeDetail: route,
                viatura: m.company_vehicle?.plate || m.vehicle_id || '-',
                clientPlate: m.client_vehicle_data?.plate || m.clientVehicle?.plate || '-',
                endDate: fmtDate(m.end_time),
                endTime: fmtTime(m.end_time),
                kmStart: m.start_km ?? 0,
                kmEnd: m.end_km ?? 0,
                kmTotal,
                timeStart: fmtTime(m.start_time),
                timeEnd: fmtTime(m.end_time),
                timeTotal: fmtDecToTime(durationHours),
                kmExtraQtd,
                kmExtraUnit: unitKm,
                kmExtraTotal,
                hrExtraQtd,
                hrExtraUnit: unitHr,
                hrExtraTotal,
                escoltaVal,
                tollVal,
                totalGeral
            };
        });
    }, [missions, priceTables, providerTables, clientData, displayClientName]);

    const grandTotal = useMemo(() => rowsData.reduce((s, r) => s + r.totalGeral, 0), [rowsData]);

    const TH = "border border-black p-1 text-center text-[8px] font-black uppercase bg-gray-200 text-black";
    const TD = "border border-gray-400 p-0.5 text-center text-[8px] font-medium";
    const TDR = "border border-gray-400 p-0.5 text-right text-[8px] font-medium";
    const TDB = "border border-gray-400 p-0.5 text-center text-[8px] font-bold";

    return (
        <div className="space-y-6 animate-fade-in pb-20 relative">
            <style>{`
                @media print {
                    @page { size: landscape; margin: 4mm; }
                    body * { visibility: hidden; }
                    #print-area, #print-area * { visibility: visible; }
                    #print-area { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
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
                        <div className="flex gap-2">
                            <button onClick={handleGenerate} disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Gerar
                            </button>
                            {reportGenerated && (
                                <button onClick={handlePrint} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                    <Printer size={18} /> Imprimir
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {reportGenerated && (
                <div id="print-area" className="bg-white p-3 w-full border border-gray-200 rounded-lg overflow-x-auto">
                    <div className="mb-2 text-center">
                        <h1 className="text-sm font-black uppercase tracking-wide">BOLETIM DE MEDIÇÃO</h1>
                        <p className="text-[9px] font-bold uppercase text-gray-700">{getPeriodLabel()}</p>
                        <p className="text-[8px] font-bold uppercase text-gray-500 mt-0.5">REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS</p>
                    </div>

                    <table className="w-full border-collapse" style={{ fontSize: '8px' }}>
                        <thead>
                            <tr>
                                <th className={TH} colSpan={11}>TABELA ACORDADA</th>
                                <th className={TH} colSpan={8}>INFORMAÇÕES DA VIAGEM</th>
                                <th className={TH} colSpan={3}>KILOMETRAGEM</th>
                                <th className={TH} colSpan={3}>HORÁRIOS</th>
                                <th className={TH} colSpan={3}>KM EXCEDENTE</th>
                                <th className={TH} colSpan={3}>HORA EXCEDENTE</th>
                                <th className={TH} colSpan={3}>VALORES</th>
                            </tr>
                            <tr>
                                <th className={TH}>Nº</th>
                                <th className={TH}>ROTA</th>
                                <th className={TH}>CLIENTE</th>
                                <th className={TH}>OPERAÇÃO</th>
                                <th className={TH}>VALOR</th>
                                <th className={TH}>HR FRANQ</th>
                                <th className={TH}>KM FRANQ</th>
                                <th className={TH}>HR EXTRA</th>
                                <th className={TH}>KM EXTRA</th>
                                <th className={TH}>PEDÁGIO</th>
                                <th className={TH}>STATUS</th>
                                <th className={TH}>DATA INICIAL</th>
                                <th className={TH}>HORA INICIAL</th>
                                <th className={TH}>REF.</th>
                                <th className={TH}>ROTA</th>
                                <th className={TH}>VIATURA</th>
                                <th className={TH}>VEÍC. ESCOLTADO</th>
                                <th className={TH}>DATA FINAL</th>
                                <th className={TH}>HORA FINAL</th>
                                <th className={TH}>INICIAL</th>
                                <th className={TH}>FINAL</th>
                                <th className={TH}>TOTAL</th>
                                <th className={TH}>INICIAL</th>
                                <th className={TH}>FINAL</th>
                                <th className={TH}>TOTAL</th>
                                <th className={TH}>KM</th>
                                <th className={TH}>VALOR</th>
                                <th className={TH}>TOTAL</th>
                                <th className={TH}>HORA</th>
                                <th className={TH}>VALOR</th>
                                <th className={TH}>TOTAL</th>
                                <th className={TH}>ESCOLTA</th>
                                <th className={TH}>PEDÁGIO</th>
                                <th className={TH}>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rowsData.length === 0 ? (
                                <tr><td colSpan={34} className="p-4 text-center font-bold text-gray-400 text-xs">NENHUMA MISSÃO NO PERÍODO.</td></tr>
                            ) : (
                                rowsData.map((r, i) => (
                                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className={TDB}>{r.id}</td>
                                        <td className={`${TD} text-left max-w-[100px] truncate`} title={r.route}>{r.route}</td>
                                        <td className={`${TD} max-w-[60px] truncate`}>{r.client}</td>
                                        <td className={TD}>{r.operationType}</td>
                                        <td className={TDR}>{fmtNum(r.activationFee)}</td>
                                        <td className={TD}>{r.franchiseHours}</td>
                                        <td className={TD}>{r.franchiseKm}</td>
                                        <td className={TDR}>{fmtNum(r.unitHr, 2)}</td>
                                        <td className={TDR}>{fmtNum(r.unitKm, 2)}</td>
                                        <td className={TD}>{r.tollLabel}</td>
                                        <td className={TD}>{r.status}</td>
                                        <td className={TD}>{r.startDate}</td>
                                        <td className={TD}>{r.startTime}</td>
                                        <td className={TD}>{r.region}</td>
                                        <td className={`${TD} text-left max-w-[100px] truncate`} title={r.routeDetail}>{r.routeDetail}</td>
                                        <td className={`${TD} font-mono`}>{r.viatura}</td>
                                        <td className={`${TD} font-mono`}>{r.clientPlate}</td>
                                        <td className={TD}>{r.endDate}</td>
                                        <td className={TD}>{r.endTime}</td>
                                        <td className={TD}>{fmtNum(r.kmStart)}</td>
                                        <td className={TD}>{fmtNum(r.kmEnd)}</td>
                                        <td className={TDB}>{fmtNum(r.kmTotal)}</td>
                                        <td className={TD}>{r.timeStart}</td>
                                        <td className={TD}>{r.timeEnd}</td>
                                        <td className={TDB}>{r.timeTotal}</td>
                                        <td className={TD}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : '-'}</td>
                                        <td className={TDR}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraUnit, 2) : '-'}</td>
                                        <td className={TDR}>{r.kmExtraTotal > 0 ? fmtMoney(r.kmExtraTotal) : ' R$-   '}</td>
                                        <td className={TD}>{r.hrExtraQtd > 0 ? fmtNum(r.hrExtraQtd, 2) : '-'}</td>
                                        <td className={TDR}>{r.hrExtraQtd > 0 ? fmtNum(r.hrExtraUnit, 2) : '-'}</td>
                                        <td className={TDR}>{r.hrExtraTotal > 0 ? fmtMoney(r.hrExtraTotal) : ' R$-   '}</td>
                                        <td className={TDR}>{fmtNum(r.escoltaVal)}</td>
                                        <td className={TDR}>{r.tollVal > 0 ? fmtNum(r.tollVal, 2) : ' R$ -   '}</td>
                                        <td className={`${TDR} font-black bg-gray-100`}>{fmtNum(r.totalGeral, 2)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {rowsData.length > 0 && (
                            <tfoot>
                                <tr className="bg-gray-900 text-white font-black">
                                    <td colSpan={33} className="border border-black p-1 text-right text-[9px] uppercase">TOTAL</td>
                                    <td className="border border-black p-1 text-right text-[9px]">{fmtNum(grandTotal, 2)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>

                    <div className="mt-8 flex justify-between px-10">
                        <div className="text-center border-t border-black w-64 pt-2 text-[8px] font-bold uppercase">Assinatura TMSEG</div>
                        <div className="text-center border-t border-black w-64 pt-2 text-[8px] font-bold uppercase">Assinatura Cliente</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientBillingReport;
