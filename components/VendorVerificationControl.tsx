import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { formatDateBR, formatDateTimeBR } from '../lib/dateUtils';
import { supabase } from '../lib/supabase';
import { MissionStatus } from '../types';
import * as XLSX from 'xlsx';
import {
    Search, ClipboardCheck, RefreshCw, Loader2,
    Building2, CheckCircle2, AlertTriangle, Calendar,
    FileText, Hash, Lock, Eye, X, Save, ShieldCheck,
    ImagePlus, Trash2, ZoomIn, Receipt, CreditCard,
    CheckSquare, Square, ListChecks, ArrowRight, ExternalLink,
    Upload, Scale, FileSpreadsheet, HelpCircle, Download, Printer
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
        return formatDateBR(d);
    } catch { return d; }
};

const fmtDateTime = (d: string | null | undefined) => {
    if (!d) return '—';
    return formatDateTimeBR(d);
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
    const [dateFrom, setDateFrom] = useState('2026-01-01');
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
    const [editCostValue, setEditCostValue] = useState('');
    const [editTollProviderValue, setEditTollProviderValue] = useState('');

    const [invoiceImageUrl, setInvoiceImageUrl] = useState<string | null>(null);
    const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
    const [uploadingInvoice, setUploadingInvoice] = useState(false);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batchSaving, setBatchSaving] = useState(false);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [auditLog, setAuditLog] = useState<any[]>([]);
    const [showAuditPanel, setShowAuditPanel] = useState(false);
    const [auditLoading, setAuditLoading] = useState(false);
    const [batchVendorOs, setBatchVendorOs] = useState('');
    const [batchInvoiceNumber, setBatchInvoiceNumber] = useState('');
    const [batchReleaseDate, setBatchReleaseDate] = useState('');
    const [batchPaymentDate, setBatchPaymentDate] = useState('');

    const invoiceInputRef = React.useRef<HTMLInputElement>(null);
    const receiptInputRef = React.useRef<HTMLInputElement>(null);

    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRole = (userData.role || '').toLowerCase();
    const isController = userRole === 'controller';
    const isDiretoria = ['administrador', 'diretoria', 'ceo'].includes(userRole) || userData.permissions?.includes('*');
    const isAdmin = isDiretoria || isController;

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
            const missionFields = 'id, client, provider, origin, destination, status, created_at, start_time, end_time, start_km, end_km, total_distance, revenue_value, cost_value, toll_value, toll_value_provider, billing_approved, vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at, client_vehicle, client_vehicle_2, vehicle_id';
            const fetchAllMissions = async () => {
                let all: any[] = [];
                let from = 0;
                const pageSize = 1000;
                while (true) {
                    const { data, error } = await supabase.from('missions')
                        .select(missionFields)
                        .or('billing_approved.eq.true,status.eq.Concluída')
                        .gte('created_at', '2026-01-01')
                        .order('created_at', { ascending: false })
                        .range(from, from + pageSize - 1);
                    if (error) throw error;
                    if (data) all = all.concat(data);
                    if (!data || data.length < pageSize) break;
                    from += pageSize;
                }
                return all;
            };

            const [clientsRes, missionData, vehiclesRes, escortVehiclesRes] = await Promise.all([
                supabase.from('clients').select('id, name, trading_name').eq('status', 'Ativo').order('name'),
                fetchAllMissions(),
                supabase.from('client_vehicles').select('id, plate, model'),
                supabase.from('vehicles').select('id, plate, model')
            ]);

            if (clientsRes.data) setClients(clientsRes.data);

            const vehicleMap = new Map<number, { plate: string; model: string }>();
            (vehiclesRes.data || []).forEach((v: any) => vehicleMap.set(v.id, { plate: v.plate || '', model: v.model || '' }));
            const escortMap = new Map<number, { plate: string; model: string }>();
            (escortVehiclesRes.data || []).forEach((v: any) => escortMap.set(v.id, { plate: v.plate || '', model: v.model || '' }));
            const enrichedMissions = missionData.map((m: any) => {
                const v1 = m.client_vehicle ? vehicleMap.get(m.client_vehicle) : null;
                const v2 = m.client_vehicle_2 ? vehicleMap.get(m.client_vehicle_2) : null;
                const ev = m.vehicle_id ? escortMap.get(m.vehicle_id) : null;
                return { ...m, _plate1: v1?.plate || '', _plate2: v2?.plate || '', _escortPlate: ev?.plate || '' };
            });

            const uniqueProviders = [...new Set(enrichedMissions.map((m: any) => m.provider).filter(Boolean))].sort();
            setProviders(uniqueProviders as string[]);
            setMissions(enrichedMissions);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAuditTrail = async () => {
        setAuditLoading(true);
        try {
            const { data: logs } = await supabase.from('system_logs')
                .select('*')
                .in('entity', ['Mission', 'BillingApproval', 'BillingSnapshot'])
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
                .order('created_at', { ascending: false })
                .limit(500);

            if (logs) {
                const relevantLogs = logs.filter(log => {
                    try {
                        const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                        if (!details) return false;
                        const field = details.field || '';
                        const relevantFields = ['status', 'billing_approved', 'verified_by', 'verified_at', 'payment_date', 'vendor_os_number', 'invoice_number', 'is_same_os'];
                        if (relevantFields.includes(field)) return true;
                        if (log.entity === 'BillingApproval') return true;
                        if (log.action_type === 'VENDOR_VERIFICATION') return true;
                        if (log.action_type === 'STATUS_CHANGE') return true;
                        if (details.oldStatus || details.newStatus) return true;
                        if (details.oldValue !== undefined || details.newValue !== undefined) return true;
                        return false;
                    } catch { return log.entity === 'BillingApproval'; }
                });
                setAuditLog(relevantLogs.slice(0, 200));
            }
        } catch (e) {
            console.error('Erro ao carregar auditoria:', e);
        } finally {
            setAuditLoading(false);
        }
    };

    const lastSnapshotRef = React.useRef<number>(0);
    const saveStatsSnapshot = useCallback(async (statsData: { total: number; verified: number; paid: number; pending: number }, missionsList: any[]) => {
        const now = Date.now();
        if (now - lastSnapshotRef.current < 30 * 60 * 1000) return;
        lastSnapshotRef.current = now;
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            const verifiedIds = missionsList.filter(m => m.verified_by && m.verified_at).map(m => m.id);
            const paidIds = missionsList.filter(m => m.payment_date).map(m => m.id);
            await supabase.from('system_logs').insert([{
                user_name: userData.name || 'Sistema',
                action_type: 'VENDOR_STATS_SNAPSHOT',
                entity: 'VendorControl',
                entity_id: 'daily-snapshot',
                details: JSON.stringify({
                    ...statsData,
                    verifiedIds,
                    paidIds,
                    timestamp: new Date().toISOString(),
                    accessedBy: userData.name || 'Sistema'
                })
            }]);
        } catch (e) {
            console.error('Erro snapshot:', e);
        }
    }, []);

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
        const costVal = mission.cost_value || 0;
        const tollProvVal = Math.max(0, mission.toll_value_provider ?? mission.toll_value ?? 0);
        setEditCostValue(costVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setEditTollProviderValue(tollProvVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

        try {
            const [verRes] = await Promise.all([
                authFetch(`/api/vendor-verification/${mission.id}`).then(r => r.json()),
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

    const parseNumber = (v: string): number => {
        if (!v) return 0;
        let str = v.trim();
        if (str.includes(',') && str.includes('.')) {
            const lastComma = str.lastIndexOf(',');
            const lastDot = str.lastIndexOf('.');
            if (lastComma > lastDot) {
                str = str.replace(/\./g, '').replace(',', '.');
            } else {
                str = str.replace(/,/g, '');
            }
        } else if (str.includes(',')) {
            str = str.replace(',', '.');
        } else {
            str = str.replace(/\./g, '').replace(',', '.');
        }
        return parseFloat(str) || 0;
    };

    const handleSaveVerification = async () => {
        if (!selectedMission) return;
        if (!vendorOsNumber.trim()) {
            showNotification('Campo Obrigatório', 'Informe o Nº da OS Fornecedor.', 'error');
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        if (paymentDate && paymentDate > today) {
            showNotification('Data Inválida', 'A data de pagamento não pode ser posterior ao dia de hoje.', 'error');
            return;
        }

        setIsSaving(true);
        const now = new Date().toISOString();
        const userName = userData.name || userData.email || 'Desconhecido';
        const finalReleaseDate = releaseDate || now.split('T')[0];

        const newCostValue = parseNumber(editCostValue);
        const newTollProvValue = parseNumber(editTollProviderValue);

        try {
            const res = await authFetch(`/api/vendor-verification/${selectedMission.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_os_number: vendorOsNumber.trim(),
                    invoice_number: invoiceNumber.trim(),
                    release_date: finalReleaseDate,
                    payment_date: paymentDate || null,
                    verified_by: userName,
                    verified_at: now,
                    cost_value: newCostValue,
                    toll_value_provider: newTollProvValue,
                })
            });
            const json = await res.json();

            if (json.ok) {
                setVerifiedBy(userName);
                setVerifiedAt(now);
                setReleaseDate(finalReleaseDate);

                setMissions(prev => prev.map(m =>
                    m.id === selectedMission.id
                        ? { ...m, vendor_os_number: vendorOsNumber.trim(), invoice_number: invoiceNumber.trim(), release_date: finalReleaseDate, payment_date: paymentDate || null, verified_by: userName, verified_at: now, cost_value: newCostValue, toll_value_provider: newTollProvValue }
                        : m
                ));

                showNotification('Verificação Gravada', `OS ${selectedMission.id} verificada e travada por ${userName}. Custo: ${formatCurrency(newCostValue + newTollProvValue)}`, 'success');
                loadData();
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
        const todayBatch = new Date().toISOString().split('T')[0];
        if (batchPaymentDate && batchPaymentDate > todayBatch) {
            showNotification('Data Inválida', 'A data de pagamento não pode ser posterior ao dia de hoje.', 'error');
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
                const res = await authFetch(`/api/vendor-verification/${missionId}`, {
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
            await authFetch(`/api/vendor-verification/${selectedMission.id}`, {
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
            const matchesSearch = !searchTerm || 
                m.id.toLowerCase().includes(searchLower) ||
                (m.client || '').toLowerCase().includes(searchLower) ||
                (m.provider || '').toLowerCase().includes(searchLower) ||
                (m.vendor_os_number || '').toLowerCase().includes(searchLower) ||
                (m.invoice_number || '').toLowerCase().includes(searchLower) ||
                (m._plate1 || '').toLowerCase().includes(searchLower) ||
                (m._plate2 || '').toLowerCase().includes(searchLower) ||
                (m.origin || '').toLowerCase().includes(searchLower) ||
                (m.destination || '').toLowerCase().includes(searchLower) ||
                String(m.start_km || '').includes(searchLower) ||
                String(m.end_km || '').includes(searchLower) ||
                String(m.total_distance || '').includes(searchLower);
            return matchesProvider && matchesStatus && matchesDateFrom && matchesDateTo && matchesSearch;
        });
    }, [missions, selectedProvider, filterStatus, searchTerm, dateFrom, dateTo]);

    const stats = useMemo(() => {
        const total = missions.length;
        const verified = missions.filter(m => m.verified_by && m.verified_at).length;
        const pending = total - verified;
        const paid = missions.filter(m => m.payment_date).length;
        return { total, verified, pending, paid };
    }, [missions]);

    useEffect(() => {
        if (stats.total > 0) {
            saveStatsSnapshot(stats, missions);
        }
    }, [stats, missions, saveStatsSnapshot]);

    // --- Conferência de Divergências (Boletim do Fornecedor) ---
    const [divergenceOpen, setDivergenceOpen] = useState(false);
    const [divergenceLoading, setDivergenceLoading] = useState(false);
    const [divergenceFileName, setDivergenceFileName] = useState('');
    const [divergenceRows, setDivergenceRows] = useState<any[]>([]);
    const [divergenceResults, setDivergenceResults] = useState<any[]>([]);
    const [divergenceFilter, setDivergenceFilter] = useState<'DIVERGENT' | 'NOT_FOUND' | 'OK' | 'ALL'>('DIVERGENT');
    const [divergenceTolerance, setDivergenceTolerance] = useState(10);
    const divergenceFileInputRef = React.useRef<HTMLInputElement>(null);
    const [divergenceNotes, setDivergenceNotes] = useState<Record<string, string>>(() => {
        try { return JSON.parse(localStorage.getItem('divergenceNotes') || '{}'); } catch { return {}; }
    });
    const noteKey = useCallback((r: any) => {
        if (r?.mission?.id) return `m:${r.mission.id}`;
        return `n:${(r?.row?.numero || '').toUpperCase()}|${r?.row?.viaturaNorm || ''}|${r?.row?.startDt ? new Date(r.row.startDt).toISOString().slice(0,10) : ''}`;
    }, []);
    const updateNote = useCallback((key: string, value: string) => {
        setDivergenceNotes(prev => {
            const next = { ...prev, [key]: value };
            if (!value) delete next[key];
            try { localStorage.setItem('divergenceNotes', JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);
    const printDivergenceReport = useCallback(() => {
        document.body.classList.add('print-divergence');
        const cleanup = () => { document.body.classList.remove('print-divergence'); window.removeEventListener('afterprint', cleanup); };
        window.addEventListener('afterprint', cleanup);
        setTimeout(() => window.print(), 50);
    }, []);

    // Status derivado da tolerância atual + valores SEMPRE atualizados a partir
    // da lista viva de missões (re-resolve por id). Garante que edições na OS
    // (cost_value, toll_value, etc) reflitam imediatamente na conferência.
    const missionsById = useMemo(() => {
        const map = new Map<string, any>();
        (missions || []).forEach((m: any) => map.set(String(m.id), m));
        return map;
    }, [missions]);
    const divergenceResultsView = useMemo(() => {
        return divergenceResults.map(r => {
            if (!r.mission) {
                return { ...r, status: 'NOT_FOUND' };
            }
            const live = missionsById.get(String(r.mission.id)) || r.mission;
            const systemCost = (live.cost_value || 0) + Math.max(0, live.toll_value_provider ?? live.toll_value ?? 0);
            const diff = (r.valueProvider || 0) - systemCost;
            return {
                ...r,
                mission: live,
                valueSystem: systemCost,
                diff,
                status: Math.abs(diff) > divergenceTolerance ? 'DIVERGENT' : 'OK'
            };
        });
    }, [divergenceResults, divergenceTolerance, missionsById]);

    const [statsHistory, setStatsHistory] = useState<any[]>([]);
    const loadStatsHistory = async () => {
        const { data } = await supabase.from('system_logs')
            .select('details, created_at')
            .eq('action_type', 'VENDOR_STATS_SNAPSHOT')
            .eq('entity', 'VendorControl')
            .order('created_at', { ascending: false })
            .limit(50);
        if (data) {
            const parsed = data.map(d => {
                const det = typeof d.details === 'string' ? JSON.parse(d.details) : d.details;
                return { ...det, logged_at: d.created_at };
            });
            setStatsHistory(parsed);
        }
    };

    // ============== Conferência de Divergências de Valor ==============
    const normalizePlate = (s: any): string => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const splitPlates = (s: any): string[] => String(s || '')
        .toUpperCase()
        .split(/[\s,;/|\\]+/)
        .map(p => p.replace(/[^A-Z0-9]/g, ''))
        .filter(p => p.length >= 6 && p.length <= 8);
    const parseMoney = (v: any): number => {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return v;
        const s = String(v).replace(/[R$\s.]/g, '').replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    };
    const parseSheetDate = (v: any): Date | null => {
        if (v === null || v === undefined || v === '') return null;
        if (v instanceof Date) return v;
        if (typeof v === 'number') {
            const d = XLSX.SSF.parse_date_code(v);
            if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
        }
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
        if (m) {
            const day = parseInt(m[1], 10);
            const mon = parseInt(m[2], 10) - 1;
            let yr = parseInt(m[3], 10);
            if (yr < 100) yr += 2000;
            return new Date(yr, mon, day);
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    };
    const parseSheetTime = (v: any): { h: number; m: number } | null => {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number') {
            const total = Math.round(v * 24 * 60);
            return { h: Math.floor(total / 60) % 24, m: total % 60 };
        }
        const s = String(v).trim();
        const mm = s.match(/(\d{1,2})[:h](\d{1,2})/i);
        if (mm) return { h: parseInt(mm[1], 10), m: parseInt(mm[2], 10) };
        return null;
    };
    const combineDateTime = (d: Date | null, t: { h: number; m: number } | null): Date | null => {
        if (!d) return null;
        const out = new Date(d.getTime());
        if (t) { out.setHours(t.h, t.m, 0, 0); }
        return out;
    };
    const dateKey = (d: Date | null): string => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

    const handleDivergenceFile = async (file: File) => {
        setDivergenceLoading(true);
        setDivergenceFileName(file.name);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
            // Procurar primeira sheet que contenha "Boletim" no nome, senão a primeira
            let sheetName = wb.SheetNames.find(n => /boletim/i.test(n)) || wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

            // Detectar linha de cabeçalho: contém "VIATURA" e ("TOTAL" ou "KM INICIAL")
            let headerIdx = -1;
            for (let i = 0; i < Math.min(aoa.length, 30); i++) {
                const row = aoa[i].map(c => String(c || '').toUpperCase().trim());
                if (row.some(c => c.includes('VIATURA')) && row.some(c => c.includes('KM INICIAL'))) {
                    headerIdx = i;
                    break;
                }
            }
            if (headerIdx === -1) {
                throw new Error('Cabeçalho não encontrado. Verifique se a planilha possui as colunas VIATURA e KM INICIAL.');
            }
            const headerRow = aoa[headerIdx].map((c: any) => String(c || '').toUpperCase().trim());
            const hasMoneyCol = headerRow.some(h => h === 'TOTAL' || h.includes('TOTAL')) || headerRow.some(h => h === 'VALOR' || h.includes('VALOR'));
            const hasDateCol = headerRow.some(h => h.includes('DATA'));
            if (!hasMoneyCol) throw new Error('Coluna de valor não encontrada (esperado "TOTAL" ou "VALOR" no cabeçalho).');
            if (!hasDateCol) throw new Error('Coluna de data não encontrada (esperado "DATA INÍCIO" no cabeçalho).');
            const header = aoa[headerIdx].map((c: any) => String(c || '').toUpperCase().trim());
            const colIdx = (...names: string[]): number => {
                // 1) match exato (prioridade)
                for (const n of names) {
                    const idx = header.findIndex(h => h === n);
                    if (idx >= 0) return idx;
                }
                // 2) match parcial (fallback)
                for (const n of names) {
                    const idx = header.findIndex(h => h.includes(n));
                    if (idx >= 0) return idx;
                }
                return -1;
            };
            const idxNumero = colIdx('Nº', 'NUMERO', 'OS');
            const idxRota = colIdx('ROTA');
            const idxDataIni = colIdx('DATA INÍCIO', 'DATA INICIO', 'DATA INICIAL');
            const idxHoraIni = colIdx('HORA INÍCIO', 'HORA INICIO', 'HORA INICIAL');
            const idxDataFim = colIdx('DATA FIM', 'DATA FINAL', 'DATA TÉRMINO', 'DATA TERMINO');
            const idxHoraFim = colIdx('HORA FIM', 'HORA FINAL', 'HORA TÉRMINO', 'HORA TERMINO');
            const idxViatura = colIdx('VIATURA');
            const idxEscoltado = colIdx('ESCOLTADO', 'VEÍC. ESCOLTADO', 'VEIC. ESCOLTADO');
            const idxKmIni = colIdx('KM INICIAL');
            const idxKmFim = colIdx('KM FINAL');
            const idxKmTot = colIdx('KM TOTAL');
            const idxPedagio = colIdx('PEDÁGIO', 'PEDAGIO');
            const idxTotal = colIdx('TOTAL');
            const idxValor = colIdx('VALOR');

            const rows: any[] = [];
            for (let i = headerIdx + 1; i < aoa.length; i++) {
                const r = aoa[i];
                if (!r || r.every((c: any) => c === '' || c === null || c === undefined)) continue;
                const numero = String(r[idxNumero] || '').trim();
                const dataIni = parseSheetDate(r[idxDataIni]);
                if (!numero && !dataIni) continue;
                // Ignorar linhas de total/rodapé (sem data e sem placa)
                const viatura = String(r[idxViatura] || '').trim();
                if (!viatura && !dataIni) continue;
                const horaIni = parseSheetTime(r[idxHoraIni]);
                const startDt = combineDateTime(dataIni, horaIni);
                const dataFim = parseSheetDate(r[idxDataFim]);
                const horaFim = parseSheetTime(r[idxHoraFim]);
                const endDt = combineDateTime(dataFim, horaFim);
                const rawValor = parseMoney(r[idxValor]);
                const rawTotal = parseMoney(r[idxTotal]);
                rows.push({
                    rowNumber: i + 1,
                    numero,
                    rota: String(r[idxRota] || '').trim(),
                    valor: rawValor,
                    viatura,
                    viaturaNorm: normalizePlate(viatura),
                    escoltado: String(r[idxEscoltado] || '').trim(),
                    escoltadoPlates: splitPlates(r[idxEscoltado]),
                    dataIni,
                    horaIni,
                    startDt,
                    dataFim,
                    horaFim,
                    endDt,
                    kmIni: parseMoney(r[idxKmIni]),
                    kmFim: parseMoney(r[idxKmFim]),
                    kmTot: parseMoney(r[idxKmTot]),
                    pedagio: parseMoney(r[idxPedagio]),
                    total: rawTotal > 0 ? rawTotal : rawValor
                });
            }
            setDivergenceRows(rows);

            // ---- Matching ----
            // Indexar missões por dateKey(start_time) e por placa escolta
            const missionsArr = missions || [];
            const byDate = new Map<string, any[]>();
            missionsArr.forEach((m: any) => {
                if (!m.start_time) return;
                const dk = dateKey(new Date(m.start_time));
                if (!byDate.has(dk)) byDate.set(dk, []);
                byDate.get(dk)!.push(m);
            });
            const usedMissionIds = new Set<string>();
            const results: any[] = [];

            for (const row of rows) {
                const candidates: { mission: any; score: number; reasons: string[] }[] = [];

                // 1) Match direto por vendor_os_number (se preenchido)
                if (row.numero) {
                    missionsArr.forEach((m: any) => {
                        if (m.vendor_os_number && String(m.vendor_os_number).trim().toUpperCase() === row.numero.toUpperCase()) {
                            candidates.push({ mission: m, score: 200, reasons: ['Nº OS Fornecedor'] });
                        }
                    });
                }

                // 2) Heurística por placa escolta + data + janela
                const dk = dateKey(row.dataIni);
                const sameDay = byDate.get(dk) || [];
                const prevDay = byDate.get(dateKey(row.dataIni ? new Date(row.dataIni.getTime() - 86400000) : null)) || [];
                const nextDay = byDate.get(dateKey(row.dataIni ? new Date(row.dataIni.getTime() + 86400000) : null)) || [];
                const pool = [...sameDay, ...prevDay, ...nextDay];

                pool.forEach((m: any) => {
                    let score = 0;
                    const reasons: string[] = [];
                    const mEscort = normalizePlate(m._escortPlate);
                    if (row.viaturaNorm && mEscort && row.viaturaNorm === mEscort) {
                        score += 80; reasons.push('Placa Escolta');
                    }
                    const clientPlates = [normalizePlate(m._plate1), normalizePlate(m._plate2)].filter(Boolean);
                    if (row.escoltadoPlates.some((p: string) => clientPlates.includes(p))) {
                        score += 50; reasons.push('Placa Escoltado');
                    }
                    // Data início
                    if (m.start_time && row.startDt) {
                        const mStart = new Date(m.start_time);
                        const diffMs = Math.abs(mStart.getTime() - row.startDt.getTime());
                        const diffMin = diffMs / 60000;
                        if (dateKey(mStart) === dk) score += 25;
                        if (diffMin <= 30) { score += 25; reasons.push('Horário'); }
                        else if (diffMin <= 120) { score += 10; }
                    }
                    // KM inicial
                    if (row.kmIni && m.start_km) {
                        const diff = Math.abs(row.kmIni - m.start_km);
                        if (diff <= 5) { score += 20; reasons.push('KM inicial'); }
                        else if (diff <= 50) { score += 5; }
                    }
                    if (score > 0) candidates.push({ mission: m, score, reasons });
                });

                candidates.sort((a, b) => b.score - a.score);
                // Pegar primeiro candidato não utilizado com score mínimo
                let best: { mission: any; score: number; reasons: string[] } | null = null;
                for (const c of candidates) {
                    if (c.score >= 80 && !usedMissionIds.has(String(c.mission.id))) {
                        best = c; break;
                    }
                }
                // Se nenhum disponível mas há candidato forte (>=120), permitir reuso
                if (!best && candidates.length > 0 && candidates[0].score >= 120) best = candidates[0];

                if (!best) {
                    results.push({
                        status: 'NOT_FOUND',
                        row,
                        mission: null,
                        valueProvider: row.total,
                        valueSystem: 0,
                        diff: row.total,
                        reasons: [],
                        details: []
                    });
                    continue;
                }

                usedMissionIds.add(String(best.mission.id));
                const m = best.mission;
                const systemCost = (m.cost_value || 0) + Math.max(0, m.toll_value_provider ?? m.toll_value ?? 0);
                const diff = row.total - systemCost;
                const details: { field: string; planilha: any; sistema: any }[] = [];

                // Campo a campo
                if (m.start_km && row.kmIni && Math.abs(row.kmIni - m.start_km) > 1) {
                    details.push({ field: 'KM Inicial', planilha: row.kmIni, sistema: m.start_km });
                }
                if (m.end_km && row.kmFim && Math.abs(row.kmFim - m.end_km) > 1) {
                    details.push({ field: 'KM Final', planilha: row.kmFim, sistema: m.end_km });
                }
                if (m.start_time && row.startDt) {
                    const diffMin = Math.abs(new Date(m.start_time).getTime() - row.startDt.getTime()) / 60000;
                    if (diffMin > 15) details.push({ field: 'Início', planilha: formatDateTimeBR(row.startDt.toISOString()), sistema: formatDateTimeBR(m.start_time) });
                }
                if (m.end_time && row.endDt) {
                    const diffMin = Math.abs(new Date(m.end_time).getTime() - row.endDt.getTime()) / 60000;
                    if (diffMin > 15) details.push({ field: 'Fim', planilha: formatDateTimeBR(row.endDt.toISOString()), sistema: formatDateTimeBR(m.end_time) });
                }
                if (row.pedagio && Math.abs(row.pedagio - (m.toll_value_provider ?? m.toll_value ?? 0)) > 0.5) {
                    details.push({ field: 'Pedágio', planilha: row.pedagio, sistema: m.toll_value_provider ?? m.toll_value ?? 0 });
                }
                const mEscort = normalizePlate(m._escortPlate);
                if (row.viaturaNorm && mEscort && row.viaturaNorm !== mEscort) {
                    details.push({ field: 'Placa Escolta', planilha: row.viatura, sistema: m._escortPlate });
                }

                results.push({
                    status: Math.abs(diff) > divergenceTolerance ? 'DIVERGENT' : 'OK',
                    row,
                    mission: m,
                    valueProvider: row.total,
                    valueSystem: systemCost,
                    diff,
                    matchScore: best.score,
                    reasons: best.reasons,
                    details
                });
            }

            setDivergenceResults(results);
            setDivergenceFilter('DIVERGENT');
            showNotification(`Conferência concluída: ${results.length} linhas analisadas.`, 'success');
        } catch (err: any) {
            console.error(err);
            showNotification(`Erro ao processar a planilha: ${err.message || err}`, 'error');
            setDivergenceRows([]);
            setDivergenceResults([]);
        } finally {
            setDivergenceLoading(false);
        }
    };

    const exportDivergenceReport = () => {
        if (divergenceResultsView.length === 0) return;
        const data = divergenceResultsView
            .filter(r => divergenceFilter === 'ALL' || r.status === divergenceFilter)
            .map(r => ({
                'OS Fornecedor': r.row.numero,
                'OS TMSEG': r.mission ? r.mission.id : '(não encontrada)',
                'Status': r.status,
                'Rota': r.row.rota,
                'Placa Escolta (Fornecedor)': r.row.viatura,
                'Placa Escolta (TMSEG)': r.mission?._escortPlate || '',
                'Placa Escoltado (Fornecedor)': r.row.escoltado,
                'Placa Escoltado (TMSEG)': [r.mission?._plate1, r.mission?._plate2].filter(Boolean).join(' / '),
                'Início Fornecedor': r.row.startDt ? formatDateTimeBR(r.row.startDt.toISOString()) : '',
                'Início TMSEG': r.mission?.start_time ? formatDateTimeBR(r.mission.start_time) : '',
                'KM Ini Fornecedor': r.row.kmIni || 0,
                'KM Ini TMSEG': r.mission?.start_km || 0,
                'KM Fim Fornecedor': r.row.kmFim || 0,
                'KM Fim TMSEG': r.mission?.end_km || 0,
                'Pedágio Fornecedor': r.row.pedagio || 0,
                'Pedágio TMSEG': r.mission?.toll_value_provider ?? r.mission?.toll_value ?? 0,
                'Total Fornecedor (R$)': r.valueProvider,
                'Total TMSEG (R$)': r.valueSystem,
                'Diferença (R$)': r.diff,
                'Score Match': r.matchScore || 0,
                'Critérios': (r.reasons || []).join(', '),
                'Campos Divergentes': (r.details || []).map((d: any) => d.field).join(', ')
            }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Divergências');
        const fname = `Divergencias_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fname);
    };

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
                                    </div>

                                    <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Receipt size={14} className="text-red-600" />
                                            <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">Valores do Fornecedor</span>
                                            {isLocked && !isAdmin && <Lock size={12} className="text-red-400 ml-auto" />}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1 block">Custo Serviço (R$)</label>
                                                <input
                                                    type="text"
                                                    value={editCostValue}
                                                    onChange={e => setEditCostValue(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-sm font-black text-red-700 text-right disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-edit-cost-value"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1 block">Pedágio Forn. (R$)</label>
                                                <input
                                                    type="text"
                                                    value={editTollProviderValue}
                                                    onChange={e => setEditTollProviderValue(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-sm font-black text-red-700 text-right disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-edit-toll-provider"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-red-200 pt-2">
                                            <span className="text-[10px] font-black text-red-600 uppercase">Custo Total:</span>
                                            <span className="font-black text-red-700 text-sm">{formatCurrency(parseNumber(editCostValue) + parseNumber(editTollProviderValue))}</span>
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
                                                    max={new Date().toISOString().split('T')[0]}
                                                    onChange={e => setPaymentDate(e.target.value)}
                                                    disabled={isLocked && !isAdmin}
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    data-testid="input-payment-date"
                                                />
                                                {isLocked && !isAdmin && <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
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
                                                <p className="text-sm font-black text-green-800 flex items-center gap-2">
                                                    <Lock size={14} /> OS Verificada e Travada
                                                </p>
                                                <p className="text-xs text-green-600 font-bold mt-1">
                                                    Verificado por <span className="font-black">{verifiedBy}</span> em <span className="font-black">{fmtDateTime(verifiedAt)}</span>
                                                </p>
                                                <p className="text-[9px] text-amber-600 font-bold mt-1">
                                                    Somente Diretoria ou Controller podem editar/desbloquear esta OS.
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
                                                onClick={handleSaveVerification}
                                                disabled={isSaving}
                                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm py-3 rounded-xl transition-colors disabled:opacity-50"
                                                data-testid="button-save-locked"
                                            >
                                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                Salvar Alterações
                                            </button>
                                        )}

                                        {isLocked && isAdmin && (
                                            <button
                                                onClick={handleUnlock}
                                                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm py-3 rounded-xl transition-colors"
                                                data-testid="button-unlock-verification"
                                            >
                                                <Lock size={16} /> Desbloquear
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

                <button
                    data-testid="btn-audit-trail"
                    onClick={() => {
                        setShowAuditPanel(!showAuditPanel);
                        if (!showAuditPanel) {
                            loadAuditTrail();
                            loadStatsHistory();
                        }
                    }}
                    className={`rounded-2xl px-5 py-3 flex items-center gap-3 min-w-[130px] transition-all ${showAuditPanel ? 'bg-red-600 text-white border border-red-600' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
                >
                    <Eye size={24} className={showAuditPanel ? 'text-white' : 'text-red-600'} />
                    <div>
                        <p className={`text-xs font-black uppercase tracking-widest ${showAuditPanel ? 'text-white' : 'text-red-600'}`}>Auditoria</p>
                        <p className={`text-[9px] font-bold ${showAuditPanel ? 'text-red-100' : 'text-gray-400'}`}>Rastreamento</p>
                    </div>
                </button>

                <button
                    data-testid="btn-open-divergence"
                    onClick={() => setDivergenceOpen(true)}
                    className="rounded-2xl px-5 py-3 flex items-center gap-3 min-w-[150px] bg-white border border-gray-200 hover:bg-amber-50 hover:border-amber-300 transition-all"
                >
                    <Scale size={24} className="text-amber-600" />
                    <div className="text-left">
                        <p className="text-xs font-black uppercase tracking-widest text-amber-700">Conferir Boletim</p>
                        <p className="text-[9px] font-bold text-gray-400">Divergências de Valor</p>
                    </div>
                </button>
            </div>

            {showAuditPanel && (
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
                    <div className="bg-red-50 p-4 border-b border-red-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Eye size={20} className="text-red-600" />
                            <h3 className="font-black text-sm text-red-800 uppercase tracking-widest">Auditoria e Rastreamento</h3>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { loadAuditTrail(); loadStatsHistory(); }} className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-black rounded-lg hover:bg-red-700" data-testid="btn-refresh-audit">
                                <RefreshCw size={12} className={auditLoading ? 'animate-spin' : ''} />
                            </button>
                            <button onClick={() => setShowAuditPanel(false)} className="px-3 py-1.5 bg-gray-200 text-gray-600 text-[10px] font-black rounded-lg hover:bg-gray-300">
                                <X size={12} />
                            </button>
                        </div>
                    </div>

                    <div className="p-4 space-y-4">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <Hash size={12} /> Evolução dos Contadores
                        </h4>
                        {statsHistory.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-4">Nenhum snapshot registrado ainda. A cada 30 min que alguém acessar esta tela, os contadores serão gravados automaticamente.</p>
                        ) : (
                            <div className="max-h-[200px] overflow-y-auto">
                                <table className="w-full text-[11px]">
                                    <thead className="sticky top-0 bg-gray-50">
                                        <tr className="text-gray-500 font-black uppercase text-[9px]">
                                            <th className="px-3 py-2 text-left">Data/Hora</th>
                                            <th className="px-3 py-2 text-right">Total</th>
                                            <th className="px-3 py-2 text-right text-green-600">Verificadas</th>
                                            <th className="px-3 py-2 text-right text-blue-600">Pagas</th>
                                            <th className="px-3 py-2 text-right text-amber-600">Pendentes</th>
                                            <th className="px-3 py-2 text-left">Quem acessou</th>
                                            <th className="px-3 py-2 text-left">OS que saíram / entraram</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statsHistory.map((s, i) => {
                                            const prev = statsHistory[i + 1];
                                            const diffV = prev ? s.verified - prev.verified : 0;
                                            const diffP = prev ? s.paid - prev.paid : 0;
                                            const diffPend = prev ? s.pending - prev.pending : 0;
                                            let lostVerified: string[] = [];
                                            let gainedVerified: string[] = [];
                                            let lostPaid: string[] = [];
                                            let gainedPaid: string[] = [];
                                            if (prev && prev.verifiedIds && s.verifiedIds) {
                                                const prevSet = new Set(prev.verifiedIds);
                                                const currSet = new Set(s.verifiedIds);
                                                lostVerified = prev.verifiedIds.filter((id: string) => !currSet.has(id));
                                                gainedVerified = s.verifiedIds.filter((id: string) => !prevSet.has(id));
                                            }
                                            if (prev && prev.paidIds && s.paidIds) {
                                                const prevSet = new Set(prev.paidIds);
                                                const currSet = new Set(s.paidIds);
                                                lostPaid = prev.paidIds.filter((id: string) => !currSet.has(id));
                                                gainedPaid = s.paidIds.filter((id: string) => !prevSet.has(id));
                                            }
                                            const hasChanges = lostVerified.length > 0 || gainedVerified.length > 0 || lostPaid.length > 0 || gainedPaid.length > 0;
                                            return (
                                                <tr key={i} className={`border-b border-gray-100 ${diffV < 0 || diffP < 0 ? 'bg-red-50' : ''}`}>
                                                    <td className="px-3 py-2 whitespace-nowrap font-bold">{fmtDateTime(s.logged_at)}</td>
                                                    <td className="px-3 py-2 text-right font-black">{s.total}</td>
                                                    <td className="px-3 py-2 text-right font-black text-green-700">
                                                        {s.verified}
                                                        {diffV !== 0 && <span className={`ml-1 text-[9px] font-black ${diffV > 0 ? 'text-green-500' : 'text-red-600'}`}>({diffV > 0 ? '+' : ''}{diffV})</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-black text-blue-700">
                                                        {s.paid}
                                                        {diffP !== 0 && <span className={`ml-1 text-[9px] font-black ${diffP > 0 ? 'text-blue-500' : 'text-red-600'}`}>({diffP > 0 ? '+' : ''}{diffP})</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-black text-amber-700">
                                                        {s.pending}
                                                        {diffPend !== 0 && <span className={`ml-1 text-[9px] font-black ${diffPend > 0 ? 'text-amber-500' : 'text-green-500'}`}>({diffPend > 0 ? '+' : ''}{diffPend})</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">{s.accessedBy || '-'}</td>
                                                    <td className="px-3 py-2 max-w-[250px]">
                                                        {!hasChanges && <span className="text-gray-300 text-[9px]">—</span>}
                                                        {lostVerified.length > 0 && (
                                                            <div className="text-[9px]"><span className="font-black text-red-600">Perdeu verif:</span> {lostVerified.join(', ')}</div>
                                                        )}
                                                        {gainedVerified.length > 0 && (
                                                            <div className="text-[9px]"><span className="font-black text-green-600">+Verificou:</span> {gainedVerified.join(', ')}</div>
                                                        )}
                                                        {lostPaid.length > 0 && (
                                                            <div className="text-[9px]"><span className="font-black text-red-600">Perdeu pago:</span> {lostPaid.join(', ')}</div>
                                                        )}
                                                        {gainedPaid.length > 0 && (
                                                            <div className="text-[9px]"><span className="font-black text-blue-600">+Pagou:</span> {gainedPaid.join(', ')}</div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 pt-3 border-t border-gray-200">
                            <FileText size={12} /> Alterações em Missões (últimos 7 dias)
                        </h4>
                        <div className="max-h-[250px] overflow-y-auto">
                            {auditLoading ? (
                                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
                            ) : auditLog.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">Nenhuma alteração relevante encontrada nos logs.</p>
                            ) : (
                                <table className="w-full text-[11px]">
                                    <thead className="sticky top-0 bg-gray-50">
                                        <tr className="text-gray-500 font-black uppercase text-[9px]">
                                            <th className="px-3 py-2 text-left">Data/Hora</th>
                                            <th className="px-3 py-2 text-left">OS</th>
                                            <th className="px-3 py-2 text-left">O que mudou</th>
                                            <th className="px-3 py-2 text-left">Quem alterou</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLog.map((log, i) => {
                                            const details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
                                            const field = details.field || log.action_type || '';
                                            let description = '';
                                            let severity: 'danger' | 'warning' | 'info' = 'info';
                                            if (field === 'status') { description = `Status: ${details.oldValue || details.oldStatus || '?'} → ${details.newValue || details.newStatus || '?'}`; severity = 'danger'; }
                                            else if (field === 'billing_approved') { description = `Aprovação fatur.: ${details.oldValue ? '✓ Aprovado' : '✗ Pendente'} → ${details.newValue ? '✓ Aprovado' : '✗ DESAPROVADO'}`; severity = details.newValue ? 'info' : 'danger'; }
                                            else if (field === 'is_same_os') { description = `Mesma OS: ${details.oldValue ? 'Sim' : 'Não'} → ${details.newValue ? 'Sim' : 'Não'}`; severity = 'warning'; }
                                            else if (field === 'verified_by' || log.action_type === 'VENDOR_VERIFICATION') { description = `Verificação por ${details.verified_by || details.user || log.user_name}`; }
                                            else if (log.entity === 'BillingApproval') { description = `Aprovação ${details.stage || ''} por ${details.user || log.user_name}`; }
                                            else if (details.oldValue !== undefined) { description = `${field}: ${details.oldValue} → ${details.newValue}`; }
                                            else { description = `${log.action_type}: ${JSON.stringify(details).slice(0, 100)}`; }

                                            return (
                                                <tr key={i} className={`border-b border-gray-100 ${severity === 'danger' ? 'bg-red-50' : severity === 'warning' ? 'bg-amber-50' : ''}`}>
                                                    <td className="px-3 py-1.5 whitespace-nowrap font-bold text-gray-500">{fmtDateTime(log.created_at)}</td>
                                                    <td className="px-3 py-1.5 font-black text-blue-700 whitespace-nowrap">{log.entity_id}</td>
                                                    <td className={`px-3 py-1.5 font-bold ${severity === 'danger' ? 'text-red-700' : severity === 'warning' ? 'text-amber-700' : 'text-gray-700'}`} title={description}>{description}</td>
                                                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{log.user_name}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Buscar por OS, Placa, Cliente, Fornecedor, NF, KM, Origem, Destino..."
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
                                    <input type="date" value={batchPaymentDate} max={new Date().toISOString().split('T')[0]} onChange={e => setBatchPaymentDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" data-testid="batch-input-payment-date" />
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
                                                <button onClick={() => toggleSelection(m.id)} className="p-1 hover:bg-gray-100 rounded transition-colors" data-testid={`checkbox-${m.id}`}>
                                                    {selectedIds.has(m.id) ? <CheckSquare size={16} className="text-blue-600" /> : isVerified ? <CheckCircle2 size={16} className="text-green-400" /> : <Square size={16} className="text-gray-400" />}
                                                </button>
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
                                                <span className="text-[10px] font-bold text-gray-700">{formatDateBR(m.start_time)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{formatDateBR(m.end_time)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.start_time ? new Date(m.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold text-gray-700">{m.end_time ? new Date(m.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'}</span>
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
                        <span>Exibindo {filteredMissions.length} de {missions.length} missões</span>
                        <span>Total Custo: <span className="text-red-600 font-black">{formatCurrency(filteredMissions.reduce((sum, m) => sum + (m.cost_value || 0) + Math.max(0, m.toll_value_provider ?? m.toll_value ?? 0), 0))}</span></span>
                    </div>
                )}
            </div>

            {/* ============== Modal de Conferência de Divergências ============== */}
            {divergenceOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" data-testid="modal-divergence">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">
                        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Scale className="text-amber-600" size={26} />
                                <div>
                                    <h2 className="text-base font-black text-amber-800 uppercase tracking-wide">Conferência de Divergências de Valor</h2>
                                    <p className="text-[11px] text-amber-700 font-medium">Importe o Boletim do fornecedor (.xlsx) e compare cada OS com o sistema TMSEG.</p>
                                </div>
                            </div>
                            <button onClick={() => setDivergenceOpen(false)} className="p-2 rounded-lg hover:bg-amber-100" data-testid="btn-close-divergence">
                                <X size={20} className="text-amber-700" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Toolbar */}
                            <div className="flex flex-wrap items-center gap-3 mb-5">
                                <input
                                    ref={divergenceFileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleDivergenceFile(f); e.target.value = ''; }}
                                    data-testid="input-divergence-file"
                                />
                                <button
                                    onClick={() => divergenceFileInputRef.current?.click()}
                                    disabled={divergenceLoading}
                                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-widest rounded-lg flex items-center gap-2 disabled:opacity-50"
                                    data-testid="btn-upload-divergence"
                                >
                                    {divergenceLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                    {divergenceLoading ? 'Processando...' : 'Importar Boletim (.xlsx)'}
                                </button>
                                {divergenceFileName && (
                                    <span className="text-xs text-gray-600 flex items-center gap-2">
                                        <FileSpreadsheet size={14} className="text-emerald-600" />
                                        {divergenceFileName}
                                    </span>
                                )}
                                <div className="flex items-center gap-2 text-[11px] text-gray-600">
                                    <label className="font-bold uppercase tracking-widest">Tolerância:</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={divergenceTolerance}
                                        onChange={e => setDivergenceTolerance(Math.max(0, parseFloat(e.target.value) || 0))}
                                        className="w-20 px-2 py-1 border rounded text-xs"
                                        data-testid="input-divergence-tolerance"
                                    />
                                    <span>R$</span>
                                </div>
                                {divergenceResultsView.length > 0 && (
                                    <>
                                        <div className="flex items-center gap-1 ml-auto">
                                            {([
                                                { v: 'DIVERGENT', l: 'Divergentes', c: 'red' },
                                                { v: 'NOT_FOUND', l: 'Não Encontradas', c: 'orange' },
                                                { v: 'OK', l: 'Conferidas', c: 'green' },
                                                { v: 'ALL', l: 'Todas', c: 'gray' }
                                            ] as const).map(opt => {
                                                const count = opt.v === 'ALL' ? divergenceResultsView.length : divergenceResultsView.filter(r => r.status === opt.v).length;
                                                const active = divergenceFilter === opt.v;
                                                return (
                                                    <button
                                                        key={opt.v}
                                                        onClick={() => setDivergenceFilter(opt.v)}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${active ? `bg-${opt.c}-600 text-white` : `bg-${opt.c}-50 text-${opt.c}-700 hover:bg-${opt.c}-100`}`}
                                                        data-testid={`btn-divfilter-${opt.v}`}
                                                    >
                                                        {opt.l} ({count})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={printDivergenceReport}
                                            className="px-3 py-1.5 bg-slate-800 hover:bg-black text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 no-print"
                                            data-testid="btn-print-divergence"
                                            title="Imprimir esta tela em uma única folha"
                                        >
                                            <Printer size={14} /> Imprimir
                                        </button>
                                        <button
                                            onClick={exportDivergenceReport}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 no-print"
                                            data-testid="btn-export-divergence"
                                        >
                                            <Download size={14} /> Exportar
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Conteúdo */}
                            {divergenceResultsView.length === 0 && !divergenceLoading && (
                                <div className="text-center py-14 border-2 border-dashed border-amber-200 rounded-2xl bg-amber-50/40">
                                    <FileSpreadsheet className="mx-auto text-amber-400 mb-3" size={48} />
                                    <p className="text-sm font-black text-amber-800 uppercase tracking-widest">Selecione o Boletim do fornecedor</p>
                                    <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">O sistema fará o cruzamento por placa de escolta, placa escoltada, datas/horas e KM, e apontará apenas as divergências de valor acima de <b>R$ {divergenceTolerance.toFixed(2)}</b>.</p>
                                </div>
                            )}

                            {divergenceResultsView.length > 0 && (
                                <>
                                    {(() => {
                                        const totals = divergenceResultsView.reduce((acc, r) => {
                                            acc.provider += r.valueProvider || 0;
                                            acc.system += r.valueSystem || 0;
                                            if (r.status === 'DIVERGENT') { acc.divCount++; acc.divSum += r.diff; }
                                            if (r.status === 'NOT_FOUND') { acc.nfCount++; acc.nfSum += r.valueProvider; }
                                            if (r.status === 'OK') acc.okCount++;
                                            return acc;
                                        }, { provider: 0, system: 0, divCount: 0, divSum: 0, nfCount: 0, nfSum: 0, okCount: 0 });
                                        return (
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Linhas analisadas</p>
                                                    <p className="text-xl font-black text-gray-800">{divergenceResultsView.length}</p>
                                                </div>
                                                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                                                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Conferidas</p>
                                                    <p className="text-xl font-black text-emerald-700">{totals.okCount}</p>
                                                </div>
                                                <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                                                    <p className="text-[9px] font-black text-red-700 uppercase tracking-widest">Divergentes</p>
                                                    <p className="text-xl font-black text-red-700">{totals.divCount}</p>
                                                    <p className="text-[10px] text-red-600 font-bold">{formatCurrency(totals.divSum)}</p>
                                                </div>
                                                <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
                                                    <p className="text-[9px] font-black text-orange-700 uppercase tracking-widest">Não Encontradas</p>
                                                    <p className="text-xl font-black text-orange-700">{totals.nfCount}</p>
                                                    <p className="text-[10px] text-orange-600 font-bold">{formatCurrency(totals.nfSum)}</p>
                                                </div>
                                                <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                                                    <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Totais</p>
                                                    <p className="text-[11px] font-bold text-gray-600">Forn.: <span className="text-blue-700">{formatCurrency(totals.provider)}</span></p>
                                                    <p className="text-[11px] font-bold text-gray-600">Sist.: <span className="text-blue-700">{formatCurrency(totals.system)}</span></p>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                                            <table className="w-full text-[11px]">
                                                <thead className="bg-gray-100 sticky top-0 z-10">
                                                    <tr className="text-gray-600 font-black uppercase text-[9px] tracking-widest">
                                                        <th className="px-3 py-2 text-left">OS Fornecedor</th>
                                                        <th className="px-3 py-2 text-left">OS TMSEG</th>
                                                        <th className="px-3 py-2 text-left">Data</th>
                                                        <th className="px-3 py-2 text-left">Placa Esc.</th>
                                                        <th className="px-3 py-2 text-left">Escoltado</th>
                                                        <th className="px-3 py-2 text-right">Vlr Fornec.</th>
                                                        <th className="px-3 py-2 text-right">Vlr TMSEG</th>
                                                        <th className="px-3 py-2 text-right">Diferença</th>
                                                        <th className="px-3 py-2 text-left">Observações</th>
                                                        <th className="px-3 py-2 text-center"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {divergenceResultsView.filter(r => divergenceFilter === 'ALL' || r.status === divergenceFilter).map((r, idx) => {
                                                        const isDiv = r.status === 'DIVERGENT';
                                                        const isNF = r.status === 'NOT_FOUND';
                                                        return (
                                                            <tr key={idx} className={`${isDiv ? 'bg-red-50/40' : isNF ? 'bg-orange-50/40' : 'bg-white'} hover:bg-gray-50`} data-testid={`row-divergence-${idx}`}>
                                                                <td className="px-3 py-2 font-black text-gray-800">{r.row.numero || '—'}</td>
                                                                <td className="px-3 py-2 font-mono text-blue-700">{r.mission ? `#${String(r.mission.id).slice(-6)}` : <span className="text-orange-700 font-bold">—</span>}</td>
                                                                <td className="px-3 py-2 text-gray-600">{r.row.startDt ? formatDateTimeBR(r.row.startDt.toISOString()) : ''}</td>
                                                                <td className="px-3 py-2">
                                                                    <div className="font-bold text-gray-700">{r.row.viatura}</div>
                                                                    {r.mission?._escortPlate && normalizePlate(r.mission._escortPlate) !== r.row.viaturaNorm && (
                                                                        <div className="text-[9px] text-red-600 font-bold">sist: {r.mission._escortPlate}</div>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-gray-700">{r.row.escoltado}</td>
                                                                <td className="px-3 py-2 text-right font-black text-blue-700">{formatCurrency(r.valueProvider)}</td>
                                                                <td className="px-3 py-2 text-right font-black text-emerald-700">{r.mission ? formatCurrency(r.valueSystem) : '—'}</td>
                                                                <td className={`px-3 py-2 text-right font-black ${Math.abs(r.diff) > divergenceTolerance ? 'text-red-600' : 'text-gray-500'}`}>
                                                                    {r.mission ? formatCurrency(r.diff) : <span className="text-orange-600">{formatCurrency(r.valueProvider)}</span>}
                                                                </td>
                                                                <td className="px-3 py-2 align-top min-w-[260px]">
                                                                    {isNF ? (
                                                                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px] font-black uppercase">Sem missão correspondente</span>
                                                                    ) : (r.details || []).length === 0 && r.status === 'OK' ? (
                                                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">OK</span>
                                                                    ) : (
                                                                        <div className="flex flex-col gap-0.5 text-[10px] leading-tight">
                                                                            {(() => {
                                                                                const fmt = (field: string, v: any) => {
                                                                                    if (v === null || v === undefined || v === '') return '—';
                                                                                    if (['Pedágio'].includes(field)) return formatCurrency(Number(v) || 0);
                                                                                    if (['KM Inicial', 'KM Final'].includes(field)) return `${Number(v).toLocaleString('pt-BR')} km`;
                                                                                    return String(v);
                                                                                };
                                                                                const items: { field: string; planilha: any; sistema: any }[] = [...(r.details || [])];
                                                                                if (r.status === 'DIVERGENT' || (r.mission && Math.abs(r.diff) > divergenceTolerance)) {
                                                                                    if (!items.some(d => d.field === 'Valor Total')) {
                                                                                        items.unshift({ field: 'Valor Total', planilha: formatCurrency(r.valueProvider), sistema: formatCurrency(r.valueSystem) });
                                                                                    }
                                                                                }
                                                                                return items.map((d, i) => (
                                                                                    <div key={i} className="text-gray-700">
                                                                                        <span className="font-black text-gray-900">{d.field}:</span>{' '}
                                                                                        <span className="text-blue-700 font-bold">Forn. {typeof d.planilha === 'string' ? d.planilha : fmt(d.field, d.planilha)}</span>
                                                                                        {' '}<span className="text-gray-400">/</span>{' '}
                                                                                        <span className="text-emerald-700 font-bold">Sist. TMSEG {typeof d.sistema === 'string' ? d.sistema : fmt(d.field, d.sistema)}</span>
                                                                                    </div>
                                                                                ));
                                                                            })()}
                                                                            {(r.reasons || []).length > 0 && (
                                                                                <span className="text-[9px] text-gray-400 font-bold no-print mt-0.5" title={`Critérios de match: ${(r.reasons || []).join(', ')}`}>match: {r.matchScore}</span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {r.mission && (
                                                                        <button
                                                                            onClick={() => onOpenMission && onOpenMission(r.mission.id)}
                                                                            className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                                                                            title="Abrir OS"
                                                                            data-testid={`btn-open-mission-${idx}`}
                                                                        >
                                                                            <ExternalLink size={14} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {divergenceResultsView.filter(r => divergenceFilter === 'ALL' || r.status === divergenceFilter).length === 0 && (
                                                        <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-xs font-bold">Nenhum item neste filtro.</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorVerificationControl;
