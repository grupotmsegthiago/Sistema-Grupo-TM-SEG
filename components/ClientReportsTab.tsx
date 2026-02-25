import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Mission, MissionStatus } from '../types';
import { FileText, Download, Calendar, Printer, Search, ChevronDown, Activity, Eye, Plus, X, Check, Save, Loader2 } from 'lucide-react';

interface Props {
    missions: Mission[];
    onViewReport?: (mission: Mission) => void;
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

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '---';
const fmtDateTime = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';
const fmtCurrency = (v: number) => v ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
const fmtNum = (v: number | undefined | null) => v ? Math.round(v).toLocaleString('pt-BR') : '---';

function calcHours(start?: string, end?: string): string {
    if (!start || !end) return '---';
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
    if (diff <= 0) return '---';
    const h = Math.floor(diff);
    const m = Math.round((diff - h) * 60);
    return `${h}h${m.toString().padStart(2, '0')}`;
}

function calcHoursNum(start?: string, end?: string): number {
    if (!start || !end) return 0;
    return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3600000);
}

interface RegistryItem { id: number; name: string; client_id: string; type: string }
interface MissionNote { mission_id: string; motivo: string; contrato: string; operacao: string; tsp: string; obs: string }

const RegistryDropdown: React.FC<{
    value: string;
    onChange: (v: string) => void;
    options: RegistryItem[];
    onAdd: (name: string) => void;
    placeholder: string;
    label: string;
}> = ({ value, onChange, options, onAdd, placeholder, label }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setIsOpen(false); setShowAdd(false); } };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative" ref={ref}>
            <div className="flex items-center gap-1">
                <input
                    type="text"
                    className="w-full min-w-[100px] px-2 py-1 text-[10px] font-bold border border-gray-200 rounded bg-white outline-none focus:border-red-400 truncate"
                    placeholder={placeholder}
                    value={value || ''}
                    onClick={() => setIsOpen(true)}
                    onChange={(e) => { onChange(e.target.value); setSearch(e.target.value); setIsOpen(true); }}
                    data-testid={`input-${label.toLowerCase()}`}
                />
                <button onClick={() => { setShowAdd(!showAdd); setIsOpen(false); }} className="p-0.5 text-red-600 hover:bg-red-50 rounded shrink-0" title={`Cadastrar ${label}`} data-testid={`btn-add-${label.toLowerCase()}`}>
                    <Plus size={12} />
                </button>
            </div>
            {isOpen && filtered.length > 0 && (
                <div className="absolute z-50 top-full left-0 mt-1 w-48 max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl">
                    {filtered.map(o => (
                        <button key={o.id} onClick={() => { onChange(o.name); setIsOpen(false); setSearch(''); }} className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-gray-700 hover:bg-red-50 hover:text-red-800 transition-colors truncate">
                            {o.name}
                        </button>
                    ))}
                </div>
            )}
            {showAdd && (
                <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl p-2">
                    <p className="text-[9px] font-black text-gray-500 uppercase mb-1.5">Novo {label}</p>
                    <div className="flex items-center gap-1">
                        <input type="text" className="flex-1 px-2 py-1 text-[10px] font-bold border border-gray-200 rounded outline-none focus:border-red-400" placeholder={`Nome do ${label}...`} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { onAdd(newName.trim()); setNewName(''); setShowAdd(false); } }} autoFocus />
                        <button onClick={() => { if (newName.trim()) { onAdd(newName.trim()); setNewName(''); setShowAdd(false); } }} className="p-1 bg-red-700 text-white rounded hover:bg-red-800"><Check size={10} /></button>
                        <button onClick={() => { setShowAdd(false); setNewName(''); }} className="p-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"><X size={10} /></button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ClientReportsTab: React.FC<Props> = ({ missions, onViewReport }) => {
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [clientId, setClientId] = useState<string>('');

    const [contratos, setContratos] = useState<RegistryItem[]>([]);
    const [operacoes, setOperacoes] = useState<RegistryItem[]>([]);
    const [tsps, setTsps] = useState<RegistryItem[]>([]);
    const [notes, setNotes] = useState<Record<string, MissionNote>>({});
    const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
    const [registriesLoaded, setRegistriesLoaded] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('userData');
            if (stored) {
                const user = JSON.parse(stored);
                const cId = user.clientId || user.client_id || '';
                setClientId(cId);
            }
        } catch (e) { console.error(e); }
    }, []);

    const fetchRegistries = useCallback(async () => {
        if (!clientId) return;
        try {
            const [c, o, t] = await Promise.all([
                fetch(`/api/client-registries/${encodeURIComponent(clientId)}/contrato`).then(r => r.json()),
                fetch(`/api/client-registries/${encodeURIComponent(clientId)}/operacao`).then(r => r.json()),
                fetch(`/api/client-registries/${encodeURIComponent(clientId)}/tsp`).then(r => r.json()),
            ]);
            setContratos(Array.isArray(c) ? c : []);
            setOperacoes(Array.isArray(o) ? o : []);
            setTsps(Array.isArray(t) ? t : []);
        } catch (e) { console.error(e); }
    }, [clientId]);

    const fetchNotes = useCallback(async () => {
        if (!clientId) return;
        try {
            const data = await fetch(`/api/client-mission-notes/bulk/${encodeURIComponent(clientId)}`).then(r => r.json());
            if (Array.isArray(data)) {
                const map: Record<string, MissionNote> = {};
                data.forEach((n: any) => { map[n.mission_id] = n; });
                setNotes(map);
            }
        } catch (e) { console.error(e); }
        setRegistriesLoaded(true);
    }, [clientId]);

    useEffect(() => {
        if (clientId) {
            fetch('/api/client-registries/init', { method: 'POST' }).catch(() => {});
            fetchRegistries();
            fetchNotes();
        }
    }, [clientId, fetchRegistries, fetchNotes]);

    const addRegistry = async (type: string, name: string) => {
        if (!clientId) return;
        try {
            await fetch('/api/client-registries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, type, name })
            });
            fetchRegistries();
        } catch (e) { console.error(e); }
    };

    const saveNote = async (missionId: string, field: string, value: string) => {
        if (!clientId) return;
        const current = notes[missionId] || { mission_id: missionId, motivo: '', contrato: '', operacao: '', tsp: '', obs: '' };
        const updated = { ...current, [field]: value };
        setNotes(prev => ({ ...prev, [missionId]: updated }));
        setSavingNotes(prev => ({ ...prev, [missionId]: true }));
        try {
            await fetch('/api/client-mission-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mission_id: missionId, client_id: clientId, ...updated })
            });
        } catch (e) { console.error(e); }
        setTimeout(() => setSavingNotes(prev => ({ ...prev, [missionId]: false })), 500);
    };

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
        }).sort((a, b) => new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime());
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
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Operações</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 15px; color: #1e293b; font-size: 9px; }
            h1 { font-size: 16px; color: #b91c1c; border-bottom: 3px solid #b91c1c; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 2px; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 15px; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
            .header-info div { text-align: center; }
            .header-info .label { font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; }
            .header-info .value { font-size: 16px; font-weight: 900; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #0f172a; color: white; padding: 5px 4px; text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 800; white-space: nowrap; }
            th.green { background: #166534; }
            td { padding: 4px; border-bottom: 1px solid #e2e8f0; font-size: 8px; white-space: nowrap; }
            tr:nth-child(even) { background: #f8fafc; }
            .status { padding: 1px 6px; border-radius: 3px; font-weight: 800; font-size: 7px; text-transform: uppercase; }
            .footer { margin-top: 15px; padding-top: 8px; border-top: 2px solid #e2e8f0; font-size: 8px; color: #94a3b8; text-align: center; }
            @media print { body { margin: 5px; } @page { size: landscape; margin: 10mm; } }
        </style></head><body>
        <h1>Relatório de Operações</h1>
        <div class="header-info">
            <div><div class="label">Período</div><div class="value" style="font-size:11px">${fmtDate(startDate)} a ${fmtDate(endDate)}</div></div>
            <div><div class="label">Total</div><div class="value">${summary.total}</div></div>
            <div><div class="label">Concluídas</div><div class="value" style="color:#059669">${summary.completed}</div></div>
            <div><div class="label">Canceladas</div><div class="value" style="color:#dc2626">${summary.cancelled}</div></div>
            <div><div class="label">KM Total</div><div class="value">${Math.round(summary.totalKm).toLocaleString('pt-BR')}</div></div>
        </div>
        <table>
            <thead><tr>
                <th>OS</th><th>Data Início</th><th>Data Fim</th><th>Origem</th><th>Destino</th><th>Veículo</th><th>Motorista</th><th>Tipo</th><th>Status</th>
                <th>Motivo</th><th>Contrato</th><th>Operação</th><th>TSP</th>
                <th class="green">KM Início</th><th class="green">KM Fim</th><th class="green">KM Rodado</th>
                <th class="green">HRS Trab.</th><th class="green">Pedágio</th>
                <th class="green">R$ Total</th><th class="green">OBS</th>
            </tr></thead>
            <tbody>
            ${filtered.map(m => {
                const n = notes[m.id] || {};
                const kmRodado = (m.endKm && m.startKm) ? m.endKm - m.startKm : (m.totalDistance || 0);
                return `<tr>
                    <td style="font-weight:800">${m.id}</td>
                    <td>${fmtDate(m.startTime || m.createdAt)}</td>
                    <td>${fmtDate(m.endTime || '')}</td>
                    <td>${(m.origin || '---').split(',')[0]}</td>
                    <td>${(m.destination || '---').split(',')[0]}</td>
                    <td>${m.clientVehicle?.plate || '---'}</td>
                    <td>${m.driver_name || '---'}</td>
                    <td>${m.mission_type || '---'}</td>
                    <td>${STATUS_LABELS[m.status] || m.status}</td>
                    <td>${(n as any).motivo || ''}</td>
                    <td>${(n as any).contrato || ''}</td>
                    <td>${(n as any).operacao || ''}</td>
                    <td>${(n as any).tsp || ''}</td>
                    <td style="text-align:right">${fmtNum(m.startKm)}</td>
                    <td style="text-align:right">${fmtNum(m.endKm)}</td>
                    <td style="text-align:right">${fmtNum(kmRodado)}</td>
                    <td>${calcHours(m.startTime, m.endTime)}</td>
                    <td style="text-align:right">${m.toll_value ? fmtCurrency(m.toll_value) : '---'}</td>
                    <td style="text-align:right">${m.revenue_value ? fmtCurrency(m.revenue_value) : '---'}</td>
                    <td>${(n as any).obs || ''}</td>
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
        const header = 'OS;Data Início;Data Fim;Origem;Destino;Veículo;Motorista;Tipo;Status;Motivo;Contrato;Operação;TSP;KM Início;KM Fim;KM Rodado;HRS Trabalhada;Pedágio;R$ Total;OBS\n';
        const rows = filtered.map(m => {
            const n = notes[m.id] || {} as any;
            const kmRodado = (m.endKm && m.startKm) ? m.endKm - m.startKm : (m.totalDistance || 0);
            return `${m.id};${fmtDate(m.startTime || m.createdAt)};${fmtDate(m.endTime || '')};${(m.origin || '').split(',')[0]};${(m.destination || '').split(',')[0]};${m.clientVehicle?.plate || ''};${m.driver_name || ''};${m.mission_type || ''};${STATUS_LABELS[m.status] || m.status};${n.motivo || ''};${n.contrato || ''};${n.operacao || ''};${n.tsp || ''};${m.startKm || ''};${m.endKm || ''};${Math.round(kmRodado)};${calcHours(m.startTime, m.endTime)};${m.toll_value || ''};${m.revenue_value || ''};${n.obs || ''}`;
        }).join('\n');
        const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `relatorio_operacoes_${startDate}_${endDate}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
    const handleNoteChange = (missionId: string, field: string, value: string) => {
        const current = notes[missionId] || { mission_id: missionId, motivo: '', contrato: '', operacao: '', tsp: '', obs: '' };
        setNotes(prev => ({ ...prev, [missionId]: { ...current, [field]: value } }));
        const key = `${missionId}-${field}`;
        if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
        debounceTimers.current[key] = setTimeout(() => saveNote(missionId, field, value), 800);
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
                        <input type="text" placeholder="OS, placa, motorista, origem..." className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} data-testid="input-report-search" />
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
                <div className="overflow-x-auto" style={{ maxHeight: '70vh' }}>
                    <table className="w-full border-collapse" data-testid="table-client-report">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap sticky left-0 z-20 min-w-[50px]"></th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap sticky left-[50px] z-20 min-w-[90px]">OS</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[85px]">Data Início</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[85px]">Data Fim</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[130px]">Origem</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[130px]">Destino</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[75px]">Veículo</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[100px]">Motorista</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[80px]">Tipo</th>
                                <th className="bg-gray-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[80px]">Status</th>
                                <th className="bg-indigo-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[120px]">Motivo</th>
                                <th className="bg-indigo-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[120px]">Contrato</th>
                                <th className="bg-indigo-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[120px]">Operação</th>
                                <th className="bg-indigo-900 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[120px]">TSP</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-right text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[75px]">KM Início</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-right text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[75px]">KM Fim</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-right text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[75px]">KM Rodado</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-center text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[75px]">HRS Trab.</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-right text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[80px]">Pedágio</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-right text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[85px]">R$ Total</th>
                                <th className="bg-green-800 text-white px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-widest whitespace-nowrap min-w-[150px]">OBS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={21} className="text-center py-12 text-gray-400">
                                    <Activity size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm font-bold">Nenhuma missão encontrada para este filtro.</p>
                                </td></tr>
                            ) : filtered.map((m, i) => {
                                const n = notes[m.id] || { mission_id: m.id, motivo: '', contrato: '', operacao: '', tsp: '', obs: '' };
                                const kmRodado = (m.endKm && m.startKm) ? m.endKm - m.startKm : (m.totalDistance || 0);
                                const isSaving = savingNotes[m.id];
                                return (
                                    <tr key={m.id} className={`border-b border-gray-100 hover:bg-yellow-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} data-testid={`row-report-${m.id}`}>
                                        <td className="px-2 py-2 sticky left-0 bg-inherit z-10">
                                            <button onClick={() => onViewReport?.(m)} className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors" title="Ver Relatório Completo" data-testid={`btn-report-${m.id}`}>
                                                <Eye size={13} />
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-[11px] font-black text-gray-900 sticky left-[50px] bg-inherit z-10 whitespace-nowrap">
                                            {m.id}
                                            {isSaving && <Loader2 size={10} className="inline ml-1 animate-spin text-red-500" />}
                                        </td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-gray-600 whitespace-nowrap">{fmtDate(m.startTime || m.createdAt)}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-gray-600 whitespace-nowrap">{fmtDate(m.endTime || '')}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-gray-700 max-w-[150px] truncate" title={m.origin}>{(m.origin || '---').split(',')[0]}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-gray-700 max-w-[150px] truncate" title={m.destination}>{(m.destination || '---').split(',')[0]}</td>
                                        <td className="px-3 py-2 text-[11px] font-black text-gray-800 whitespace-nowrap">{m.clientVehicle?.plate || '---'}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-gray-700 whitespace-nowrap max-w-[120px] truncate">{m.driver_name || '---'}</td>
                                        <td className="px-3 py-2">
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border whitespace-nowrap ${
                                                (m.mission_type || '').includes('Velada') ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-red-50 text-red-700 border-red-200'
                                            }`}>{m.mission_type || 'Caracterizada'}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border whitespace-nowrap ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                                {STATUS_LABELS[m.status] || m.status}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <input type="text" className="w-full min-w-[100px] px-2 py-1 text-[10px] font-bold border border-gray-200 rounded bg-white outline-none focus:border-indigo-400" placeholder="Motivo..." value={n.motivo || ''} onChange={e => handleNoteChange(m.id, 'motivo', e.target.value)} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <RegistryDropdown value={n.contrato || ''} onChange={v => handleNoteChange(m.id, 'contrato', v)} options={contratos} onAdd={name => addRegistry('contrato', name)} placeholder="Contrato..." label="Contrato" />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <RegistryDropdown value={n.operacao || ''} onChange={v => handleNoteChange(m.id, 'operacao', v)} options={operacoes} onAdd={name => addRegistry('operacao', name)} placeholder="Operação..." label="Operação" />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <RegistryDropdown value={n.tsp || ''} onChange={v => handleNoteChange(m.id, 'tsp', v)} options={tsps} onAdd={name => addRegistry('tsp', name)} placeholder="TSP..." label="TSP" />
                                        </td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-green-800 text-right font-mono whitespace-nowrap">{fmtNum(m.startKm)}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-green-800 text-right font-mono whitespace-nowrap">{fmtNum(m.endKm)}</td>
                                        <td className="px-3 py-2 text-[10px] font-black text-green-900 text-right font-mono whitespace-nowrap">{fmtNum(kmRodado)}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-green-800 text-center font-mono whitespace-nowrap">{calcHours(m.startTime, m.endTime)}</td>
                                        <td className="px-3 py-2 text-[10px] font-bold text-green-800 text-right font-mono whitespace-nowrap">{m.toll_value ? fmtCurrency(m.toll_value) : '---'}</td>
                                        <td className="px-3 py-2 text-[10px] font-black text-green-900 text-right font-mono whitespace-nowrap">{m.revenue_value ? fmtCurrency(m.revenue_value) : '---'}</td>
                                        <td className="px-2 py-1.5">
                                            <input type="text" className="w-full min-w-[120px] px-2 py-1 text-[10px] font-bold border border-gray-200 rounded bg-white outline-none focus:border-green-400" placeholder="Observação..." value={n.obs || ''} onChange={e => handleNoteChange(m.id, 'obs', e.target.value)} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClientReportsTab;
