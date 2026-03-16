
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FinancialTransaction, TransactionType, TransactionStatus, FinancialAccount, FinancialCategory } from '../types';
import { 
  Plus, Search, Edit, Trash2, RefreshCw, 
  FileText, Calendar, Wallet, ArrowUpCircle, ArrowDownCircle, 
  DollarSign, Download, Printer, ChevronDown, FileDown,
  TrendingUp, TrendingDown, Loader2, CheckCircle2, X,
  ArrowRight, AlertCircle, ClipboardCheck, Receipt, 
  FileCheck, BarChart3, Lock, ChevronRight, Eye,
  Building2, Truck, CircleDollarSign, Clock, Filter,
  Camera, Upload, Sparkles, Image as ImageIcon, ScanLine
} from 'lucide-react';
import FinancialTransactionForm from './FinancialTransactionForm';
import BankStatementImporter from './BankStatementImporter';
import { generateContent } from '../lib/gemini';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

type Step = 'PAGAR' | 'RECEBER' | 'FATURAS' | 'CONFERENCIA' | 'RELATORIO' | 'FECHAMENTO';
type StatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE';

const STEPS: { id: Step; label: string; icon: React.ReactNode; description: string; number: number }[] = [
    { id: 'PAGAR', label: 'Contas a Pagar', icon: <ArrowDownCircle size={18}/>, description: 'Despesas e pagamentos a fornecedores', number: 1 },
    { id: 'RECEBER', label: 'Contas a Receber', icon: <ArrowUpCircle size={18}/>, description: 'Valores a receber dos clientes', number: 2 },
    { id: 'FATURAS', label: 'Boletim de Medição', icon: <Receipt size={18}/>, description: 'NF + Boleto com reconhecimento por IA', number: 3 },
    { id: 'CONFERENCIA', label: 'Conferência', icon: <ClipboardCheck size={18}/>, description: 'Revisar lançamentos e pendências', number: 4 },
    { id: 'RELATORIO', label: 'Relatório de Controle', icon: <BarChart3 size={18}/>, description: 'Relatório de títulos pagos e vencidos', number: 5 },
    { id: 'FECHAMENTO', label: 'Fechamento', icon: <Lock size={18}/>, description: 'Finalizar o fechamento financeiro', number: 6 },
];

const FinancialTransactionList: React.FC = () => {
    const [activeStep, setActiveStep] = useState<Step>('PAGAR');
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [viewPeriod, setViewPeriod] = useState<'MONTH' | 'CUSTOM' | 'ALL'>('MONTH');
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [canAccessReconciliation, setCanAccessReconciliation] = useState(false);
    const [closingNotes, setClosingNotes] = useState('');
    const [closingConfirmed, setClosingConfirmed] = useState(false);

    const [invoices, setInvoices] = useState<{id: string, client: string, number: string, amount: number, date: string, status: 'EMITIDA' | 'PAGA' | 'CANCELADA', notes: string, nf_image_url?: string, boleto_image_url?: string, provider?: string, issuer_company?: string, boleto_due_date?: string}[]>([]);
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [invoiceForm, setInvoiceForm] = useState({ client: '', number: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', provider: '', issuer_company: '', boleto_due_date: '' });
    const [clients, setClients] = useState<{id: string, name: string}[]>([]);
    const [nfFile, setNfFile] = useState<File | null>(null);
    const [boletoFile, setBoletoFile] = useState<File | null>(null);
    const [nfPreview, setNfPreview] = useState('');
    const [boletoPreview, setBoletoPreview] = useState('');
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [aiStatus, setAiStatus] = useState('');

    useEffect(() => { 
        fetchTransactions();
        fetchAccounts();
        checkAccess();
        fetchClients();
        fetchInvoices();
    }, []);

    const checkAccess = () => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            const role = (user.role || '').toLowerCase();
            if (role === 'administrador' || role === 'diretoria' || user.permissions?.includes('*')) {
                setCanAccessReconciliation(true);
            }
        }
    };

    const fetchAccounts = async () => {
        const { data } = await supabase.from('financial_accounts').select('*');
        if (data) setAccounts(data as any);
    };

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('id, name, trading_name').order('name');
        if (data) setClients(data.map((c: any) => ({ id: c.id.toString(), name: c.trading_name || c.name })));
    };

    const fetchInvoices = async () => {
        const { data, error } = await supabase.from('financial_invoices').select('*').order('date', { ascending: false });
        if (error) {
            if (error.code === '42P01') {
                console.warn('financial_invoices table does not exist yet. Attempting init...');
                try { await fetch('/api/supabase/init-invoices', { method: 'POST' }); } catch {}
            }
            return;
        }
        if (data) setInvoices(data as any);
        try { await fetch('/api/supabase/init-invoices', { method: 'POST' }); } catch {}
    };

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .order('due_date', { ascending: false });
            if (error) throw error;
            setTransactions(data as FinancialTransaction[]);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const filteredByStep = useMemo(() => {
        const typeFilter = activeStep === 'PAGAR' ? 'EXPENSE' : activeStep === 'RECEBER' ? 'INCOME' : null;
        if (!typeFilter && activeStep !== 'CONFERENCIA' && activeStep !== 'RELATORIO') return [];

        let list = typeFilter ? transactions.filter(t => t.type === typeFilter) : transactions;

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (viewPeriod === 'MONTH') {
            list = list.filter(t => {
                const d = new Date(t.due_date);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            });
        } else if (viewPeriod === 'CUSTOM') {
            list = list.filter(t => {
                const transDate = t.due_date.split('T')[0];
                return transDate >= customStartDate && transDate <= customEndDate;
            });
        }

        if (statusFilter === 'PENDING') list = list.filter(t => t.status === 'PENDING');
        else if (statusFilter === 'PAID') list = list.filter(t => t.status === 'PAID');
        else if (statusFilter === 'OVERDUE') list = list.filter(t => t.status === 'PENDING' && t.due_date.split('T')[0] < todayStr);

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            list = list.filter(t =>
                t.description.toLowerCase().includes(term) ||
                (t.entity_name || '').toLowerCase().includes(term) ||
                (t.category_name || '').toLowerCase().includes(term)
            );
        }

        return list;
    }, [transactions, activeStep, viewPeriod, customStartDate, customEndDate, statusFilter, searchTerm]);

    const handleToggleStatus = async (t: FinancialTransaction) => {
        const newStatus: TransactionStatus = t.status === 'PAID' ? 'PENDING' : 'PAID';
        const updates = { status: newStatus, payment_date: newStatus === 'PAID' ? t.due_date : null };
        const original = transactions.find(item => item.id === t.id);
        setTransactions(prev => prev.map(item => item.id === t.id ? { ...item, ...updates } : item));
        const { error } = await supabase.from('financial_transactions').update(updates).eq('id', t.id);
        if (error) {
            console.error('Erro ao atualizar status:', error);
            alert('Erro ao atualizar status do lançamento.');
            if (original) setTransactions(prev => prev.map(item => item.id === t.id ? original : item));
            else fetchTransactions();
        }
    };

    const handleDeleteTransaction = async (id: string) => {
        if (!confirm("Excluir este lançamento?")) return;
        const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
        if (error) { console.error(error); alert('Erro ao excluir lançamento.'); return; }
        fetchTransactions();
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => { resolve((reader.result as string).split(',')[1]); };
            reader.onerror = error => reject(error);
        });
    };

    const handleNfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setNfFile(file);
        const url = URL.createObjectURL(file);
        setNfPreview(url);
    };

    const handleBoletoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBoletoFile(file);
        const url = URL.createObjectURL(file);
        setBoletoPreview(url);
    };

    const compressImage = async (file: File, maxWidth = 1200): Promise<{ blob: Blob; base64: string }> => {
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) { reject('Erro ao comprimir'); return; }
                    const reader = new FileReader();
                    reader.onload = () => resolve({ blob, base64: (reader.result as string).split(',')[1] });
                    reader.readAsDataURL(blob);
                }, 'image/jpeg', 0.8);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    };

    const analyzeDocumentsWithAI = async () => {
        if (!nfFile && !boletoFile) { alert('Anexe pelo menos a foto da NF ou do Boleto.'); return; }
        setAiAnalyzing(true);
        setAiStatus('Preparando documentos para análise...');

        try {
            const parts: any[] = [];
            if (nfFile) {
                setAiStatus('Processando imagem da NF...');
                const nfB64 = nfFile.type === 'application/pdf' ? await fileToBase64(nfFile) : (await compressImage(nfFile)).base64;
                parts.push({ inlineData: { mimeType: nfFile.type || 'image/jpeg', data: nfB64 } });
            }
            if (boletoFile) {
                setAiStatus('Processando imagem do Boleto...');
                const bolB64 = boletoFile.type === 'application/pdf' ? await fileToBase64(boletoFile) : (await compressImage(boletoFile)).base64;
                parts.push({ inlineData: { mimeType: boletoFile.type || 'image/jpeg', data: bolB64 } });
            }

            const clientNames = clients.map(c => c.name).join(', ');

            parts.push({ text: `Analise os documentos fiscais brasileiros anexados (Nota Fiscal e/ou Boleto Bancário).
Extraia as seguintes informações:

1. "nf_number": Número da Nota Fiscal (ex: "001234", "NF-e 12345"). Se não encontrar, retorne "".
2. "client_name": Nome do CLIENTE / TOMADOR / DESTINATÁRIO da NF. O cliente é quem RECEBE o serviço. Compare com a lista de clientes cadastrados: [${clientNames}]. Se encontrar correspondência, use o nome exato da lista. Se não encontrar, retorne o nome encontrado na NF.
3. "provider_name": Nome do FORNECEDOR / PRESTADOR que emitiu a NF (quem prestou o serviço).
4. "issuer_company": Nome/Razão Social da EMPRESA EMISSORA (a empresa que gerou a Nota Fiscal).
5. "amount": Valor total da NF em número decimal (ex: 15000.50). Se não encontrar, retorne 0.
6. "nf_date": Data de emissão da NF no formato YYYY-MM-DD. Se não encontrar, retorne "".
7. "boleto_due_date": Data de VENCIMENTO do boleto no formato YYYY-MM-DD. Se não encontrar, retorne "".
8. "boleto_amount": Valor do boleto em número decimal. Se não encontrar, use o valor da NF.

Retorne SOMENTE um JSON puro com esses campos. Sem explicações.` });

            setAiStatus('IA analisando documentos...');

            const rawText = await generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            nf_number: { type: "STRING" },
                            client_name: { type: "STRING" },
                            provider_name: { type: "STRING" },
                            issuer_company: { type: "STRING" },
                            amount: { type: "NUMBER" },
                            nf_date: { type: "STRING" },
                            boleto_due_date: { type: "STRING" },
                            boleto_amount: { type: "NUMBER" },
                        },
                        required: ["nf_number", "client_name", "provider_name", "issuer_company", "amount", "nf_date", "boleto_due_date", "boleto_amount"]
                    }
                }
            });

            if (!rawText) throw new Error('IA não retornou dados.');

            const parsed = JSON.parse(rawText);
            setAiStatus('Dados extraídos! Preenchendo formulário...');

            const matchedClient = clients.find(c =>
                c.name.toLowerCase().includes(parsed.client_name?.toLowerCase() || '') ||
                (parsed.client_name || '').toLowerCase().includes(c.name.toLowerCase())
            );

            setInvoiceForm(prev => ({
                ...prev,
                number: parsed.nf_number || prev.number,
                client: matchedClient?.id || prev.client,
                amount: parsed.amount ? parsed.amount.toString() : (parsed.boleto_amount ? parsed.boleto_amount.toString() : prev.amount),
                date: parsed.nf_date || prev.date,
                provider: parsed.provider_name || prev.provider,
                issuer_company: parsed.issuer_company || prev.issuer_company,
                boleto_due_date: parsed.boleto_due_date || prev.boleto_due_date,
            }));

            setTimeout(() => setAiStatus(''), 3000);
        } catch (err: any) {
            console.error('[AI Doc Analysis]', err);
            setAiStatus(`Erro na análise: ${err.message}`);
            setTimeout(() => setAiStatus(''), 5000);
        } finally {
            setAiAnalyzing(false);
        }
    };

    const uploadDocImage = async (file: File, prefix: string): Promise<string> => {
        const ts = Date.now();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `invoices/${prefix}_${ts}.${ext}`;
        let uploadFile: Blob = file;
        if (file.type.startsWith('image/')) {
            const compressed = await compressImage(file);
            uploadFile = compressed.blob;
        }
        const { error } = await supabase.storage.from('mission-evidence').upload(path, uploadFile, { upsert: true });
        if (error) { console.error('[Upload]', error); return ''; }
        const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
        return urlData.publicUrl || '';
    };

    const resetInvoiceForm = () => {
        setInvoiceForm({ client: '', number: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', provider: '', issuer_company: '', boleto_due_date: '' });
        setNfFile(null);
        setBoletoFile(null);
        setNfPreview('');
        setBoletoPreview('');
        setAiStatus('');
    };

    const getQuinzenaRef = (dateStr: string, clientName: string): string => {
        const d = new Date(dateStr + 'T12:00:00');
        const day = d.getDate();
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const month = monthNames[d.getMonth()];
        const year = d.getFullYear();
        const quinzena = day <= 15 ? 'Primeira' : 'Segunda';
        return `Ref. ${quinzena} Quinzena de ${month}/${year} - ${clientName}`;
    };

    const handleSaveInvoice = async () => {
        if (!invoiceForm.client || !invoiceForm.number || !invoiceForm.amount) { alert('Preencha todos os campos obrigatórios.'); return; }
        const parsedAmt = parseFloat(invoiceForm.amount);
        if (isNaN(parsedAmt) || parsedAmt <= 0) { alert('Valor inválido.'); return; }
        const clientName = clients.find(c => c.id === invoiceForm.client)?.name || invoiceForm.client;
        const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';

        let nfImageUrl = '';
        let boletoImageUrl = '';
        if (nfFile) {
            setAiStatus('Salvando imagem da NF...');
            nfImageUrl = await uploadDocImage(nfFile, `nf_${invoiceForm.number}`);
        }
        if (boletoFile) {
            setAiStatus('Salvando imagem do Boleto...');
            boletoImageUrl = await uploadDocImage(boletoFile, `boleto_${invoiceForm.number}`);
        }

        const invoicePayload: any = {
            client: clientName, number: invoiceForm.number,
            amount: parsedAmt, date: invoiceForm.date,
            status: 'EMITIDA', notes: invoiceForm.notes || '',
            created_by: userName,
        };
        if (nfImageUrl) invoicePayload.nf_image_url = nfImageUrl;
        if (boletoImageUrl) invoicePayload.boleto_image_url = boletoImageUrl;
        if (invoiceForm.provider) invoicePayload.provider = invoiceForm.provider;
        if (invoiceForm.issuer_company) invoicePayload.issuer_company = invoiceForm.issuer_company;
        if (invoiceForm.boleto_due_date) invoicePayload.boleto_due_date = invoiceForm.boleto_due_date;

        let { data: invoiceData, error } = await supabase.from('financial_invoices').insert(invoicePayload).select();
        if (error && error.code === '42703') {
            const { nf_image_url, boleto_image_url, provider, issuer_company, boleto_due_date, ...basicPayload } = invoicePayload;
            const retry = await supabase.from('financial_invoices').insert(basicPayload).select();
            invoiceData = retry.data;
            error = retry.error;
            if (!error) console.warn('[Invoice] New columns not yet migrated. Saved basic data only. Run migration SQL in Supabase SQL Editor.');
        }
        if (error) { console.error(error); alert('Erro ao salvar fatura: ' + (error.message || 'Erro desconhecido')); return; }

        const dueDate = invoiceForm.boleto_due_date || invoiceForm.date;
        const quinzenaDesc = getQuinzenaRef(invoiceForm.date, clientName);
        try {
            await supabase.from('financial_transactions').insert({
                description: `NF ${invoiceForm.number} — ${quinzenaDesc}`,
                amount: parsedAmt,
                type: 'INCOME',
                status: 'PENDING',
                due_date: dueDate,
                entity_type: 'Client',
                entity_id: invoiceForm.client,
                entity_name: clientName,
                notes: `Fatura NF ${invoiceForm.number} | Emissora: ${invoiceForm.issuer_company || '-'} | ${invoiceForm.notes || ''}`.trim(),
                created_by: userName,
            });
        } catch (e) {
            console.error('[Auto Contas a Receber] Erro:', e);
        }

        setShowInvoiceForm(false);
        resetInvoiceForm();
        fetchInvoices();
        fetchTransactions();
    };

    const handleInvoiceStatusChange = async (id: string, newStatus: 'EMITIDA' | 'PAGA' | 'CANCELADA') => {
        const { error } = await supabase.from('financial_invoices').update({ status: newStatus }).eq('id', id);
        if (error) { console.error(error); alert('Erro ao atualizar status da fatura.'); return; }

        if (newStatus === 'PAGA') {
            const invoice = invoices.find(inv => inv.id === id);
            if (invoice) {
                try {
                    const { data: matchingTx } = await supabase
                        .from('financial_transactions')
                        .select('id')
                        .eq('type', 'INCOME')
                        .ilike('description', `%NF ${invoice.number}%`)
                        .ilike('description', `%${invoice.client}%`)
                        .eq('status', 'PENDING');

                    if (matchingTx && matchingTx.length > 0) {
                        const now = new Date().toISOString().split('T')[0];
                        const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';
                        for (const tx of matchingTx) {
                            await supabase.from('financial_transactions')
                                .update({ status: 'PAID', payment_date: now, updated_by: userName })
                                .eq('id', tx.id);
                        }
                        console.log(`[Auto BAIXA] NF ${invoice.number} (${invoice.client}): ${matchingTx.length} lançamento(s) baixado(s)`);
                    } else {
                        const { data: fallbackTx } = await supabase
                            .from('financial_transactions')
                            .select('id')
                            .eq('type', 'INCOME')
                            .ilike('description', `%NF ${invoice.number}%`)
                            .eq('status', 'PENDING');

                        if (fallbackTx && fallbackTx.length > 0) {
                            const now = new Date().toISOString().split('T')[0];
                            const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';
                            for (const tx of fallbackTx) {
                                await supabase.from('financial_transactions')
                                    .update({ status: 'PAID', payment_date: now, updated_by: userName })
                                    .eq('id', tx.id);
                            }
                            console.log(`[Auto BAIXA fallback] NF ${invoice.number}: ${fallbackTx.length} lançamento(s) baixado(s)`);
                        }
                    }
                } catch (e) {
                    console.error('[Auto BAIXA] Erro ao baixar lançamentos:', e);
                }
            }
        }

        fetchInvoices();
        fetchTransactions();
    };

    const handleDeleteInvoice = async (id: string) => {
        if (!confirm("Excluir esta fatura?")) return;
        const { error } = await supabase.from('financial_invoices').delete().eq('id', id);
        if (error) { console.error(error); alert('Erro ao excluir fatura.'); return; }
        fetchInvoices();
    };

    const exportToCSV = () => {
        const data = activeStep === 'FATURAS' ? invoices.map(inv => ({
            date: new Date(inv.date).toLocaleDateString('pt-BR'),
            description: `Fatura ${inv.number}`,
            entity: inv.client,
            amount: inv.amount.toFixed(2),
            status: inv.status
        })) : filteredByStep.map(t => ({
            date: new Date(t.due_date).toLocaleDateString('pt-BR'),
            description: t.description,
            entity: t.entity_name || 'Geral',
            amount: t.amount.toFixed(2),
            status: t.status === 'PAID' ? 'Pago' : 'Pendente'
        }));
        if (data.length === 0) return;
        const headers = ["Data", "Descrição", "Entidade", "Valor", "Status"];
        const rows = data.map(d => [d.date, d.description, d.entity, d.amount, d.status]);
        const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `FECHAMENTO_${activeStep}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const summaryPagar = useMemo(() => {
        const expenses = transactions.filter(t => t.type === 'EXPENSE');
        return { total: expenses.reduce((a, t) => a + t.amount, 0), paid: expenses.filter(t => t.status === 'PAID').reduce((a, t) => a + t.amount, 0), pending: expenses.filter(t => t.status === 'PENDING').reduce((a, t) => a + t.amount, 0), count: expenses.length, paidCount: expenses.filter(t => t.status === 'PAID').length };
    }, [transactions]);

    const summaryReceber = useMemo(() => {
        const incomes = transactions.filter(t => t.type === 'INCOME');
        return { total: incomes.reduce((a, t) => a + t.amount, 0), paid: incomes.filter(t => t.status === 'PAID').reduce((a, t) => a + t.amount, 0), pending: incomes.filter(t => t.status === 'PENDING').reduce((a, t) => a + t.amount, 0), count: incomes.length, paidCount: incomes.filter(t => t.status === 'PAID').length };
    }, [transactions]);

    const overduePagar = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return transactions.filter(t => t.type === 'EXPENSE' && t.status === 'PENDING' && t.due_date.split('T')[0] < today);
    }, [transactions]);

    const overdueReceber = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return transactions.filter(t => t.type === 'INCOME' && t.status === 'PENDING' && t.due_date.split('T')[0] < today);
    }, [transactions]);

    const renderFilters = () => (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end no-print">
            <div className="lg:col-span-3">
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">Período</label>
                <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    {[{id: 'MONTH', label: 'Mês Atual'}, {id: 'CUSTOM', label: 'Personalizado'}, {id: 'ALL', label: 'Tudo'}].map(p => (
                        <button key={p.id} onClick={() => setViewPeriod(p.id as any)}
                            className={`flex-1 px-2 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${viewPeriod === p.id ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >{p.label}</button>
                    ))}
                </div>
            </div>
            {viewPeriod === 'CUSTOM' && (
                <div className="lg:col-span-3 flex gap-2 animate-in slide-in-from-left-2">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-400 mb-1 block">Início</label>
                        <input type="date" className="w-full p-2 border rounded-lg text-xs" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} data-testid="input-start-date" />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-400 mb-1 block">Fim</label>
                        <input type="date" className="w-full p-2 border rounded-lg text-xs" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} data-testid="input-end-date" />
                    </div>
                </div>
            )}
            <div className={`relative ${viewPeriod === 'CUSTOM' ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">Buscar</label>
                <input type="text" placeholder="Fornecedor, cliente, descrição..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-red-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} data-testid="input-search-financial" />
                <Search size={18} className="absolute left-3 bottom-2.5 text-gray-400" />
            </div>
            <div className="lg:col-span-3 flex gap-1 bg-gray-100 p-1 rounded-lg">
                {([['ALL', 'Tudo'], ['PENDING', 'Pendente'], ['PAID', 'Pago'], ['OVERDUE', 'Vencido']] as [StatusFilter, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setStatusFilter(id)}
                        className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded transition-all ${
                            statusFilter === id 
                                ? id === 'PAID' ? 'bg-green-500 text-white shadow-sm' 
                                : id === 'OVERDUE' ? 'bg-red-500 text-white shadow-sm' 
                                : id === 'PENDING' ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500'
                        }`}
                        data-testid={`btn-filter-${id.toLowerCase()}`}
                    >{label}</button>
                ))}
            </div>
        </div>
    );

    const renderTransactionTable = (list: FinancialTransaction[], typeLabel: string) => (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                            <th className="px-4 py-3">Vencimento</th>
                            <th className="px-4 py-3">Descrição</th>
                            <th className="px-4 py-3">Favorecido</th>
                            <th className="px-4 py-3">Categoria</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Valor</th>
                            <th className="px-4 py-3 text-right no-print">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-red-700"/></td></tr>
                        ) : list.length === 0 ? (
                            <tr><td colSpan={7} className="p-12 text-center text-gray-400 font-bold uppercase italic text-sm">Nenhum lançamento encontrado.</td></tr>
                        ) : list.map(t => {
                            const isOverdue = t.status === 'PENDING' && t.due_date.split('T')[0] < new Date().toISOString().split('T')[0];
                            return (
                                <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-mono font-bold ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                                            {new Date(t.due_date).toLocaleDateString('pt-BR')}
                                        </span>
                                        {isOverdue && <span className="block text-[8px] font-black text-red-500 uppercase">Vencido</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-gray-800 text-sm uppercase">{t.description}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-bold text-gray-600 uppercase">{t.entity_name || 'Geral'}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">
                                            {t.category_name}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button onClick={() => handleToggleStatus(t)} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-all ${t.status === 'PAID' ? 'bg-green-100 text-green-800 border-green-200' : isOverdue ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' : 'bg-amber-50 text-amber-700 border-amber-200'}`} data-testid={`btn-toggle-status-${t.id}`}>
                                            {t.status === 'PAID' ? 'Pago' : isOverdue ? 'Vencido' : 'Pendente'}
                                        </button>
                                    </td>
                                    <td className={`px-4 py-3 text-right font-black font-mono text-sm ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(t.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-right no-print">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => { setEditingId(t.id); setIsFormOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" data-testid={`btn-edit-${t.id}`}><Edit size={14}/></button>
                                            <button onClick={() => handleDeleteTransaction(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" data-testid={`btn-delete-${t.id}`}><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs font-bold text-gray-500 uppercase">
                <span>{list.length} registro(s)</span>
                <span className="font-mono font-black text-gray-900">Total: {formatCurrency(list.reduce((a, t) => a + t.amount, 0))}</span>
            </div>
        </div>
    );

    const renderStepContent = () => {
        switch (activeStep) {
            case 'PAGAR':
            case 'RECEBER': {
                const isPagar = activeStep === 'PAGAR';
                const summary = isPagar ? summaryPagar : summaryReceber;
                return (
                    <>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest no-print">Visão Geral (Todos os Registros)</p>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <div className={`p-2.5 rounded-full ${isPagar ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                    {isPagar ? <ArrowDownCircle size={18}/> : <ArrowUpCircle size={18}/>}
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total {isPagar ? 'a Pagar' : 'a Receber'}</p>
                                    <p className={`text-lg font-black font-mono ${isPagar ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(summary.total)}</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-green-50 text-green-600 rounded-full"><CheckCircle2 size={18}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{isPagar ? 'Pago' : 'Recebido'}</p>
                                    <p className="text-lg font-black font-mono text-green-600">{formatCurrency(summary.paid)}</p>
                                    <p className="text-[9px] text-gray-400 font-bold">{summary.paidCount} título(s)</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-full"><Clock size={18}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Pendente</p>
                                    <p className="text-lg font-black font-mono text-amber-600">{formatCurrency(summary.pending)}</p>
                                    <p className="text-[9px] text-gray-400 font-bold">{summary.count - summary.paidCount} título(s)</p>
                                </div>
                            </div>
                            <div className={`p-4 rounded-xl border shadow-sm flex items-center gap-3 ${(isPagar ? overduePagar : overdueReceber).length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                                <div className={`p-2.5 rounded-full ${(isPagar ? overduePagar : overdueReceber).length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-400'}`}><AlertCircle size={18}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vencidos</p>
                                    <p className={`text-lg font-black font-mono ${(isPagar ? overduePagar : overdueReceber).length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                        {(isPagar ? overduePagar : overdueReceber).length}
                                    </p>
                                    <p className="text-[9px] text-red-500 font-bold">{formatCurrency((isPagar ? overduePagar : overdueReceber).reduce((a, t) => a + t.amount, 0))}</p>
                                </div>
                            </div>
                        </div>
                        {renderFilters()}
                        {renderTransactionTable(filteredByStep, isPagar ? 'Despesa' : 'Receita')}
                    </>
                );
            }

            case 'FATURAS':
                return (
                    <>
                        {showInvoiceForm && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in my-4">
                                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-900 to-gray-800">
                                        <div className="flex items-center gap-2">
                                            <ScanLine size={18} className="text-red-400"/>
                                            <h3 className="font-black text-white uppercase text-xs tracking-widest">Boletim de Medição — Nova NF</h3>
                                        </div>
                                        <button onClick={() => { setShowInvoiceForm(false); resetInvoiceForm(); }}><X size={20} className="text-gray-400 hover:text-white"/></button>
                                    </div>
                                    <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-blue-400 transition-colors relative">
                                                <input type="file" accept="image/*,.pdf" onChange={handleNfFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" data-testid="input-nf-file" />
                                                {nfPreview ? (
                                                    <div className="relative">
                                                        <img src={nfPreview} alt="NF Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                                                        <div className="absolute top-1 right-1 bg-green-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black">NF</div>
                                                        <p className="text-[9px] text-green-600 font-bold truncate">{nfFile?.name}</p>
                                                    </div>
                                                ) : (
                                                    <div className="py-4">
                                                        <Camera size={32} className="mx-auto text-gray-300 mb-2"/>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase">Foto da Nota Fiscal</p>
                                                        <p className="text-[9px] text-gray-300 mt-1">Clique ou arraste</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-orange-400 transition-colors relative">
                                                <input type="file" accept="image/*,.pdf" onChange={handleBoletoFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" data-testid="input-boleto-file" />
                                                {boletoPreview ? (
                                                    <div className="relative">
                                                        <img src={boletoPreview} alt="Boleto Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                                                        <div className="absolute top-1 right-1 bg-orange-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black">BOLETO</div>
                                                        <p className="text-[9px] text-orange-600 font-bold truncate">{boletoFile?.name}</p>
                                                    </div>
                                                ) : (
                                                    <div className="py-4">
                                                        <Receipt size={32} className="mx-auto text-gray-300 mb-2"/>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase">Foto do Boleto</p>
                                                        <p className="text-[9px] text-gray-300 mt-1">Clique ou arraste</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {(nfFile || boletoFile) && (
                                            <button 
                                                onClick={analyzeDocumentsWithAI} 
                                                disabled={aiAnalyzing}
                                                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50"
                                                data-testid="btn-ai-analyze"
                                            >
                                                {aiAnalyzing ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                                                {aiAnalyzing ? 'Analisando...' : 'Analisar com IA (Gemini)'}
                                            </button>
                                        )}

                                        {aiStatus && (
                                            <div className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 ${aiStatus.includes('Erro') ? 'bg-red-50 text-red-600' : aiStatus.includes('extraídos') ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {aiAnalyzing ? <Loader2 size={12} className="animate-spin"/> : aiStatus.includes('Erro') ? <AlertCircle size={12}/> : <CheckCircle2 size={12}/>}
                                                {aiStatus}
                                            </div>
                                        )}

                                        <div className="border-t border-gray-100 pt-4">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Dados da Nota Fiscal</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Cliente *</label>
                                                    <select className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase" value={invoiceForm.client} onChange={e => setInvoiceForm({...invoiceForm, client: e.target.value})} data-testid="select-invoice-client">
                                                        <option value="">Selecione...</option>
                                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Nº da NF *</label>
                                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase" placeholder="NF-001" value={invoiceForm.number} onChange={e => setInvoiceForm({...invoiceForm, number: e.target.value})} data-testid="input-invoice-number" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Valor *</label>
                                                    <input type="number" step="0.01" className="w-full p-2.5 border rounded-lg text-sm font-mono font-bold" placeholder="0.00" value={invoiceForm.amount} onChange={e => setInvoiceForm({...invoiceForm, amount: e.target.value})} data-testid="input-invoice-amount" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Data Emissão NF</label>
                                                    <input type="date" className="w-full p-2.5 border rounded-lg text-sm font-bold" value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})} data-testid="input-invoice-date" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-100 pt-4">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Dados Identificados</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Fornecedor / Prestador</label>
                                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase bg-gray-50" placeholder="Auto-detectado pela IA" value={invoiceForm.provider} onChange={e => setInvoiceForm({...invoiceForm, provider: e.target.value})} data-testid="input-invoice-provider" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Empresa Emissora</label>
                                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase bg-gray-50" placeholder="Auto-detectado pela IA" value={invoiceForm.issuer_company} onChange={e => setInvoiceForm({...invoiceForm, issuer_company: e.target.value})} data-testid="input-invoice-issuer" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-orange-400 uppercase mb-1 block flex items-center gap-1"><Receipt size={10}/> Vencimento do Boleto</label>
                                                    <input type="date" className="w-full p-2.5 border-2 border-orange-200 rounded-lg text-sm font-bold bg-orange-50" value={invoiceForm.boleto_due_date} onChange={e => setInvoiceForm({...invoiceForm, boleto_due_date: e.target.value})} data-testid="input-invoice-boleto-date" />
                                                </div>
                                                <div className="flex items-end">
                                                    <div className="w-full p-2.5 bg-gray-50 rounded-lg border text-[10px] text-gray-400 font-bold">
                                                        {invoiceForm.boleto_due_date ? `Contas a Receber: vencimento ${new Date(invoiceForm.boleto_due_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : 'Data do boleto define o vencimento no Contas a Receber'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Observações</label>
                                            <textarea className="w-full p-2.5 border rounded-lg text-sm" rows={2} placeholder="Detalhes da fatura..." value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})} data-testid="input-invoice-notes" />
                                        </div>

                                        <button onClick={handleSaveInvoice} className="w-full bg-gray-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg" data-testid="btn-save-invoice">
                                            <Receipt size={18}/> Emitir Fatura e Vincular Contas a Receber
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full"><Receipt size={18}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Faturas Emitidas</p>
                                    <p className="text-lg font-black text-blue-600">{invoices.filter(i => i.status === 'EMITIDA').length}</p>
                                    <p className="text-[9px] text-gray-400 font-bold font-mono">{formatCurrency(invoices.filter(i => i.status === 'EMITIDA').reduce((a, i) => a + i.amount, 0))}</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-green-50 text-green-600 rounded-full"><CheckCircle2 size={18}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Faturas Pagas</p>
                                    <p className="text-lg font-black text-green-600">{invoices.filter(i => i.status === 'PAGA').length}</p>
                                    <p className="text-[9px] text-gray-400 font-bold font-mono">{formatCurrency(invoices.filter(i => i.status === 'PAGA').reduce((a, i) => a + i.amount, 0))}</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-red-50 text-red-600 rounded-full"><X size={18}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Faturas Canceladas</p>
                                    <p className="text-lg font-black text-red-600">{invoices.filter(i => i.status === 'CANCELADA').length}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                                            <th className="px-3 py-3">Docs</th>
                                            <th className="px-3 py-3">Nº NF</th>
                                            <th className="px-3 py-3">Cliente</th>
                                            <th className="px-3 py-3">Emissora</th>
                                            <th className="px-3 py-3">Emissão</th>
                                            <th className="px-3 py-3">Venc. Boleto</th>
                                            <th className="px-3 py-3 text-right">Valor</th>
                                            <th className="px-3 py-3 text-center">Status</th>
                                            <th className="px-3 py-3 text-right no-print">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {invoices.length === 0 ? (
                                            <tr><td colSpan={9} className="p-12 text-center text-gray-400 font-bold uppercase italic text-sm">Nenhuma fatura emitida.</td></tr>
                                        ) : invoices.map(inv => (
                                            <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-3 py-3">
                                                    <div className="flex gap-1">
                                                        {inv.nf_image_url ? (
                                                            <a href={inv.nf_image_url} target="_blank" rel="noopener noreferrer" className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200" title="Ver NF"><ImageIcon size={12}/></a>
                                                        ) : <span className="p-1 bg-gray-100 text-gray-300 rounded"><ImageIcon size={12}/></span>}
                                                        {inv.boleto_image_url ? (
                                                            <a href={inv.boleto_image_url} target="_blank" rel="noopener noreferrer" className="p-1 bg-orange-100 text-orange-600 rounded hover:bg-orange-200" title="Ver Boleto"><Receipt size={12}/></a>
                                                        ) : <span className="p-1 bg-gray-100 text-gray-300 rounded"><Receipt size={12}/></span>}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-sm font-black text-gray-900 uppercase">{inv.number}</td>
                                                <td className="px-3 py-3 text-xs font-bold text-gray-600 uppercase">{inv.client}</td>
                                                <td className="px-3 py-3 text-[10px] font-bold text-gray-500 uppercase max-w-[120px] truncate">{inv.issuer_company || '-'}</td>
                                                <td className="px-3 py-3 text-xs font-mono text-gray-500">{new Date(inv.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                                <td className="px-3 py-3 text-xs font-mono text-orange-600 font-bold">{inv.boleto_due_date ? new Date(inv.boleto_due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                                                <td className="px-3 py-3 text-right font-black font-mono text-sm text-green-600">{formatCurrency(inv.amount)}</td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${inv.status === 'PAGA' ? 'bg-green-100 text-green-800 border-green-200' : inv.status === 'CANCELADA' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                        {inv.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right no-print">
                                                    <div className="flex justify-end gap-1">
                                                        {inv.status === 'EMITIDA' && (
                                                            <>
                                                                <button onClick={() => handleInvoiceStatusChange(inv.id, 'PAGA')} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Marcar como Paga" data-testid={`btn-invoice-paid-${inv.id}`}><CheckCircle2 size={14}/></button>
                                                                <button onClick={() => handleInvoiceStatusChange(inv.id, 'CANCELADA')} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Cancelar" data-testid={`btn-invoice-cancel-${inv.id}`}><X size={14}/></button>
                                                            </>
                                                        )}
                                                        <button onClick={() => handleDeleteInvoice(inv.id)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded"><Trash2 size={14}/></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                );

            case 'CONFERENCIA':
                return (
                    <>
                        {renderFilters()}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
                            <div className={`p-5 rounded-xl border-2 ${overduePagar.length > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    {overduePagar.length > 0 ? <AlertCircle size={20} className="text-red-600"/> : <CheckCircle2 size={20} className="text-green-600"/>}
                                    <h4 className="text-sm font-black text-gray-900 uppercase">Contas a Pagar</h4>
                                </div>
                                {overduePagar.length > 0 ? (
                                    <div>
                                        <p className="text-xs text-red-700 font-bold mb-2">{overduePagar.length} título(s) vencido(s) — {formatCurrency(overduePagar.reduce((a, t) => a + t.amount, 0))}</p>
                                        {overduePagar.slice(0, 5).map(t => (
                                            <div key={t.id} className="flex justify-between items-center py-1 border-b border-red-200 last:border-0">
                                                <span className="text-[10px] font-bold text-gray-700 uppercase truncate max-w-[60%]">{t.description}</span>
                                                <span className="text-[10px] font-black text-red-600 font-mono">{formatCurrency(t.amount)}</span>
                                            </div>
                                        ))}
                                        {overduePagar.length > 5 && <p className="text-[9px] text-gray-400 mt-1">+{overduePagar.length - 5} mais...</p>}
                                    </div>
                                ) : <p className="text-xs text-green-700 font-bold">Nenhum título vencido. Tudo em dia!</p>}
                            </div>
                            <div className={`p-5 rounded-xl border-2 ${overdueReceber.length > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    {overdueReceber.length > 0 ? <AlertCircle size={20} className="text-red-600"/> : <CheckCircle2 size={20} className="text-green-600"/>}
                                    <h4 className="text-sm font-black text-gray-900 uppercase">Contas a Receber</h4>
                                </div>
                                {overdueReceber.length > 0 ? (
                                    <div>
                                        <p className="text-xs text-red-700 font-bold mb-2">{overdueReceber.length} título(s) vencido(s) — {formatCurrency(overdueReceber.reduce((a, t) => a + t.amount, 0))}</p>
                                        {overdueReceber.slice(0, 5).map(t => (
                                            <div key={t.id} className="flex justify-between items-center py-1 border-b border-red-200 last:border-0">
                                                <span className="text-[10px] font-bold text-gray-700 uppercase truncate max-w-[60%]">{t.description}</span>
                                                <span className="text-[10px] font-black text-red-600 font-mono">{formatCurrency(t.amount)}</span>
                                            </div>
                                        ))}
                                        {overdueReceber.length > 5 && <p className="text-[9px] text-gray-400 mt-1">+{overdueReceber.length - 5} mais...</p>}
                                    </div>
                                ) : <p className="text-xs text-green-700 font-bold">Nenhum título vencido. Tudo em dia!</p>}
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                            <h4 className="text-sm font-black text-gray-900 uppercase mb-3 flex items-center gap-2"><FileCheck size={16}/> Resumo da Conferência</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div className="p-3 bg-gray-50 rounded-lg"><p className="text-[9px] font-black text-gray-400 uppercase">Total Pagar</p><p className="text-lg font-black text-red-600 font-mono">{formatCurrency(summaryPagar.total)}</p></div>
                                <div className="p-3 bg-gray-50 rounded-lg"><p className="text-[9px] font-black text-gray-400 uppercase">Total Receber</p><p className="text-lg font-black text-green-600 font-mono">{formatCurrency(summaryReceber.total)}</p></div>
                                <div className="p-3 bg-gray-50 rounded-lg"><p className="text-[9px] font-black text-gray-400 uppercase">Faturas Emitidas</p><p className="text-lg font-black text-blue-600">{invoices.filter(i => i.status === 'EMITIDA').length}</p></div>
                                <div className={`p-3 rounded-lg ${summaryReceber.total - summaryPagar.total >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><p className="text-[9px] font-black text-gray-400 uppercase">Saldo Líquido</p><p className={`text-lg font-black font-mono ${summaryReceber.total - summaryPagar.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(summaryReceber.total - summaryPagar.total)}</p></div>
                            </div>
                        </div>
                        {renderTransactionTable(filteredByStep, 'Todos')}
                    </>
                );

            case 'RELATORIO': {
                const todayStr = new Date().toISOString().split('T')[0];
                const paidExpenses = transactions.filter(t => t.type === 'EXPENSE' && t.status === 'PAID');
                const paidIncomes = transactions.filter(t => t.type === 'INCOME' && t.status === 'PAID');
                const overdueExpenses = transactions.filter(t => t.type === 'EXPENSE' && t.status === 'PENDING' && t.due_date.split('T')[0] < todayStr);
                const overdueIncomes = transactions.filter(t => t.type === 'INCOME' && t.status === 'PENDING' && t.due_date.split('T')[0] < todayStr);

                return (
                    <div className="space-y-4">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h4 className="text-sm font-black text-gray-900 uppercase mb-4 flex items-center gap-2"><BarChart3 size={16} className="text-red-700"/> Relatório de Controle Financeiro</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
                                    <p className="text-[9px] font-black text-green-700 uppercase mb-1">Títulos Pagos (Despesas)</p>
                                    <p className="text-xl font-black text-green-700 font-mono">{formatCurrency(paidExpenses.reduce((a, t) => a + t.amount, 0))}</p>
                                    <p className="text-[9px] text-green-600 font-bold">{paidExpenses.length} título(s)</p>
                                </div>
                                <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
                                    <p className="text-[9px] font-black text-green-700 uppercase mb-1">Títulos Recebidos</p>
                                    <p className="text-xl font-black text-green-700 font-mono">{formatCurrency(paidIncomes.reduce((a, t) => a + t.amount, 0))}</p>
                                    <p className="text-[9px] text-green-600 font-bold">{paidIncomes.length} título(s)</p>
                                </div>
                                <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
                                    <p className="text-[9px] font-black text-red-700 uppercase mb-1">Despesas Vencidas</p>
                                    <p className="text-xl font-black text-red-700 font-mono">{formatCurrency(overdueExpenses.reduce((a, t) => a + t.amount, 0))}</p>
                                    <p className="text-[9px] text-red-600 font-bold">{overdueExpenses.length} título(s)</p>
                                </div>
                                <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
                                    <p className="text-[9px] font-black text-red-700 uppercase mb-1">Recebíveis Vencidos</p>
                                    <p className="text-xl font-black text-red-700 font-mono">{formatCurrency(overdueIncomes.reduce((a, t) => a + t.amount, 0))}</p>
                                    <p className="text-[9px] text-red-600 font-bold">{overdueIncomes.length} título(s)</p>
                                </div>
                            </div>
                            {overdueExpenses.length > 0 && (
                                <div className="mb-4">
                                    <h5 className="text-[10px] font-black text-red-700 uppercase mb-2 tracking-widest">Despesas Vencidas</h5>
                                    <div className="bg-red-50 rounded-lg border border-red-200 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead><tr className="text-[9px] font-black text-red-800 uppercase bg-red-100"><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Favorecido</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
                                            <tbody>{overdueExpenses.map(t => (
                                                <tr key={t.id} className="border-t border-red-200"><td className="px-3 py-2 text-[10px] font-mono text-red-600">{new Date(t.due_date).toLocaleDateString('pt-BR')}</td><td className="px-3 py-2 text-[10px] font-bold uppercase text-gray-700">{t.description}</td><td className="px-3 py-2 text-[10px] text-gray-500">{t.entity_name || '-'}</td><td className="px-3 py-2 text-[10px] font-black font-mono text-red-600 text-right">{formatCurrency(t.amount)}</td></tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {overdueIncomes.length > 0 && (
                                <div>
                                    <h5 className="text-[10px] font-black text-red-700 uppercase mb-2 tracking-widest">Recebíveis Vencidos</h5>
                                    <div className="bg-red-50 rounded-lg border border-red-200 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead><tr className="text-[9px] font-black text-red-800 uppercase bg-red-100"><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Favorecido</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
                                            <tbody>{overdueIncomes.map(t => (
                                                <tr key={t.id} className="border-t border-red-200"><td className="px-3 py-2 text-[10px] font-mono text-red-600">{new Date(t.due_date).toLocaleDateString('pt-BR')}</td><td className="px-3 py-2 text-[10px] font-bold uppercase text-gray-700">{t.description}</td><td className="px-3 py-2 text-[10px] text-gray-500">{t.entity_name || '-'}</td><td className="px-3 py-2 text-[10px] font-black font-mono text-red-600 text-right">{formatCurrency(t.amount)}</td></tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }

            case 'FECHAMENTO': {
                const hasPendingPagar = transactions.some(t => t.type === 'EXPENSE' && t.status === 'PENDING');
                const hasPendingReceber = transactions.some(t => t.type === 'INCOME' && t.status === 'PENDING');
                const hasOpenInvoices = invoices.some(i => i.status === 'EMITIDA');
                const allClear = !hasPendingPagar && !hasPendingReceber && !hasOpenInvoices;

                return (
                    <div className="space-y-4">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h4 className="text-sm font-black text-gray-900 uppercase mb-4 flex items-center gap-2"><Lock size={16} className="text-red-700"/> Checklist de Fechamento</h4>
                            <div className="space-y-3">
                                <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${!hasPendingPagar ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                                    {!hasPendingPagar ? <CheckCircle2 size={20} className="text-green-600"/> : <AlertCircle size={20} className="text-amber-600"/>}
                                    <div>
                                        <p className="text-sm font-black text-gray-900 uppercase">1. Contas a Pagar</p>
                                        <p className="text-xs text-gray-500">{!hasPendingPagar ? 'Todos os títulos estão liquidados.' : `Existem ${transactions.filter(t => t.type === 'EXPENSE' && t.status === 'PENDING').length} título(s) pendente(s).`}</p>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${!hasPendingReceber ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                                    {!hasPendingReceber ? <CheckCircle2 size={20} className="text-green-600"/> : <AlertCircle size={20} className="text-amber-600"/>}
                                    <div>
                                        <p className="text-sm font-black text-gray-900 uppercase">2. Contas a Receber</p>
                                        <p className="text-xs text-gray-500">{!hasPendingReceber ? 'Todos os recebíveis confirmados.' : `Existem ${transactions.filter(t => t.type === 'INCOME' && t.status === 'PENDING').length} título(s) pendente(s).`}</p>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${!hasOpenInvoices ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                                    {!hasOpenInvoices ? <CheckCircle2 size={20} className="text-green-600"/> : <AlertCircle size={20} className="text-amber-600"/>}
                                    <div>
                                        <p className="text-sm font-black text-gray-900 uppercase">3. Faturas</p>
                                        <p className="text-xs text-gray-500">{!hasOpenInvoices ? 'Todas as faturas liquidadas ou canceladas.' : `Existem ${invoices.filter(i => i.status === 'EMITIDA').length} fatura(s) em aberto.`}</p>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${overduePagar.length === 0 && overdueReceber.length === 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                                    {overduePagar.length === 0 && overdueReceber.length === 0 ? <CheckCircle2 size={20} className="text-green-600"/> : <AlertCircle size={20} className="text-red-600"/>}
                                    <div>
                                        <p className="text-sm font-black text-gray-900 uppercase">4. Títulos Vencidos</p>
                                        <p className="text-xs text-gray-500">{overduePagar.length === 0 && overdueReceber.length === 0 ? 'Sem títulos vencidos.' : `${overduePagar.length + overdueReceber.length} título(s) vencido(s) encontrado(s).`}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h4 className="text-sm font-black text-gray-900 uppercase mb-3">Observações do Fechamento</h4>
                            <textarea className="w-full p-3 border border-gray-300 rounded-lg text-sm" rows={3} placeholder="Anotações sobre o fechamento financeiro..." value={closingNotes} onChange={e => setClosingNotes(e.target.value)} data-testid="input-closing-notes" />
                            <div className="flex items-center gap-3 mt-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 rounded text-green-600 border-gray-300" checked={closingConfirmed} onChange={e => setClosingConfirmed(e.target.checked)} data-testid="checkbox-confirm-closing" />
                                    <span className="text-xs font-black text-gray-700 uppercase">Confirmo que todos os lançamentos foram conferidos</span>
                                </label>
                            </div>
                            {!allClear && (
                                <p className="text-xs text-amber-600 font-bold mt-2">Atenção: Existem pendências no checklist acima. Resolva-as antes de finalizar o fechamento.</p>
                            )}
                            <button 
                                disabled={!closingConfirmed || !allClear}
                                onClick={() => { alert('Fechamento financeiro concluído com sucesso!'); setClosingConfirmed(false); setClosingNotes(''); }}
                                className={`mt-4 w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 transition-all ${closingConfirmed && allClear ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                                data-testid="btn-finalize-closing"
                            >
                                <Lock size={18}/> Finalizar Fechamento
                            </button>
                        </div>
                    </div>
                );
            }

            default: return null;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <FinancialTransactionForm onClose={() => { setIsFormOpen(false); setEditingId(null); }} onSuccess={() => { setIsFormOpen(false); setEditingId(null); fetchTransactions(); }} id={editingId} />
                </div>
            )}
            {isImportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <BankStatementImporter onClose={() => setIsImportOpen(false)} onSuccess={() => { setIsImportOpen(false); fetchTransactions(); }} />
                </div>
            )}

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
                        Contas a Pagar / Receber
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 ml-4.5">Gestão de pagamentos, recebimentos, faturas e fechamento financeiro de terceiros.</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 no-print">
                        <button onClick={exportToCSV} className="p-2 text-gray-600 hover:text-green-600 transition-colors" title="Exportar CSV" data-testid="btn-export-csv"><FileDown size={20}/></button>
                        <button onClick={() => window.print()} className="p-2 text-gray-600 hover:text-red-600 transition-colors" title="Imprimir" data-testid="btn-print"><Printer size={20}/></button>
                    </div>
                    {canAccessReconciliation && (
                        <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-bold transition-all no-print" data-testid="btn-reconciliation">
                            <FileText size={16}/> Conciliação
                        </button>
                    )}
                    <button onClick={fetchTransactions} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500 no-print" data-testid="btn-refresh"><RefreshCw size={18} className={loading ? "animate-spin" : ""}/></button>
                    {(activeStep === 'PAGAR' || activeStep === 'RECEBER') && (
                        <button onClick={() => setIsFormOpen(true)} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase no-print" data-testid="btn-new-transaction">
                            <Plus size={18}/> Novo Lançamento
                        </button>
                    )}
                    {activeStep === 'FATURAS' && (
                        <button onClick={() => setShowInvoiceForm(true)} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase no-print" data-testid="btn-new-invoice">
                            <ScanLine size={18}/> Novo Boletim de Medição
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 no-print">
                <div className="flex gap-1 overflow-x-auto">
                    {STEPS.map((step) => (
                        <button 
                            key={step.id} 
                            onClick={() => { setActiveStep(step.id); setStatusFilter('ALL'); setSearchTerm(''); }}
                            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-left transition-all min-w-fit flex-1 ${
                                activeStep === step.id 
                                    ? 'bg-gray-900 text-white shadow-lg' 
                                    : 'hover:bg-gray-50 text-gray-500'
                            }`}
                            data-testid={`tab-step-${step.id.toLowerCase()}`}
                        >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                activeStep === step.id ? 'bg-white text-gray-900' : 'bg-gray-200 text-gray-500'
                            }`}>{step.number}</div>
                            <div>
                                <p className={`text-xs font-black uppercase tracking-tight ${activeStep === step.id ? 'text-white' : 'text-gray-700'}`}>{step.label}</p>
                                <p className={`text-[9px] ${activeStep === step.id ? 'text-gray-400' : 'text-gray-400'} hidden md:block`}>{step.description}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {renderStepContent()}
        </div>
    );
};

export default FinancialTransactionList;
