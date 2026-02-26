
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { FileText, Search, Printer, Loader2 } from 'lucide-react';
import { calculateMissionFinancials, extractCityFromAddress } from '../lib/financialUtils';

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
                route: usedTable?.route_name || route,
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
                region: refCidades,
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

    const cellStyle: React.CSSProperties = {
        border: '1px solid #9ca3af',
        padding: '2px 4px',
        fontSize: '7.5px',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '90px'
    };
    const cellRight: React.CSSProperties = { ...cellStyle, textAlign: 'right' };
    const cellBold: React.CSSProperties = { ...cellStyle, fontWeight: 800 };
    const headerStyle: React.CSSProperties = {
        ...cellStyle,
        backgroundColor: '#e5e7eb',
        fontWeight: 900,
        fontSize: '7px',
        textTransform: 'uppercase' as const,
        color: '#000'
    };
    const groupHeaderStyle: React.CSSProperties = {
        ...headerStyle,
        backgroundColor: '#d1d5db',
        fontSize: '7.5px',
        letterSpacing: '0.5px'
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
                    @page { size: landscape; margin: 3mm; }
                    body * { visibility: hidden; }
                    #print-area, #print-area * { visibility: visible; }
                    #print-area { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                    table { table-layout: fixed; }
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
                <div id="print-area" className="bg-white p-2 w-full border border-gray-200 rounded-lg">
                    <div className="mb-2 text-center">
                        <h1 style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>BOLETIM DE MEDIÇÃO</h1>
                        <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>{getPeriodLabel()}</p>
                        <p style={{ fontSize: '7px', fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginTop: '2px' }}>REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS</p>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '32px' }} />
                                <col style={{ width: '100px' }} />
                                <col style={{ width: '55px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '45px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '110px' }} />
                                <col style={{ width: '55px' }} />
                                <col style={{ width: '55px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '42px' }} />
                                <col style={{ width: '42px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '32px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '55px' }} />
                                <col style={{ width: '38px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '55px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '62px' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th style={groupHeaderStyle} colSpan={9}>TABELA ACORDADA</th>
                                    <th style={groupHeaderStyle} colSpan={7}>INFORMAÇÕES DA VIAGEM</th>
                                    <th style={grpKm} colSpan={3}>KILOMETRAGEM</th>
                                    <th style={grpHr} colSpan={3}>HORÁRIOS</th>
                                    <th style={grpKmExc} colSpan={3}>KM EXCEDENTE</th>
                                    <th style={grpHrExc} colSpan={3}>HORA EXCEDENTE</th>
                                    <th style={grpVal} colSpan={3}>VALORES</th>
                                </tr>
                                <tr>
                                    <th style={headerStyle}>Nº</th>
                                    <th style={headerStyle}>ROTA</th>
                                    <th style={headerStyle}>VALOR</th>
                                    <th style={headerStyle}>HR FRANQ</th>
                                    <th style={headerStyle}>KM FRANQ</th>
                                    <th style={headerStyle}>HR EXTRA</th>
                                    <th style={headerStyle}>KM EXTRA</th>
                                    <th style={headerStyle}>PEDÁGIO</th>
                                    <th style={headerStyle}>STATUS</th>
                                    <th style={headerStyle}>DATA INÍCIO</th>
                                    <th style={headerStyle}>HORA INÍCIO</th>
                                    <th style={headerStyle}>REF.</th>
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
                                    <tr><td colSpan={31} style={{ ...cellStyle, padding: '16px', fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>NENHUMA MISSÃO NO PERÍODO.</td></tr>
                                ) : (
                                    rowsData.map((r, i) => (
                                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                            <td style={cellBold}>{r.id}</td>
                                            <td style={cellStyle} title={r.route}>{r.route}</td>
                                            <td style={cellRight}>{fmtBRL(r.activationFee)}</td>
                                            <td style={cellStyle}>{r.franchiseHoursFmt}</td>
                                            <td style={cellStyle}>{fmtNum(r.franchiseKm)}</td>
                                            <td style={cellRight}>{fmtBRL(r.unitHr)}</td>
                                            <td style={cellRight}>{fmtBRL(r.unitKm)}</td>
                                            <td style={cellStyle}>{r.tollLabel}</td>
                                            <td style={cellStyle}>{r.status}</td>
                                            <td style={cellStyle}>{r.startDate}</td>
                                            <td style={cellStyle}>{r.startTime}</td>
                                            <td style={cellStyle}>{r.region}</td>
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
                                        <td colSpan={30} style={{ ...cellStyle, textAlign: 'right', fontWeight: 900, fontSize: '8px', color: '#fff', border: '1px solid #000' }}>TOTAL</td>
                                        <td style={{ ...cellRight, fontWeight: 900, fontSize: '9px', color: '#fff', border: '1px solid #000' }}>{fmtBRL(grandTotal)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between', padding: '0 40px' }}>
                        <div style={{ textAlign: 'center', borderTop: '1px solid #000', width: '250px', paddingTop: '8px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' }}>Assinatura TMSEG</div>
                        <div style={{ textAlign: 'center', borderTop: '1px solid #000', width: '250px', paddingTop: '8px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' }}>Assinatura Cliente</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientBillingReport;
