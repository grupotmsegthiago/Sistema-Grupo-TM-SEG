
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
  Building2, Truck, CircleDollarSign, Clock, Filter
} from 'lucide-react';
import FinancialTransactionForm from './FinancialTransactionForm';
import BankStatementImporter from './BankStatementImporter';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

type Step = 'PAGAR' | 'RECEBER' | 'FATURAS' | 'CONFERENCIA' | 'RELATORIO' | 'FECHAMENTO';
type StatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE';

const STEPS: { id: Step; label: string; icon: React.ReactNode; description: string; number: number }[] = [
    { id: 'PAGAR', label: 'Contas a Pagar', icon: <ArrowDownCircle size={18}/>, description: 'Despesas e pagamentos a fornecedores', number: 1 },
    { id: 'RECEBER', label: 'Contas a Receber', icon: <ArrowUpCircle size={18}/>, description: 'Valores a receber dos clientes', number: 2 },
    { id: 'FATURAS', label: 'Emissão de Faturas', icon: <Receipt size={18}/>, description: 'Gerar e controlar faturas emitidas', number: 3 },
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

    const [invoices, setInvoices] = useState<{id: string, client: string, number: string, amount: number, date: string, status: 'EMITIDA' | 'PAGA' | 'CANCELADA', notes: string}[]>([]);
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [invoiceForm, setInvoiceForm] = useState({ client: '', number: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
    const [clients, setClients] = useState<{id: string, name: string}[]>([]);

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

    const handleSaveInvoice = async () => {
        if (!invoiceForm.client || !invoiceForm.number || !invoiceForm.amount) { alert('Preencha todos os campos obrigatórios.'); return; }
        const parsedAmt = parseFloat(invoiceForm.amount);
        if (isNaN(parsedAmt) || parsedAmt <= 0) { alert('Valor inválido.'); return; }
        const clientName = clients.find(c => c.id === invoiceForm.client)?.name || invoiceForm.client;
        const { error } = await supabase.from('financial_invoices').insert({
            client: clientName, number: invoiceForm.number,
            amount: parsedAmt, date: invoiceForm.date,
            status: 'EMITIDA', notes: invoiceForm.notes || '',
            created_by: JSON.parse(localStorage.getItem('userData') || '{}').name
        });
        if (error) { console.error(error); alert('Erro ao salvar fatura: ' + (error.message || 'Erro desconhecido')); return; }
        setShowInvoiceForm(false);
        setInvoiceForm({ client: '', number: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
        fetchInvoices();
    };

    const handleInvoiceStatusChange = async (id: string, newStatus: 'EMITIDA' | 'PAGA' | 'CANCELADA') => {
        const { error } = await supabase.from('financial_invoices').update({ status: newStatus }).eq('id', id);
        if (error) { console.error(error); alert('Erro ao atualizar status da fatura.'); return; }
        fetchInvoices();
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
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in">
                                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                        <h3 className="font-bold text-gray-800 uppercase text-xs tracking-widest">Nova Fatura</h3>
                                        <button onClick={() => setShowInvoiceForm(false)}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Cliente *</label>
                                            <select className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase" value={invoiceForm.client} onChange={e => setInvoiceForm({...invoiceForm, client: e.target.value})} data-testid="select-invoice-client">
                                                <option value="">Selecione...</option>
                                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Nº da Fatura *</label>
                                                <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase" placeholder="NF-001" value={invoiceForm.number} onChange={e => setInvoiceForm({...invoiceForm, number: e.target.value})} data-testid="input-invoice-number" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Valor *</label>
                                                <input type="number" step="0.01" className="w-full p-2.5 border rounded-lg text-sm font-mono font-bold" placeholder="0.00" value={invoiceForm.amount} onChange={e => setInvoiceForm({...invoiceForm, amount: e.target.value})} data-testid="input-invoice-amount" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Data de Emissão</label>
                                            <input type="date" className="w-full p-2.5 border rounded-lg text-sm font-bold" value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})} data-testid="input-invoice-date" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Observações</label>
                                            <textarea className="w-full p-2.5 border rounded-lg text-sm" rows={2} placeholder="Detalhes da fatura..." value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})} data-testid="input-invoice-notes" />
                                        </div>
                                        <button onClick={handleSaveInvoice} className="w-full bg-gray-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg" data-testid="btn-save-invoice">
                                            <Receipt size={18}/> Emitir Fatura
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
                                            <th className="px-4 py-3">Nº Fatura</th>
                                            <th className="px-4 py-3">Cliente</th>
                                            <th className="px-4 py-3">Data Emissão</th>
                                            <th className="px-4 py-3 text-right">Valor</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3">Observações</th>
                                            <th className="px-4 py-3 text-right no-print">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {invoices.length === 0 ? (
                                            <tr><td colSpan={7} className="p-12 text-center text-gray-400 font-bold uppercase italic text-sm">Nenhuma fatura emitida.</td></tr>
                                        ) : invoices.map(inv => (
                                            <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 text-sm font-black text-gray-900 uppercase">{inv.number}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">{inv.client}</td>
                                                <td className="px-4 py-3 text-xs font-mono text-gray-500">{new Date(inv.date).toLocaleDateString('pt-BR')}</td>
                                                <td className="px-4 py-3 text-right font-black font-mono text-sm text-green-600">{formatCurrency(inv.amount)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${inv.status === 'PAGA' ? 'bg-green-100 text-green-800 border-green-200' : inv.status === 'CANCELADA' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                        {inv.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{inv.notes || '-'}</td>
                                                <td className="px-4 py-3 text-right no-print">
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
                        Fechamento de Terceiros
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 ml-4.5">Contas a pagar, receber, faturas e fechamento financeiro.</p>
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
                            <Plus size={18}/> Nova Fatura
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
