import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MissionStatus } from '../types';
import {
    Search, ClipboardCheck, RefreshCw, Loader2,
    Building2, CheckCircle2, AlertTriangle, Calendar,
    FileText, Hash, Lock, Eye, X, Save, ShieldCheck
} from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
        const dt = new Date(d);
        return dt.toLocaleDateString('pt-BR');
    } catch { return d; }
};

const fmtDateTime = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
        const dt = new Date(d);
        return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
};

const VendorVerificationControl: React.FC = () => {
    const { showNotification } = useNotification();
    const [missions, setMissions] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [providers, setProviders] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProvider, setSelectedProvider] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
    const [isLoading, setIsLoading] = useState(true);

    const [selectedMission, setSelectedMission] = useState<any | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);

    const [vendorOsNumber, setVendorOsNumber] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [paymentDate, setPaymentDate] = useState('');
    const [verifiedBy, setVerifiedBy] = useState('');
    const [verifiedAt, setVerifiedAt] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRole = (userData.role || '').toLowerCase();
    const isAdmin = ['administrador', 'diretoria', 'ceo'].includes(userRole) || userData.permissions?.includes('*');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [clientsRes, missionsRes] = await Promise.all([
                supabase.from('clients').select('id, name, trading_name').eq('status', 'Ativo').order('name'),
                supabase.from('missions')
                    .select('id, client, provider, origin, destination, status, created_at, start_time, end_time, start_km, end_km, total_distance, revenue_value, cost_value, toll_value, toll_value_provider, billing_approved, vendor_os_number, invoice_number, payment_date, verified_by, verified_at')
                    .eq('billing_approved', true)
                    .order('created_at', { ascending: false })
                    .limit(500)
            ]);

            let missionData = missionsRes.data || [];

            if (missionsRes.error && missionsRes.error.message.includes('column')) {
                const { data: fallbackData } = await supabase.from('missions')
                    .select('id, client, provider, origin, destination, status, created_at, start_time, end_time, start_km, end_km, total_distance, revenue_value, cost_value, toll_value, toll_value_provider, billing_approved')
                    .eq('billing_approved', true)
                    .order('created_at', { ascending: false })
                    .limit(500);
                missionData = fallbackData || [];

                const { data: verLogs } = await supabase.from('system_logs')
                    .select('entity_id, details')
                    .eq('action_type', 'VENDOR_VERIFICATION')
                    .order('created_at', { ascending: false });

                if (verLogs) {
                    const verMap = new Map<string, any>();
                    verLogs.forEach(log => {
                        if (!verMap.has(log.entity_id)) {
                            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                            verMap.set(log.entity_id, details);
                        }
                    });
                    missionData = missionData.map(m => {
                        const ver = verMap.get(m.id);
                        if (ver) {
                            return { ...m, ...ver };
                        }
                        return m;
                    });
                }
            }

            if (clientsRes.data) setClients(clientsRes.data);

            const uniqueProviders = [...new Set(missionData.map((m: any) => m.provider).filter(Boolean))].sort();
            setProviders(uniqueProviders as string[]);
            setMissions(missionData);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const openVerificationModal = async (mission: any) => {
        setSelectedMission(mission);
        setModalOpen(true);
        setModalLoading(true);

        setVendorOsNumber(mission.vendor_os_number || '');
        setInvoiceNumber(mission.invoice_number || '');
        setPaymentDate(mission.payment_date || '');
        setVerifiedBy(mission.verified_by || '');
        setVerifiedAt(mission.verified_at || '');

        try {
            const res = await fetch(`/api/vendor-verification/${mission.id}`);
            const json = await res.json();
            if (json.ok && json.data) {
                setVendorOsNumber(json.data.vendor_os_number || '');
                setInvoiceNumber(json.data.invoice_number || '');
                setPaymentDate(json.data.payment_date || '');
                setVerifiedBy(json.data.verified_by || '');
                setVerifiedAt(json.data.verified_at || '');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setModalLoading(false);
        }
    };

    const handleSaveVerification = async () => {
        if (!selectedMission) return;
        if (!vendorOsNumber.trim()) {
            showNotification('Campo Obrigatório', 'Informe o Nº da OS Fornecedor.', 'error');
            return;
        }
        if (!invoiceNumber.trim()) {
            showNotification('Campo Obrigatório', 'Informe o Nº da NF.', 'error');
            return;
        }
        if (!paymentDate) {
            showNotification('Campo Obrigatório', 'Informe a Data Prevista de Pagamento.', 'error');
            return;
        }

        setIsSaving(true);
        const now = new Date().toISOString();
        const userName = userData.name || userData.email || 'Desconhecido';

        try {
            const res = await fetch(`/api/vendor-verification/${selectedMission.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_os_number: vendorOsNumber.trim(),
                    invoice_number: invoiceNumber.trim(),
                    payment_date: paymentDate,
                    verified_by: userName,
                    verified_at: now,
                })
            });
            const json = await res.json();

            if (json.ok) {
                setVerifiedBy(userName);
                setVerifiedAt(now);

                setMissions(prev => prev.map(m =>
                    m.id === selectedMission.id
                        ? { ...m, vendor_os_number: vendorOsNumber.trim(), invoice_number: invoiceNumber.trim(), payment_date: paymentDate, verified_by: userName, verified_at: now }
                        : m
                ));

                showNotification('Verificação Gravada', `OS ${selectedMission.id} verificada por ${userName}.`, 'success');
            } else {
                throw new Error(json.error || 'Erro ao gravar');
            }
        } catch (e: any) {
            showNotification('Erro', e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnlock = async () => {
        if (!selectedMission || !isAdmin) return;
        setVerifiedBy('');
        setVerifiedAt('');
        try {
            await fetch(`/api/vendor-verification/${selectedMission.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_os_number: vendorOsNumber.trim(),
                    invoice_number: invoiceNumber.trim(),
                    payment_date: paymentDate,
                    verified_by: null,
                    verified_at: null,
                })
            });
            setMissions(prev => prev.map(m =>
                m.id === selectedMission.id
                    ? { ...m, verified_by: null, verified_at: null }
                    : m
            ));
            showNotification('Desbloqueado', 'Verificação removida. Campos liberados para edição.', 'info');
        } catch (e: any) {
            showNotification('Erro', e.message, 'error');
        }
    };

    const isLocked = Boolean(verifiedBy && verifiedAt);

    const filteredMissions = useMemo(() => {
        return missions.filter(m => {
            const matchesProvider = selectedProvider === 'ALL' || m.provider === selectedProvider;
            const isVerified = Boolean(m.verified_by && m.verified_at);
            const matchesStatus = filterStatus === 'ALL' || (filterStatus === 'VERIFIED' && isVerified) || (filterStatus === 'PENDING' && !isVerified);
            const searchLower = searchTerm.toLowerCase();
            return matchesProvider && matchesStatus && (
                m.id.toLowerCase().includes(searchLower) ||
                (m.client || '').toLowerCase().includes(searchLower) ||
                (m.provider || '').toLowerCase().includes(searchLower) ||
                (m.vendor_os_number || '').toLowerCase().includes(searchLower) ||
                (m.invoice_number || '').toLowerCase().includes(searchLower)
            );
        });
    }, [missions, selectedProvider, filterStatus, searchTerm]);

    const stats = useMemo(() => {
        const total = missions.length;
        const verified = missions.filter(m => m.verified_by && m.verified_at).length;
        const pending = total - verified;
        return { total, verified, pending };
    }, [missions]);

    return (
        <div className="space-y-6 animate-fade-in pb-20" data-testid="vendor-verification-control">
            {modalOpen && selectedMission && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-5 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2" data-testid="modal-title">
                                    <ClipboardCheck size={20} /> Verificação de Faturamento Fornecedor
                                </h3>
                                <p className="text-xs text-blue-200 font-bold mt-1">OS: {selectedMission.id}</p>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors" data-testid="button-close-modal">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {modalLoading ? (
                                <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-blue-600" /></div>
                            ) : (
                                <>
                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 text-xs space-y-2">
                                        <div className="grid grid-cols-[100px_1fr] gap-1 items-center">
                                            <span className="text-gray-500 font-bold">Fornecedor:</span>
                                            <span className="font-black text-gray-900 text-right">{selectedMission.provider || '—'}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-1 items-center">
                                            <span className="text-gray-500 font-bold">Cliente:</span>
                                            <span className="font-black text-gray-900 text-right">{selectedMission.client || '—'}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-1 items-center">
                                            <span className="text-gray-500 font-bold">Origem:</span>
                                            <span className="font-bold text-gray-700 text-right truncate" title={selectedMission.origin}>{selectedMission.origin || '—'}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-1 items-center">
                                            <span className="text-gray-500 font-bold">Destino:</span>
                                            <span className="font-bold text-gray-700 text-right truncate" title={selectedMission.destination}>{selectedMission.destination || '—'}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-1 items-center border-t border-gray-200 pt-2 mt-1">
                                            <span className="text-gray-500 font-bold">Custo Total:</span>
                                            <span className="font-black text-red-600 text-right">{formatCurrency((selectedMission.cost_value || 0) + Math.max(0, selectedMission.toll_value_provider ?? selectedMission.toll_value ?? 0))}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Nº OS Fornecedor</label>
                                            <div className="relative">
                                                <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={vendorOsNumber}
                                                    onChange={e => setVendorOsNumber(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    placeholder="Ex: OS-FORN-00123"
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-vendor-os-number"
                                                />
                                                {isLocked && !isAdmin && <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Nº da NF</label>
                                            <div className="relative">
                                                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={invoiceNumber}
                                                    onChange={e => setInvoiceNumber(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    placeholder="Ex: NF-001234"
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-invoice-number"
                                                />
                                                {isLocked && !isAdmin && <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Data Prevista de Pagamento</label>
                                            <div className="relative">
                                                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="date"
                                                    value={paymentDate}
                                                    onChange={e => setPaymentDate(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-payment-date"
                                                />
                                                {isLocked && !isAdmin && <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
                                            </div>
                                        </div>
                                    </div>

                                    {isLocked && (
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3" data-testid="verification-stamp">
                                            <ShieldCheck size={24} className="text-green-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-black text-green-800">OS Verificada</p>
                                                <p className="text-xs text-green-600 font-bold mt-1">
                                                    Verificado por <span className="font-black">{verifiedBy}</span> em <span className="font-black">{fmtDateTime(verifiedAt)}</span>
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        {!isLocked && (
                                            <button
                                                onClick={handleSaveVerification}
                                                disabled={isSaving}
                                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm py-3 rounded-xl transition-colors disabled:opacity-50"
                                                data-testid="button-save-verification"
                                            >
                                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                Gravar Verificação
                                            </button>
                                        )}

                                        {isLocked && isAdmin && (
                                            <button
                                                onClick={handleUnlock}
                                                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm py-3 rounded-xl transition-colors"
                                                data-testid="button-unlock-verification"
                                            >
                                                <Lock size={16} /> Desbloquear (Admin)
                                            </button>
                                        )}

                                        <button
                                            onClick={() => setModalOpen(false)}
                                            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-sm rounded-xl transition-colors"
                                            data-testid="button-cancel-modal"
                                        >
                                            Fechar
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                    <div className="p-3 bg-blue-700 text-white rounded-2xl shadow-lg"><ClipboardCheck size={28} /></div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none" data-testid="page-title">Controle de OS Fornecedor</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase mt-2 tracking-widest">Verificação de Faturamento</p>
                    </div>
                    <button onClick={loadData} className="ml-auto p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all text-gray-500" data-testid="button-refresh">
                        <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle2 size={28} className="text-green-600" />
                    <div>
                        <p className="text-2xl font-black text-green-700" data-testid="text-verified-count">{stats.verified}</p>
                        <p className="text-[9px] font-black text-green-600 uppercase tracking-widest">Verificadas</p>
                    </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                    <AlertTriangle size={28} className="text-amber-600" />
                    <div>
                        <p className="text-2xl font-black text-amber-700" data-testid="text-pending-count">{stats.pending}</p>
                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Pendentes</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Buscar por OS, Cliente, Fornecedor, NF..."
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        data-testid="input-search"
                    />
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <div className="relative">
                    <select
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 outline-none appearance-none"
                        value={selectedProvider}
                        onChange={e => setSelectedProvider(e.target.value)}
                        data-testid="select-provider"
                    >
                        <option value="ALL">TODOS OS FORNECEDORES</option>
                        {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <div className="flex gap-2">
                    {(['ALL', 'PENDING', 'VERIFIED'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase transition-colors ${
                                filterStatus === s
                                    ? s === 'VERIFIED' ? 'bg-green-600 text-white' : s === 'PENDING' ? 'bg-amber-500 text-white' : 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                            data-testid={`button-filter-${s.toLowerCase()}`}
                        >
                            {s === 'ALL' ? 'Todas' : s === 'PENDING' ? 'Pendentes' : 'Verificadas'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                            <tr>
                                <th className="px-4 py-3">OS</th>
                                <th className="px-4 py-3">Fornecedor / Cliente</th>
                                <th className="px-4 py-3">Origem</th>
                                <th className="px-4 py-3">Destino</th>
                                <th className="px-4 py-3 text-right">Custo</th>
                                <th className="px-4 py-3 text-center">OS Forn.</th>
                                <th className="px-4 py-3 text-center">NF</th>
                                <th className="px-4 py-3 text-center">Pgto.</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-center">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={10} className="p-20 text-center"><Loader2 size={40} className="animate-spin text-blue-700 mx-auto" /></td></tr>
                            ) : filteredMissions.length === 0 ? (
                                <tr><td colSpan={10} className="p-20 text-center text-gray-400 font-bold uppercase">Nenhuma missão encontrada.</td></tr>
                            ) : (
                                filteredMissions.map(m => {
                                    const isVerified = Boolean(m.verified_by && m.verified_at);
                                    const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
                                    const totalCost = (m.cost_value || 0) + tollProv;

                                    return (
                                        <tr key={m.id} className={`hover:bg-gray-50/50 transition-colors ${isVerified ? 'bg-green-50/30' : ''}`} data-testid={`row-mission-${m.id}`}>
                                            <td className="px-4 py-3">
                                                <span className="font-black text-gray-900 text-xs font-mono">{m.id}</span>
                                                <div className="text-[9px] text-gray-400 font-bold">{fmtDate(m.created_at)}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-[10px] font-black text-blue-800 uppercase">{m.provider}</div>
                                                <div className="text-[9px] font-bold text-gray-500">{m.client}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-[10px] font-bold text-gray-700 max-w-[160px] truncate" title={m.origin}>{m.origin || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-[10px] font-bold text-gray-700 max-w-[160px] truncate" title={m.destination}>{m.destination || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-xs font-black text-red-600">{formatCurrency(totalCost)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.vendor_os_number || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.invoice_number || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.payment_date ? fmtDate(m.payment_date) : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {isVerified ? (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-green-700 bg-green-100 px-2 py-1 rounded-lg border border-green-200" data-testid={`status-verified-${m.id}`}>
                                                        <CheckCircle2 size={12} /> Verificado
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-lg border border-amber-200" data-testid={`status-pending-${m.id}`}>
                                                        <AlertTriangle size={12} /> Pendente
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => openVerificationModal(m)}
                                                    className={`p-2 rounded-xl transition-all flex items-center gap-1 text-[9px] font-black uppercase mx-auto ${
                                                        isVerified
                                                            ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                                                            : 'bg-blue-50 border-2 border-blue-400 text-blue-700 hover:bg-blue-100'
                                                    }`}
                                                    data-testid={`button-verify-${m.id}`}
                                                >
                                                    {isVerified ? <Eye size={14} /> : <ClipboardCheck size={14} />}
                                                    {isVerified ? 'Ver' : 'Verificar'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                {!isLoading && filteredMissions.length > 0 && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-widest flex justify-between">
                        <span>Exibindo {filteredMissions.length} de {missions.length} missões aprovadas</span>
                        <span>Total Custo: <span className="text-red-600 font-black">{formatCurrency(filteredMissions.reduce((sum, m) => sum + (m.cost_value || 0) + Math.max(0, m.toll_value_provider ?? m.toll_value ?? 0), 0))}</span></span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VendorVerificationControl;
