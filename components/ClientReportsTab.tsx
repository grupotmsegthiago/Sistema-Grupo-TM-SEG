import React, { useState, useMemo } from 'react';
import { Mission, MissionStatus } from '../types';
import { FileText, Download, Calendar, Filter, Printer, Search, ChevronDown, MapPin, Truck, Clock, CheckCircle2, XCircle, Flag, Activity, ArrowRight } from 'lucide-react';

interface Props {
    missions: Mission[];
}

const STATUS_LABELS: Record<string, string> = {
    [MissionStatus.SOLICITED]: 'Solicitada',
    [MissionStatus.DOCUMENTATION]: 'Documentação',
    [MissionStatus.SCHEDULED]: 'Agendada',
    [MissionStatus.ORIGIN]: 'Na Origem',
    [MissionStatus.IN_TRANSIT]: 'Em Viagem',
    [MissionStatus.COMPLETED]: 'Concluída',
    [MissionStatus.CANCELLED]: 'Cancelada',
    [MissionStatus.REFUSED]: 'Recusada',
};

const STATUS_COLORS: Record<string, string> = {
    [MissionStatus.IN_TRANSIT]: 'bg-purple-100 text-purple-800 border-purple-200',
    [MissionStatus.COMPLETED]: 'bg-green-100 text-green-800 border-green-200',
    [MissionStatus.SCHEDULED]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [MissionStatus.CANCELLED]: 'bg-red-100 text-red-800 border-red-200',
    [MissionStatus.REFUSED]: 'bg-red-200 text-red-900 border-red-300',
    [MissionStatus.SOLICITED]: 'bg-pink-100 text-pink-800 border-pink-200',
    [MissionStatus.DOCUMENTATION]: 'bg-blue-100 text-blue-800 border-blue-200',
    [MissionStatus.ORIGIN]: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

const formatDate = (d: string) => {
    if (!d) return '---';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const formatDateTime = (d: string) => {
    if (!d) return '---';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ClientReportsTab: React.FC<Props> = ({ missions }) => {
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = useMemo(() => {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        return missions.filter(m => {
            const d = new Date(m.startTime || m.createdAt);
            if (d < start || d > end) return false;
            if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                if (!(m.id || '').toLowerCase().includes(s) &&
                    !(m.origin || '').toLowerCase().includes(s) &&
                    !(m.destination || '').toLowerCase().includes(s) &&
                    !(m.clientVehicle?.plate || '').toLowerCase().includes(s) &&
                    !(m.driver_name || '').toLowerCase().includes(s)) return false;
            }
            return true;
        });
    }, [missions, startDate, endDate, statusFilter, searchTerm]);

    const summary = useMemo(() => {
        const total = filtered.length;
        const completed = filtered.filter(m => m.status === MissionStatus.COMPLETED).length;
        const cancelled = filtered.filter(m => m.status === MissionStatus.CANCELLED).length;
        const inTransit = filtered.filter(m => m.status === MissionStatus.IN_TRANSIT).length;
        const totalKm = filtered.reduce((s, m) => s + (m.totalDistance || 0), 0);
        return { total, completed, cancelled, inTransit, totalKm };
    }, [filtered]);

    const handlePrint = () => {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Missões</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #1e293b; font-size: 11px; }
            h1 { font-size: 18px; color: #b91c1c; border-bottom: 3px solid #b91c1c; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 2px; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
            .header-info div { text-align: center; }
            .header-info .label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; }
            .header-info .value { font-size: 20px; font-weight: 900; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #0f172a; color: white; padding: 8px 6px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; }
            td { padding: 6px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
            tr:nth-child(even) { background: #f8fafc; }
            .status { padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 9px; text-transform: uppercase; }
            .status-completed { background: #dcfce7; color: #166534; }
            .status-cancelled { background: #fee2e2; color: #991b1b; }
            .status-transit { background: #ede9fe; color: #5b21b6; }
            .status-other { background: #f1f5f9; color: #475569; }
            .footer { margin-top: 20px; padding-top: 10px; border-top: 2px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
            @media print { body { margin: 10px; } }
        </style></head><body>
        <h1>Relatório de Operações</h1>
        <div class="header-info">
            <div><div class="label">Período</div><div class="value" style="font-size:13px">${formatDate(startDate)} a ${formatDate(endDate)}</div></div>
            <div><div class="label">Total</div><div class="value">${summary.total}</div></div>
            <div><div class="label">Concluídas</div><div class="value" style="color:#059669">${summary.completed}</div></div>
            <div><div class="label">Canceladas</div><div class="value" style="color:#dc2626">${summary.cancelled}</div></div>
            <div><div class="label">KM Total</div><div class="value">${Math.round(summary.totalKm).toLocaleString('pt-BR')}</div></div>
        </div>
        <table>
            <thead><tr><th>OS</th><th>Data</th><th>Origem</th><th>Destino</th><th>Veículo</th><th>Motorista</th><th>KM</th><th>Tipo</th><th>Status</th></tr></thead>
            <tbody>
            ${filtered.map(m => {
                const statusClass = m.status === MissionStatus.COMPLETED ? 'status-completed' :
                    m.status === MissionStatus.CANCELLED ? 'status-cancelled' :
                    m.status === MissionStatus.IN_TRANSIT ? 'status-transit' : 'status-other';
                return `<tr>
                    <td style="font-weight:800">${m.id}</td>
                    <td>${formatDate(m.startTime || m.createdAt)}</td>
                    <td>${(m.origin || '---').split(',')[0]}</td>
                    <td>${(m.destination || '---').split(',')[0]}</td>
                    <td>${m.clientVehicle?.plate || '---'}</td>
                    <td>${m.driver_name || '---'}</td>
                    <td style="text-align:right">${m.totalDistance ? Math.round(m.totalDistance) : '---'}</td>
                    <td>${m.mission_type || '---'}</td>
                    <td><span class="status ${statusClass}">${STATUS_LABELS[m.status] || m.status}</span></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>
        <div class="footer">Grupo TMSEG &middot; Intermediadora de Escolta Armada & Segurança Patrimonial &middot; Gerado em ${new Date().toLocaleString('pt-BR')}</div>
        </body></html>`;
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    };

    const handleExportCSV = () => {
        const header = 'OS;Data;Origem;Destino;Veículo;Motorista;KM;Tipo;Status\n';
        const rows = filtered.map(m =>
            `${m.id};${formatDate(m.startTime || m.createdAt)};${(m.origin || '').split(',')[0]};${(m.destination || '').split(',')[0]};${m.clientVehicle?.plate || ''};${m.driver_name || ''};${m.totalDistance ? Math.round(m.totalDistance) : ''};${m.mission_type || ''};${STATUS_LABELS[m.status] || m.status}`
        ).join('\n');
        const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `relatorio_missoes_${startDate}_${endDate}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-5 mb-6 animate-in fade-in duration-500" data-testid="client-reports-tab">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-700 text-white rounded-lg"><FileText size={16} /></div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Relatório de Operações</h3>
                            <p className="text-[11px] font-bold text-gray-400">{filtered.length} registros encontrados</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-[11px] font-black uppercase hover:bg-gray-800 transition-all active:scale-95" data-testid="button-print-report"><Printer size={13} /> Imprimir</button>
                        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-[11px] font-black uppercase hover:bg-red-800 transition-all active:scale-95" data-testid="button-export-csv"><Download size={13} /> Exportar CSV</button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <Calendar size={14} className="text-gray-500 ml-1" />
                        <input type="date" className="bg-transparent text-xs font-bold text-gray-700 outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span className="text-gray-400 text-xs font-bold">a</span>
                        <input type="date" className="bg-transparent text-xs font-bold text-gray-700 outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <div className="relative">
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-xs font-bold text-gray-700 outline-none">
                            <option value="ALL">Todos os Status</option>
                            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    <div className="relative flex-1 max-w-xs">
                        <input type="text" placeholder="OS, placa, motorista..." className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} data-testid="input-report-search" />
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                    <div className="bg-gray-900 text-white p-3 rounded-lg text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Total</p>
                        <p className="text-xl font-black font-mono">{summary.total}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-green-600">Concluídas</p>
                        <p className="text-xl font-black font-mono text-green-700">{summary.completed}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-600">Em Trânsito</p>
                        <p className="text-xl font-black font-mono text-purple-700">{summary.inTransit}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-red-600">Canceladas</p>
                        <p className="text-xl font-black font-mono text-red-700">{summary.cancelled}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">KM Total</p>
                        <p className="text-xl font-black font-mono text-blue-700">{Math.round(summary.totalKm).toLocaleString('pt-BR')}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full" data-testid="table-client-report">
                        <thead>
                            <tr className="bg-gray-900 text-white">
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">OS</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Data</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Origem</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Destino</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Veículo</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Motorista</th>
                                <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest">KM</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Tipo</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                                    <Activity size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm font-bold">Nenhuma missão encontrada para este filtro.</p>
                                </td></tr>
                            ) : filtered.map((m, i) => (
                                <tr key={m.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`} data-testid={`row-report-${m.id}`}>
                                    <td className="px-4 py-3 text-[11px] font-black text-gray-900">{m.id}</td>
                                    <td className="px-4 py-3 text-[11px] font-bold text-gray-600">{formatDate(m.startTime || m.createdAt)}</td>
                                    <td className="px-4 py-3 text-[10px] font-bold text-gray-700 max-w-[150px] truncate" title={m.origin}>{(m.origin || '---').split(',')[0]}</td>
                                    <td className="px-4 py-3 text-[10px] font-bold text-gray-700 max-w-[150px] truncate" title={m.destination}>{(m.destination || '---').split(',')[0]}</td>
                                    <td className="px-4 py-3 text-[11px] font-black text-gray-800">{m.clientVehicle?.plate || '---'}</td>
                                    <td className="px-4 py-3 text-[10px] font-bold text-gray-700">{m.driver_name || '---'}</td>
                                    <td className="px-4 py-3 text-[11px] font-bold text-gray-600 text-right font-mono">{m.totalDistance ? Math.round(m.totalDistance).toLocaleString('pt-BR') : '---'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                            (m.mission_type || '').includes('Velada') ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-red-50 text-red-700 border-red-200'
                                        }`}>{m.mission_type || 'Caracterizada'}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                            {STATUS_LABELS[m.status] || m.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClientReportsTab;
