import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MissionStatus } from '../types';
import {
    Search, ClipboardCheck, RefreshCw, Loader2,
    Building2, CheckCircle2, AlertTriangle, Calendar,
    FileText, Hash, Lock, Eye, X, Save, ShieldCheck,
    ImagePlus, Trash2, ZoomIn, Receipt, CreditCard,
    CheckSquare, Square, ListChecks, ArrowRight, ExternalLink
} from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            const [y, m, day] = d.split('-');
            return `${day}/${m}/${y}`;
        }
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

interface VendorVerificationControlProps {
    onNavigate?: (moduleId: string) => void;
    onOpenMission?: (missionId: string) => void;
}

const VendorVerificationControl: React.FC<VendorVerificationControlProps> = ({ onNavigate, onOpenMission }) => {
    const { showNotification } = useNotification();
    const [missions, setMissions] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [providers, setProviders] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProvider, setSelectedProvider] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const [selectedMission, setSelectedMission] = useState<any | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);

    const [vendorOsNumber, setVendorOsNumber] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [releaseDate, setReleaseDate] = useState('');
    const [paymentDate, setPaymentDate] = useState('');
    const [verifiedBy, setVerifiedBy] = useState('');
    const [verifiedAt, setVerifiedAt] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [invoiceImageUrl, setInvoiceImageUrl] = useState<string | null>(null);
    const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
    const [uploadingInvoice, setUploadingInvoice] = useState(false);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batchSaving, setBatchSaving] = useState(false);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [batchVendorOs, setBatchVendorOs] = useState('');
    const [batchInvoiceNumber, setBatchInvoiceNumber] = useState('');
    const [batchReleaseDate, setBatchReleaseDate] = useState('');
    const [batchPaymentDate, setBatchPaymentDate] = useState('');

    const invoiceInputRef = React.useRef<HTMLInputElement>(null);
    const receiptInputRef = React.useRef<HTMLInputElement>(null);

    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRole = (userData.role || '').toLowerCase();
    const isAdmin = ['administrador', 'diretoria', 'ceo', 'controller'].includes(userRole) || userData.permissions?.includes('*');

    const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas error'));
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Blob error')), 'image/jpeg', quality);
            };
            img.onerror = () => reject(new Error('Erro ao carregar imagem'));
            img.src = URL.createObjectURL(file);
        });
    };

    const handleImageUpload = async (file: File, type: 'invoice' | 'receipt') => {
        if (!selectedMission) return;
        const setUploading = type === 'invoice' ? setUploadingInvoice : setUploadingReceipt;
        const setUrl = type === 'invoice' ? setInvoiceImageUrl : setReceiptImageUrl;

        const MAX_FILE_SIZE = 55 * 1024;
        const isPdf = file.type === 'application/pdf';

        if (isPdf && file.size > MAX_FILE_SIZE) {
            showNotification('Arquivo muito grande', `PDF máximo 55KB. Seu arquivo tem ${(file.size / 1024).toFixed(0)}KB.`, 'error');
            return;
        }

        setUploading(true);
        try {
            let uploadBlob: Blob;
            let contentType: string;
            let ext: string;

            if (isPdf) {
                uploadBlob = file;
                contentType = 'application/pdf';
                ext = 'pdf';
            } else {
                uploadBlob = await compressImage(file);
                contentType = 'image/jpeg';
                ext = 'jpg';
            }

            const path = `vendor-docs/${selectedMission.id}/${type}_${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from('mission-evidence').upload(path, uploadBlob, { contentType, upsert: true });

            if (uploadError) {
                if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
                    showNotification('Erro', 'Bucket mission-evidence não existe no Supabase.', 'error');
                } else {
                    showNotification('Erro', uploadError.message, 'error');
                }
                return;
            }

            const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
            const publicUrl = urlData.publicUrl;
            setUrl(publicUrl);

            await supabase.from('system_logs').insert({
                entity: 'VendorVerification',
                entity_id: selectedMission.id,
                action_type: type === 'invoice' ? 'VENDOR_INVOICE_UPLOAD' : 'VENDOR_RECEIPT_UPLOAD',
                user_name: userData.name || 'Sistema',
                details: JSON.stringify({ url: publicUrl, type, path })
            });

            showNotification('Upload Concluído', type === 'invoice' ? 'Nota Fiscal anexada.' : 'Comprovante anexado.', 'success');
        } catch (e: any) {
            showNotification('Erro no Upload', e.message, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveImage = async (type: 'invoice' | 'receipt') => {
        const setUrl = type === 'invoice' ? setInvoiceImageUrl : setReceiptImageUrl;
        setUrl(null);
        showNotification('Removido', type === 'invoice' ? 'Nota Fiscal removida.' : 'Comprovante removido.', 'info');
    };

    const loadAttachments = async (missionId: string) => {
        setInvoiceImageUrl(null);
        setReceiptImageUrl(null);
        try {
            const { data: logs } = await supabase.from('system_logs')
                .select('action_type, details')
                .eq('entity', 'VendorVerification')
                .eq('entity_id', missionId)
                .in('action_type', ['VENDOR_INVOICE_UPLOAD', 'VENDOR_RECEIPT_UPLOAD'])
                .order('created_at', { ascending: false });

            if (logs) {
                let foundInvoice = false;
                let foundReceipt = false;
                for (const log of logs) {
                    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                    if (log.action_type === 'VENDOR_INVOICE_UPLOAD' && !foundInvoice) {
                        setInvoiceImageUrl(details.url);
                        foundInvoice = true;
                    }
                    if (log.action_type === 'VENDOR_RECEIPT_UPLOAD' && !foundReceipt) {
                        setReceiptImageUrl(details.url);
                        foundReceipt = true;
                    }
                }
            }
        } catch (e) {
            console.error('Erro ao carregar anexos:', e);
        }
    };

    useEffect(() => {
        loadData();
        const handleRefresh = () => loadData();
        window.addEventListener('refreshMissions', handleRefresh);
        return () => window.removeEventListener('refreshMissions', handleRefresh);
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [clientsRes, missionsRes] = await Promise.all([
                supabase.from('clients').select('id, name, trading_name').eq('status', 'Ativo').order('name'),
                supabase.from('missions')
                    .select('id, client, provider, origin, destination, status, created_at, start_time, end_time, start_km, end_km, total_distance, revenue_value, cost_value, toll_value, toll_value_provider, billing_approved, vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at')
                    .eq('billing_approved', true)
                    .gte('created_at', '2026-02-01T00:00:00')
                    .order('created_at', { ascending: false })
                    .limit(1000)
            ]);

            let missionData = missionsRes.data || [];

            if (missionsRes.error && missionsRes.error.message.includes('column')) {
                const { data: fallbackData } = await supabase.from('missions')
                    .select('id, client, provider, origin, destination, status, created_at, start_time, end_time, start_km, end_km, total_distance, revenue_value, cost_value, toll_value, toll_value_provider, billing_approved')
                    .eq('billing_approved', true)
                    .gte('created_at', '2026-02-01T00:00:00')
                    .order('created_at', { ascending: false })
                    .limit(1000);
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
        setPreviewImage(null);

        setVendorOsNumber(mission.vendor_os_number || '');
        setInvoiceNumber(mission.invoice_number || '');
        setReleaseDate(mission.release_date || '');
        setPaymentDate(mission.payment_date || '');
        setVerifiedBy(mission.verified_by || '');
        setVerifiedAt(mission.verified_at || '');

        try {
            const [verRes] = await Promise.all([
                fetch(`/api/vendor-verification/${mission.id}`).then(r => r.json()),
                loadAttachments(mission.id)
            ]);
            if (verRes.ok && verRes.data) {
                setVendorOsNumber(verRes.data.vendor_os_number || '');
                setInvoiceNumber(verRes.data.invoice_number || '');
                setReleaseDate(verRes.data.release_date || '');
                setPaymentDate(verRes.data.payment_date || '');
                setVerifiedBy(verRes.data.verified_by || '');
                setVerifiedAt(verRes.data.verified_at || '');
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

        setIsSaving(true);
        const now = new Date().toISOString();
        const userName = userData.name || userData.email || 'Desconhecido';
        const finalReleaseDate = releaseDate || now.split('T')[0];

        try {
            const res = await fetch(`/api/vendor-verification/${selectedMission.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_os_number: vendorOsNumber.trim(),
                    invoice_number: invoiceNumber.trim(),
                    release_date: finalReleaseDate,
                    payment_date: paymentDate || null,
                    verified_by: userName,
                    verified_at: now,
                })
            });
            const json = await res.json();

            if (json.ok) {
                setVerifiedBy(userName);
                setVerifiedAt(now);
                setReleaseDate(finalReleaseDate);

                setMissions(prev => prev.map(m =>
                    m.id === selectedMission.id
                        ? { ...m, vendor_os_number: vendorOsNumber.trim(), invoice_number: invoiceNumber.trim(), release_date: finalReleaseDate, payment_date: paymentDate || null, verified_by: userName, verified_at: now }
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

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const pendingIds = filteredMissions.filter(m => !m.verified_by && !m.verified_at).map(m => m.id);
        if (pendingIds.every(id => selectedIds.has(id))) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                pendingIds.forEach(id => next.delete(id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                pendingIds.forEach(id => next.add(id));
                return next;
            });
        }
    };

    const openBatchModal = () => {
        if (selectedIds.size === 0) {
            showNotification('Seleção Vazia', 'Selecione pelo menos uma OS para verificar em lote.', 'error');
            return;
        }
        setBatchVendorOs('');
        setBatchInvoiceNumber('');
        setBatchReleaseDate('');
        setBatchPaymentDate('');
        setBatchModalOpen(true);
    };

    const handleBatchVerification = async () => {
        if (!batchVendorOs.trim() && !batchInvoiceNumber.trim()) {
            showNotification('Campos Obrigatórios', 'Informe pelo menos o Nº OS Fornecedor ou NF.', 'error');
            return;
        }

        setBatchSaving(true);
        const now = new Date().toISOString();
        const userName = userData.name || userData.email || 'Desconhecido';
        const finalReleaseDate = batchReleaseDate || now.split('T')[0];
        let successCount = 0;
        let errorCount = 0;

        for (const missionId of selectedIds) {
            try {
                const res = await fetch(`/api/vendor-verification/${missionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vendor_os_number: batchVendorOs.trim() || null,
                        invoice_number: batchInvoiceNumber.trim() || null,
                        release_date: finalReleaseDate,
                        payment_date: batchPaymentDate || null,
                        verified_by: userName,
                        verified_at: now,
                    })
                });
                const json = await res.json();
                if (json.ok) {
                    successCount++;
                    setMissions(prev => prev.map(m =>
                        m.id === missionId
                            ? { ...m, vendor_os_number: batchVendorOs.trim() || null, invoice_number: batchInvoiceNumber.trim() || null, release_date: finalReleaseDate, payment_date: batchPaymentDate || null, verified_by: userName, verified_at: now }
                            : m
                    ));
                } else {
                    errorCount++;
                }
            } catch {
                errorCount++;
            }
        }

        setBatchSaving(false);
        setBatchModalOpen(false);
        setSelectedIds(new Set());

        if (errorCount === 0) {
            showNotification('Lote Verificado', `${successCount} OS verificadas com sucesso.`, 'success');
        } else {
            showNotification('Lote Parcial', `${successCount} OK, ${errorCount} com erro.`, 'error');
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
                    release_date: releaseDate || null,
                    payment_date: paymentDate || null,
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
            const mDate = (m.created_at || '').split('T')[0];
            const matchesDateFrom = !dateFrom || mDate >= dateFrom;
            const matchesDateTo = !dateTo || mDate <= dateTo;
            const searchLower = searchTerm.toLowerCase();
            return matchesProvider && matchesStatus && matchesDateFrom && matchesDateTo && (
                m.id.toLowerCase().includes(searchLower) ||
                (m.client || '').toLowerCase().includes(searchLower) ||
                (m.provider || '').toLowerCase().includes(searchLower) ||
                (m.vendor_os_number || '').toLowerCase().includes(searchLower) ||
                (m.invoice_number || '').toLowerCase().includes(searchLower)
            );
        });
    }, [missions, selectedProvider, filterStatus, searchTerm, dateFrom, dateTo]);

    const stats = useMemo(() => {
        const total = missions.length;
        const verified = missions.filter(m => m.verified_by && m.verified_at).length;
        const pending = total - verified;
        const paid = missions.filter(m => m.payment_date).length;
        return { total, verified, pending, paid };
    }, [missions]);

    return (
        <div className="space-y-6 animate-fade-in pb-20" data-testid="vendor-verification-control">
            {previewImage && (
                <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
                    <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" data-testid="button-close-preview">
                        <X size={24} />
                    </button>
                    <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" data-testid="img-fullscreen-preview" />
                </div>
            )}

            {modalOpen && selectedMission && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
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

                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
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
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Data de Liberação</label>
                                            <div className="relative">
                                                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="date"
                                                    value={releaseDate}
                                                    onChange={e => setReleaseDate(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-release-date"
                                                />
                                                {isLocked && !isAdmin && <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
                                            </div>
                                            <p className="text-[8px] text-gray-400 font-bold mt-1">Registrada automaticamente ao gravar</p>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Data do Pagamento</label>
                                            <div className="relative">
                                                <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block flex items-center gap-1">
                                                <Receipt size={12} /> Nota Fiscal (Imagem/PDF)
                                            </label>
                                            <input
                                                ref={invoiceInputRef}
                                                type="file"
                                                accept="image/*,application/pdf"
                                                className="hidden"
                                                onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0], 'invoice'); e.target.value = ''; }}
                                                data-testid="input-invoice-image"
                                            />
                                            {invoiceImageUrl ? (
                                                <div className="relative group">
                                                    {invoiceImageUrl.toLowerCase().endsWith('.pdf') ? (
                                                        <a href={invoiceImageUrl} target="_blank" rel="noopener noreferrer" className="w-full h-28 bg-green-50 border-2 border-green-300 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-green-100 transition-colors" data-testid="link-invoice-pdf">
                                                            <FileText size={28} className="text-green-600" />
                                                            <span className="text-[9px] font-black text-green-700 uppercase">Abrir PDF</span>
                                                        </a>
                                                    ) : (
                                                        <img
                                                            src={invoiceImageUrl}
                                                            alt="Nota Fiscal"
                                                            className="w-full h-28 object-cover rounded-lg border-2 border-green-300 cursor-pointer"
                                                            onClick={() => setPreviewImage(invoiceImageUrl)}
                                                            data-testid="img-invoice-preview"
                                                        />
                                                    )}
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                                        {!invoiceImageUrl.toLowerCase().endsWith('.pdf') && <button onClick={() => setPreviewImage(invoiceImageUrl)} className="p-1.5 bg-white rounded-lg" data-testid="button-zoom-invoice"><ZoomIn size={14} /></button>}
                                                        {invoiceImageUrl.toLowerCase().endsWith('.pdf') && <a href={invoiceImageUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white rounded-lg" data-testid="button-open-invoice-pdf"><ExternalLink size={14} /></a>}
                                                        {(!isLocked || isAdmin) && (
                                                            <button onClick={() => handleRemoveImage('invoice')} className="p-1.5 bg-red-500 text-white rounded-lg" data-testid="button-remove-invoice"><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                    <span className="absolute top-1 left-1 text-[8px] font-black bg-green-600 text-white px-1.5 py-0.5 rounded">{invoiceImageUrl.toLowerCase().endsWith('.pdf') ? 'PDF' : 'NF'}</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => invoiceInputRef.current?.click()}
                                                    disabled={(isLocked && !isAdmin) || uploadingInvoice}
                                                    className="w-full h-28 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    data-testid="button-upload-invoice"
                                                >
                                                    {uploadingInvoice ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                                                    <span className="text-[9px] font-bold uppercase">{uploadingInvoice ? 'Enviando...' : 'Anexar NF'}</span>
                                                </button>
                                            )}
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block flex items-center gap-1">
                                                <CreditCard size={12} /> Comprovante Pgto (Imagem/PDF)
                                            </label>
                                            <input
                                                ref={receiptInputRef}
                                                type="file"
                                                accept="image/*,application/pdf"
                                                className="hidden"
                                                onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0], 'receipt'); e.target.value = ''; }}
                                                data-testid="input-receipt-image"
                                            />
                                            {receiptImageUrl ? (
                                                <div className="relative group">
                                                    {receiptImageUrl.toLowerCase().endsWith('.pdf') ? (
                                                        <a href={receiptImageUrl} target="_blank" rel="noopener noreferrer" className="w-full h-28 bg-blue-50 border-2 border-blue-300 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-blue-100 transition-colors" data-testid="link-receipt-pdf">
                                                            <FileText size={28} className="text-blue-600" />
                                                            <span className="text-[9px] font-black text-blue-700 uppercase">Abrir PDF</span>
                                                        </a>
                                                    ) : (
                                                        <img
                                                            src={receiptImageUrl}
                                                            alt="Comprovante de Pagamento"
                                                            className="w-full h-28 object-cover rounded-lg border-2 border-blue-300 cursor-pointer"
                                                            onClick={() => setPreviewImage(receiptImageUrl)}
                                                            data-testid="img-receipt-preview"
                                                        />
                                                    )}
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                                        {!receiptImageUrl.toLowerCase().endsWith('.pdf') && <button onClick={() => setPreviewImage(receiptImageUrl)} className="p-1.5 bg-white rounded-lg" data-testid="button-zoom-receipt"><ZoomIn size={14} /></button>}
                                                        {receiptImageUrl.toLowerCase().endsWith('.pdf') && <a href={receiptImageUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white rounded-lg" data-testid="button-open-receipt-pdf"><ExternalLink size={14} /></a>}
                                                        {(!isLocked || isAdmin) && (
                                                            <button onClick={() => handleRemoveImage('receipt')} className="p-1.5 bg-red-500 text-white rounded-lg" data-testid="button-remove-receipt"><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                    <span className="absolute top-1 left-1 text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">{receiptImageUrl.toLowerCase().endsWith('.pdf') ? 'PDF' : 'COMP'}</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => receiptInputRef.current?.click()}
                                                    disabled={(isLocked && !isAdmin) || uploadingReceipt}
                                                    className="w-full h-28 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    data-testid="button-upload-receipt"
                                                >
                                                    {uploadingReceipt ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                                                    <span className="text-[9px] font-bold uppercase">{uploadingReceipt ? 'Enviando...' : 'Anexar Comprovante'}</span>
                                                </button>
                                            )}
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

            <div className="flex flex-wrap items-stretch gap-4">
                <div className="flex-1 min-w-[280px] bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                    <div className="p-3 bg-blue-700 text-white rounded-2xl shadow-lg"><ClipboardCheck size={28} /></div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none" data-testid="page-title">Controle de OS Fornecedor</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase mt-1 tracking-widest">Verificação de Faturamento</p>
                    </div>
                    <button onClick={loadData} className="ml-auto p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all text-gray-500" data-testid="button-refresh">
                        <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 flex items-center gap-3 min-w-[140px]">
                    <CheckCircle2 size={24} className="text-green-600" />
                    <div>
                        <p className="text-2xl font-black text-green-700" data-testid="text-verified-count">{stats.verified}</p>
                        <p className="text-[9px] font-black text-green-600 uppercase tracking-widest">Verificadas</p>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 flex items-center gap-3 min-w-[120px]">
                    <CreditCard size={24} className="text-blue-600" />
                    <div>
                        <p className="text-2xl font-black text-blue-700" data-testid="text-paid-count">{stats.paid}</p>
                        <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Pagas</p>
                    </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3 min-w-[130px]">
                    <AlertTriangle size={24} className="text-amber-600" />
                    <div>
                        <p className="text-2xl font-black text-amber-700" data-testid="text-pending-count">{stats.pending}</p>
                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Pendentes</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400 shrink-0" />
                        <label className="text-[10px] font-black text-gray-500 uppercase shrink-0">De:</label>
                        <input type="date" className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400 shrink-0" />
                        <label className="text-[10px] font-black text-gray-500 uppercase shrink-0">Até:</label>
                        <input type="date" className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
                    </div>
                    {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="py-2 px-4 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors flex items-center gap-2" data-testid="btn-clear-dates">
                            <X size={14} /> Limpar Datas
                        </button>
                    )}
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 flex items-center justify-between animate-fade-in" data-testid="batch-action-bar">
                    <div className="flex items-center gap-3">
                        <ListChecks size={22} className="text-blue-600" />
                        <span className="text-sm font-black text-blue-800">{selectedIds.size} OS selecionada{selectedIds.size > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={openBatchModal}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-2.5 px-5 rounded-xl transition-colors uppercase tracking-wide"
                            data-testid="button-batch-verify"
                        >
                            <ClipboardCheck size={16} /> Verificar em Lote
                        </button>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-black text-xs py-2.5 px-4 rounded-xl transition-colors"
                            data-testid="button-clear-selection"
                        >
                            <X size={14} /> Limpar
                        </button>
                    </div>
                </div>
            )}

            {batchModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setBatchModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2" data-testid="batch-modal-title">
                                    <ListChecks size={20} /> Verificação em Lote
                                </h3>
                                <p className="text-xs text-blue-200 font-bold mt-1">{selectedIds.size} OS selecionada{selectedIds.size > 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={() => setBatchModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                                <p className="text-[10px] font-black text-blue-700 uppercase mb-2">OS Selecionadas:</p>
                                <div className="flex flex-wrap gap-1">
                                    {[...selectedIds].map(id => (
                                        <span key={id} className="text-[9px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg border border-blue-200">{id}</span>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Nº OS Fornecedor</label>
                                <div className="relative">
                                    <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="text" value={batchVendorOs} onChange={e => setBatchVendorOs(e.target.value)} placeholder="Ex: OS-FORN-00123" className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" data-testid="batch-input-vendor-os" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Nº da NF</label>
                                <div className="relative">
                                    <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="text" value={batchInvoiceNumber} onChange={e => setBatchInvoiceNumber(e.target.value)} placeholder="Ex: NF-001234" className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" data-testid="batch-input-invoice" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Data de Liberação</label>
                                <div className="relative">
                                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="date" value={batchReleaseDate} onChange={e => setBatchReleaseDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" data-testid="batch-input-release-date" />
                                </div>
                                <p className="text-[8px] text-gray-400 font-bold mt-1">Deixe vazio para registrar a data de hoje</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Data do Pagamento</label>
                                <div className="relative">
                                    <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="date" value={batchPaymentDate} onChange={e => setBatchPaymentDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" data-testid="batch-input-payment-date" />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleBatchVerification}
                                    disabled={batchSaving}
                                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm py-3 rounded-xl transition-colors disabled:opacity-50"
                                    data-testid="button-confirm-batch"
                                >
                                    {batchSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {batchSaving ? 'Processando...' : `Verificar ${selectedIds.size} OS`}
                                </button>
                                <button
                                    onClick={() => setBatchModalOpen(false)}
                                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-sm rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                            <tr>
                                <th className="px-3 py-3 text-center w-10">
                                    <button onClick={toggleSelectAll} className="p-1 hover:bg-white/10 rounded transition-colors" data-testid="button-select-all">
                                        {filteredMissions.filter(m => !m.verified_by && !m.verified_at).length > 0 &&
                                         filteredMissions.filter(m => !m.verified_by && !m.verified_at).every(m => selectedIds.has(m.id))
                                            ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </button>
                                </th>
                                <th className="px-4 py-3">OS</th>
                                <th className="px-4 py-3">Fornecedor / Cliente</th>
                                <th className="px-4 py-3">Origem</th>
                                <th className="px-4 py-3">Destino</th>
                                <th className="px-4 py-3 text-center">Dt. Inicial</th>
                                <th className="px-4 py-3 text-center">Dt. Final</th>
                                <th className="px-4 py-3 text-center">Hr. Inicial</th>
                                <th className="px-4 py-3 text-center">Hr. Final</th>
                                <th className="px-4 py-3 text-center">KM Inicial</th>
                                <th className="px-4 py-3 text-center">KM Final</th>
                                <th className="px-4 py-3 text-right">Custo</th>
                                <th className="px-4 py-3 text-center">OS Forn.</th>
                                <th className="px-4 py-3 text-center">NF</th>
                                <th className="px-4 py-3 text-center">Liberação</th>
                                <th className="px-4 py-3 text-center">Pgto.</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-center">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={18} className="p-20 text-center"><Loader2 size={40} className="animate-spin text-blue-700 mx-auto" /></td></tr>
                            ) : filteredMissions.length === 0 ? (
                                <tr><td colSpan={18} className="p-20 text-center text-gray-400 font-bold uppercase">Nenhuma missão encontrada.</td></tr>
                            ) : (
                                filteredMissions.map(m => {
                                    const isVerified = Boolean(m.verified_by && m.verified_at);
                                    const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
                                    const totalCost = (m.cost_value || 0) + tollProv;

                                    return (
                                        <tr key={m.id} className={`hover:bg-gray-50/50 transition-colors ${isVerified ? 'bg-green-50/30' : ''} ${selectedIds.has(m.id) ? 'bg-blue-50/50' : ''}`} data-testid={`row-mission-${m.id}`}>
                                            <td className="px-3 py-3 text-center">
                                                {!isVerified ? (
                                                    <button onClick={() => toggleSelection(m.id)} className="p-1 hover:bg-gray-100 rounded transition-colors" data-testid={`checkbox-${m.id}`}>
                                                        {selectedIds.has(m.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-gray-400" />}
                                                    </button>
                                                ) : (
                                                    <CheckCircle2 size={16} className="text-green-400 mx-auto" />
                                                )}
                                            </td>
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
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.start_time ? new Date(m.start_time).toLocaleDateString('pt-BR') : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.end_time ? new Date(m.end_time).toLocaleDateString('pt-BR') : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.start_time ? new Date(m.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.end_time ? new Date(m.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.start_km != null ? Number(m.start_km).toLocaleString('pt-BR') : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.end_km != null ? Number(m.end_km).toLocaleString('pt-BR') : '—'}</span>
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
                                                <span className="text-[10px] font-bold text-gray-700">{m.release_date ? fmtDate(m.release_date) : '—'}</span>
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
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => onOpenMission?.(m.id)}
                                                        className="p-2 rounded-xl transition-all bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                                        title="Conferência e Auditoria da OS"
                                                        data-testid={`button-audit-${m.id}`}
                                                    >
                                                        <FileText size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => openVerificationModal(m)}
                                                        className={`p-2 rounded-xl transition-all flex items-center gap-1 text-[9px] font-black uppercase ${
                                                            isVerified
                                                                ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                                                                : 'bg-blue-50 border-2 border-blue-400 text-blue-700 hover:bg-blue-100'
                                                        }`}
                                                        data-testid={`button-verify-${m.id}`}
                                                    >
                                                        {isVerified ? <Eye size={14} /> : <ClipboardCheck size={14} />}
                                                        {isVerified ? 'Ver' : 'Verificar'}
                                                    </button>
                                                </div>
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
