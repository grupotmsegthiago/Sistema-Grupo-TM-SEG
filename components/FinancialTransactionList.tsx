
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FinancialTransaction, TransactionType, TransactionStatus, FinancialAccount } from '../types';
import { 
  Plus, Search, Filter, Edit, Trash2, CheckCircle2, RefreshCw, 
  FileText, Calendar, Wallet, ArrowUpCircle, ArrowDownCircle, 
  BarChart3, Landmark, ArrowRight, AlertCircle, DollarSign, 
  CalendarRange, Download, Printer, ChevronDown, FileDown,
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Loader2
} from 'lucide-react';
import FinancialTransactionForm from './FinancialTransactionForm';
import BankStatementImporter from './BankStatementImporter';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const FinancialTransactionList: React.FC = () => {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewPeriod, setViewPeriod] = useState<'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'MONTH' | 'CUSTOM' | 'ALL'>('MONTH');
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [canAccessReconciliation, setCanAccessReconciliation] = useState(false);

  useEffect(() => { 
      fetchTransactions();
      fetchAccounts();
      checkAccess();
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

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];

    return transactions.filter(t => {
        const transDate = t.due_date.split('T')[0];
        let matchesPeriod = true;

        if (viewPeriod === 'TODAY') matchesPeriod = transDate === todayStr;
        else if (viewPeriod === 'YESTERDAY') matchesPeriod = transDate === yesterdayStr;
        else if (viewPeriod === 'LAST_WEEK') matchesPeriod = transDate >= lastWeekStr && transDate <= todayStr;
        else if (viewPeriod === 'MONTH') {
            const d = new Date(t.due_date);
            matchesPeriod = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        else if (viewPeriod === 'CUSTOM') {
            matchesPeriod = transDate >= customStartDate && transDate <= customEndDate;
        }

        const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (t.category_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'ALL' || t.type === filterType;

        return matchesPeriod && matchesSearch && matchesType;
    });
  }, [transactions, searchTerm, filterType, viewPeriod, customStartDate, customEndDate]);

  const handleToggleStatus = async (t: FinancialTransaction) => {
      const newStatus: TransactionStatus = t.status === 'PAID' ? 'PENDING' : 'PAID';
      const updates = { 
          status: newStatus, 
          payment_date: newStatus === 'PAID' ? t.due_date : null 
      };
      try {
          setTransactions(prev => prev.map(item => item.id === t.id ? { ...item, ...updates } : item));
          await supabase.from('financial_transactions').update(updates).eq('id', t.id);
      } catch(e) { 
          alert("Erro ao atualizar status"); 
          fetchTransactions(); 
      }
  };

  const exportToCSV = () => {
    if (filtered.length === 0) return;
    const headers = ["Data", "Descricao", "Categoria", "Conta", "Tipo", "Valor", "Status"];
    const rows = filtered.map(t => [
        new Date(t.due_date).toLocaleDateString('pt-BR'),
        t.description,
        t.category_name,
        t.account_name,
        t.type === 'INCOME' ? 'Receita' : 'Despesa',
        t.amount.toFixed(2),
        t.status
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `RELATORIO_FINANCEIRO_${viewPeriod}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            Fluxo de Caixa & Lançamentos
          </h2>
          <p className="text-xs text-gray-500 mt-1 ml-4.5">Gestão financeira e conciliação operacional.</p>
        </div>
        <div className="flex gap-2">
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 no-print">
                <button onClick={exportToCSV} className="p-2 text-gray-600 hover:text-green-600 transition-colors" title="Exportar Excel (CSV)">
                    <FileDown size={20} />
                </button>
                <button onClick={() => window.print()} className="p-2 text-gray-600 hover:text-red-600 transition-colors" title="Imprimir PDF">
                    <Printer size={20} />
                </button>
            </div>
            {canAccessReconciliation && (
                <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-4 py-2.5 rounded-lg text-sm font-bold transition-all">
                    <FileText size={18} /> Conciliação
                </button>
            )}
            <button onClick={fetchTransactions} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
            <button onClick={() => setIsFormOpen(true)} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"><Plus size={18} /> Novo Lançamento</button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end no-print">
          <div className="lg:col-span-4">
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">Período de Pesquisa</label>
              <div className="flex flex-wrap gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                  {[
                      {id: 'TODAY', label: 'Hoje'},
                      {id: 'YESTERDAY', label: 'Ontem'},
                      {id: 'LAST_WEEK', label: 'Semana'},
                      {id: 'MONTH', label: 'Mês Atual'},
                      {id: 'CUSTOM', label: 'Personalizado'},
                      {id: 'ALL', label: 'Tudo'}
                  ].map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => setViewPeriod(p.id as any)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${viewPeriod === p.id ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                          {p.label}
                      </button>
                  ))}
              </div>
          </div>

          {viewPeriod === 'CUSTOM' && (
              <div className="lg:col-span-3 flex gap-2 animate-in slide-in-from-left-2">
                  <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 mb-1 block">Início</label>
                      <input type="date" className="w-full p-2 border rounded-lg text-xs" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                  </div>
                  <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 mb-1 block">Fim</label>
                      <input type="date" className="w-full p-2 border rounded-lg text-xs" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                  </div>
              </div>
          )}

          <div className={`relative ${viewPeriod === 'CUSTOM' ? 'lg:col-span-3' : 'lg:col-span-6'}`}>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">Filtrar por Nome ou Categoria</label>
              <input 
                type="text" 
                placeholder="Ex: Combustível, Cliente X..." 
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-red-500 outline-none transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Search size={18} className="absolute left-3 bottom-2.5 text-gray-400" />
          </div>

          <div className="lg:col-span-2 flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setFilterType('ALL')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded ${filterType === 'ALL' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Tudo</button>
                <button onClick={() => setFilterType('INCOME')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded ${filterType === 'INCOME' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500'}`}>Receitas</button>
                <button onClick={() => setFilterType('EXPENSE')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded ${filterType === 'EXPENSE' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500'}`}>Despesas</button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-full"><TrendingUp size={20}/></div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Receitas no Período</p>
                  <p className="text-xl font-black text-green-600 font-mono">
                      {formatCurrency(filtered.filter(t => t.type === 'INCOME').reduce((acc, curr) => acc + curr.amount, 0))}
                  </p>
              </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-full"><TrendingDown size={20}/></div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Despesas no Período</p>
                  <p className="text-xl font-black text-red-600 font-mono">
                      {formatCurrency(filtered.filter(t => t.type === 'EXPENSE').reduce((acc, curr) => acc + curr.amount, 0))}
                  </p>
              </div>
          </div>
          <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 shadow-lg flex items-center gap-4 text-white">
              <div className="p-3 bg-white/10 rounded-full"><DollarSign size={20}/></div>
              <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Saldo Líquido</p>
                  <p className="text-xl font-black font-mono">
                      {formatCurrency(filtered.filter(t => t.type === 'INCOME').reduce((acc, curr) => acc + curr.amount, 0) - filtered.filter(t => t.type === 'EXPENSE').reduce((acc, curr) => acc + curr.amount, 0))}
                  </p>
              </div>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                          <th className="px-6 py-4">Data Venc.</th>
                          <th className="px-6 py-4">Descrição</th>
                          <th className="px-6 py-4">Categoria</th>
                          <th className="px-6 py-4">Conta</th>
                          <th className="px-6 py-4 text-center">Status</th>
                          <th className="px-6 py-4 text-right">Valor</th>
                          <th className="px-6 py-4 text-right no-print">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {loading ? (<tr><td colSpan={7} className="p-8 text-center text-gray-500"><Loader2 className="animate-spin mx-auto text-red-700"/></td></tr>) : 
                       filtered.length === 0 ? (<tr><td colSpan={7} className="p-12 text-center text-gray-400 font-bold uppercase italic">Nenhum lançamento encontrado para os filtros aplicados.</td></tr>) :
                       filtered.map(t => (
                          <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-xs font-mono text-gray-500">{new Date(t.due_date).toLocaleDateString('pt-BR')}</td>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-gray-800 text-sm uppercase">{t.description}</div>
                                  <div className="text-[9px] text-gray-400 font-bold uppercase">Fav: {t.entity_name || 'Geral'}</div>
                              </td>
                              <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">
                                      {t.category_name}
                                  </span>
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-gray-600 uppercase">{t.account_name || 'Caixa'}</td>
                              <td className="px-6 py-4 text-center">
                                  <button onClick={() => handleToggleStatus(t)} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-all ${t.status === 'PAID' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-white text-gray-400 border-gray-200'}`}>
                                      {t.status === 'PAID' ? 'Confirmado' : 'Pendente'}
                                  </button>
                              </td>
                              <td className={`px-6 py-4 text-right font-black font-mono text-sm ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                  {t.type === 'INCOME' ? '+' : '-'} {formatCurrency(t.amount)}
                              </td>
                              <td className="px-6 py-4 text-right no-print">
                                  <div className="flex justify-end gap-1">
                                      <button onClick={() => { setEditingId(t.id); setIsFormOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-all"><Edit size={16}/></button>
                                      <button onClick={() => { if(confirm("Excluir lançamento?")) supabase.from('financial_transactions').delete().eq('id', t.id).then(() => fetchTransactions()); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-all"><Trash2 size={16}/></button>
                                  </div>
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

export default FinancialTransactionList;
