
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
    TrendingUp, TrendingDown, DollarSign, Wallet, Landmark, RefreshCw, 
    BarChart3, CheckCircle2, AlertCircle, CalendarDays, ArrowUpRight, 
    ArrowDownRight, LayoutDashboard, PieChart, ArrowRight, Activity,
    Calendar, AlertTriangle, ChevronRight, Target
} from 'lucide-react';
import { FinancialTransaction, FinancialAccount, FinancialCategory } from '../types';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const FinancialDashboard: React.FC = () => {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'MONTH' | 'YEAR' | 'ALL' | 'CUSTOM'>('MONTH');
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchData(); }, [period, customStartDate, customEndDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accs, trans, cats] = await Promise.all([
        supabase.from('financial_accounts').select('*'),
        supabase.from('financial_transactions').select('*').order('due_date', { ascending: false }),
        supabase.from('financial_categories').select('*')
      ]);
      if (accs.data) setAccounts(accs.data as any);
      if (trans.data) setTransactions(trans.data as any);
      if (cats.data) setCategories(cats.data as any);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const currentBalances = accounts.map(acc => {
        const accTrans = transactions.filter(t => t.account_id === acc.id && t.status === 'PAID');
        const income = accTrans.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
        const expense = accTrans.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
        return acc.initial_balance + income - expense;
    });
    const totalCash = currentBalances.reduce((a, b) => a + b, 0);

    const periodTrans = transactions.filter(t => {
        if (period === 'ALL') return true;
        const d = new Date(t.due_date);
        if (period === 'MONTH') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (period === 'CUSTOM') {
            const transDate = t.due_date.split('T')[0];
            return transDate >= customStartDate && transDate <= customEndDate;
        }
        return d.getFullYear() === now.getFullYear();
    });

    const incomeConfirmed = periodTrans.filter(t => t.type === 'INCOME' && t.status === 'PAID').reduce((acc, t) => acc + t.amount, 0);
    const expenseConfirmed = periodTrans.filter(t => t.type === 'EXPENSE' && t.status === 'PAID').reduce((acc, t) => acc + t.amount, 0);
    
    const pendingIncome = transactions.filter(t => t.type === 'INCOME' && t.status === 'PENDING').reduce((acc, t) => acc + t.amount, 0);
    const pendingExpense = transactions.filter(t => t.type === 'EXPENSE' && t.status === 'PENDING').reduce((acc, t) => acc + t.amount, 0);
    const overdueExpense = transactions.filter(t => t.type === 'EXPENSE' && t.status === 'PENDING' && t.due_date < todayStr).reduce((acc, t) => acc + t.amount, 0);

    const expenseByCat: Record<string, number> = {};
    periodTrans.filter(t => t.type === 'EXPENSE').forEach(t => {
        const catName = t.category_name || 'Outros';
        expenseByCat[catName] = (expenseByCat[catName] || 0) + t.amount;
    });
    const topExpenses = Object.entries(expenseByCat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    return {
        totalCash,
        incomeConfirmed,
        expenseConfirmed,
        pendingIncome,
        pendingExpense,
        overdueExpense,
        projectedCash: totalCash + pendingIncome - pendingExpense,
        topExpenses,
        margin: incomeConfirmed - expenseConfirmed,
        marginPercent: incomeConfirmed > 0 ? ((incomeConfirmed - expenseConfirmed) / incomeConfirmed) * 100 : 0
    };
  }, [transactions, accounts, period, customStartDate, customEndDate]);

  const weeklyChart = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayTrans = transactions.filter(t => t.due_date.startsWith(dateStr));
        const inc = dayTrans.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
        const exp = dayTrans.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
        days.push({ label: i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }), inc, exp });
    }
    return days;
  }, [transactions]);

  const maxChartVal = Math.max(...weeklyChart.map(d => Math.max(d.inc, d.exp)), 1);

  return (
    <div className="space-y-6 animate-fade-in pb-12 bg-gray-50/50 p-2 rounded-2xl">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <div className="p-2 bg-red-700 text-white rounded-xl shadow-lg shadow-red-200">
                <BarChart3 size={24} />
            </div>
            Inteligência Financeira
          </h2>
          <p className="text-sm text-gray-500 font-medium ml-12">Visão consolidada de performance e liquidez</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-200 flex-wrap">
            {[
                {id: 'MONTH', label: 'Este Mês'},
                {id: 'YEAR', label: 'Este Ano'},
                {id: 'ALL', label: 'Tudo'},
                {id: 'CUSTOM', label: 'Personalizado'}
            ].map(p => (
                <button 
                    key={p.id} 
                    onClick={() => setPeriod(p.id as any)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${period === p.id ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    {p.label}
                </button>
            ))}
            {period === 'CUSTOM' && (
                <div className="flex items-center gap-2 ml-1">
                    <input type="date" className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 outline-none" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                    <span className="text-gray-400 text-xs">até</span>
                    <input type="date" className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 outline-none" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                </div>
            )}
            <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-1">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Real Disponível</p>
                <Wallet className="text-indigo-500 group-hover:scale-110 transition-transform" size={18} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 font-mono tracking-tighter">
                {formatCurrency(metrics.totalCash)}
              </h3>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1 rounded-lg w-fit">
                <CheckCircle2 size={12}/> CONTAS CONCILIADAS
              </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Recebíveis (Pendente)</p>
                <ArrowUpRight className="text-green-500 group-hover:scale-110 transition-transform" size={18} />
              </div>
              <h3 className="text-2xl font-black text-green-600 font-mono tracking-tighter">
                {formatCurrency(metrics.pendingIncome)}
              </h3>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded-lg w-fit uppercase">
                Aguardando Confirmação
              </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contas a Pagar</p>
                <ArrowDownRight className="text-red-500 group-hover:scale-110 transition-transform" size={18} />
              </div>
              <h3 className="text-2xl font-black text-red-600 font-mono tracking-tighter">
                {formatCurrency(metrics.pendingExpense)}
              </h3>
              {metrics.overdueExpense > 0 ? (
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-red-700 font-bold bg-red-50 px-2 py-1 rounded-lg w-fit animate-pulse uppercase">
                    <AlertTriangle size={12}/> {formatCurrency(metrics.overdueExpense)} ATRASADO
                  </div>
              ) : (
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-lg w-fit uppercase">
                    Tudo em dia
                  </div>
              )}
          </div>

          <div className="bg-gray-900 p-5 rounded-2xl shadow-xl text-white group overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform">
                  <Target size={80} />
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Fluxo Projetado</p>
                <h3 className={`text-2xl font-black font-mono tracking-tighter ${metrics.projectedCash >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(metrics.projectedCash)}
                </h3>
                <p className="text-[9px] text-gray-500 mt-3 font-bold uppercase">Base: Saldo + Futuro</p>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-1">
          <div className="lg:col-span-8 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                      <h4 className="text-sm font-black text-gray-800 uppercase flex items-center gap-2">
                        <Activity size={18} className="text-red-700"/> Performance do Período
                      </h4>
                      <div className={`px-3 py-1 rounded-full text-xs font-black uppercase ${metrics.marginPercent >= 20 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          Margem Líquida: {metrics.marginPercent.toFixed(1)}%
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Faturamento (Bruto)</p>
                          <p className="text-xl font-black text-gray-900 font-mono">{formatCurrency(metrics.incomeConfirmed)}</p>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-2">
                              <div className="bg-green-500 h-full w-full"></div>
                          </div>
                      </div>
                      <div className="space-y-1">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Custos / Despesas</p>
                          <p className="text-xl font-black text-gray-900 font-mono">{formatCurrency(metrics.expenseConfirmed)}</p>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-2">
                              <div className="bg-red-500 h-full" style={{ width: `${(metrics.expenseConfirmed / (metrics.incomeConfirmed || 1)) * 100}%` }}></div>
                          </div>
                      </div>
                      <div className="space-y-1">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Lucro Líquido</p>
                          <p className={`text-xl font-black font-mono ${metrics.margin >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                            {formatCurrency(metrics.margin)}
                          </p>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-2">
                              <div className="bg-blue-600 h-full" style={{ width: `${Math.max(0, metrics.marginPercent)}%` }}></div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-black text-gray-800 uppercase flex items-center gap-2 mb-6">
                        <PieChart size={18} className="text-orange-500"/> Maiores Custos por Grupo
                      </h4>
                      <div className="space-y-4">
                          {metrics.topExpenses.length > 0 ? metrics.topExpenses.map(([name, val], idx) => {
                              const max = metrics.topExpenses[0][1];
                              return (
                                <div key={name} className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold uppercase">
                                        <span className="text-gray-600 truncate max-w-[150px]">{name}</span>
                                        <span className="text-gray-900">{formatCurrency(val)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                        <div className="bg-gray-900 h-full rounded-full" style={{ width: `${(val / max) * 100}%` }}></div>
                                    </div>
                                </div>
                              )
                          }) : (
                              <div className="h-32 flex items-center justify-center text-gray-300 text-xs font-bold uppercase italic">Sem dados de despesa</div>
                          )}
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-black text-gray-800 uppercase flex items-center gap-2 mb-6">
                        <CalendarDays size={18} className="text-blue-600"/> Liquidez Próximos 7 Dias
                      </h4>
                      <div className="h-36 flex items-end gap-2 px-1">
                          {weeklyChart.map((d, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                                  <div className="flex flex-col w-full items-center gap-[1px]">
                                      <div className="w-full max-w-[12px] bg-green-500/80 rounded-t-sm transition-all group-hover:bg-green-600" style={{ height: `${(d.inc / maxChartVal) * 100}%`, minHeight: d.inc > 0 ? '2px' : '0' }}></div>
                                      <div className="w-full max-w-[12px] bg-red-500/80 rounded-b-sm transition-all group-hover:bg-red-600" style={{ height: `${(d.exp / maxChartVal) * 100}%`, minHeight: d.exp > 0 ? '2px' : '0' }}></div>
                                  </div>
                                  <span className="text-[8px] font-black text-gray-400 uppercase mt-2">{d.label}</span>
                                  <div className="absolute bottom-full mb-1 bg-black text-white text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none">
                                      +{formatCurrency(d.inc)} / -{formatCurrency(d.exp)}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                  <h4 className="text-sm font-black text-gray-800 uppercase flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                      <Landmark className="text-indigo-600" /> Saldos por Instituição
                  </h4>
                  <div className="space-y-3 flex-1">
                      {accounts.map(acc => {
                          const accTrans = transactions.filter(t => t.account_id === acc.id && t.status === 'PAID');
                          const inc = accTrans.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0);
                          const exp = accTrans.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
                          const bal = acc.initial_balance + inc - exp;
                          
                          return (
                              <div key={acc.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50 flex justify-between items-center group hover:bg-white hover:border-red-100 transition-all cursor-default">
                                  <div className="min-w-0">
                                      <p className="text-xs font-black text-gray-800 uppercase truncate">{acc.name}</p>
                                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">{acc.bank_name || 'Diversos'}</p>
                                  </div>
                                  <p className={`text-sm font-mono font-black shrink-0 ${bal >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                                      {formatCurrency(bal)}
                                  </p>
                              </div>
                          );
                      })}
                  </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-black text-gray-800 uppercase flex items-center gap-2">
                        <RefreshCw size={18} className="text-indigo-600"/> Atividade Recente
                    </h4>
                    <span className="text-[10px] text-gray-400 font-bold">5 ÚLTIMOS</span>
                  </div>
                  <div className="space-y-4">
                      {transactions.filter(t => t.status === 'PAID').slice(0, 5).map(t => (
                          <div key={t.id} className="flex items-center gap-3 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                              <div className={`p-2 rounded-lg shrink-0 ${t.type === 'INCOME' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                  {t.type === 'INCOME' ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="text-xs font-black text-gray-800 truncate uppercase leading-tight">{t.description}</p>
                                  <div className="flex items-center gap-2 text-[9px] text-gray-400 font-bold">
                                      <Calendar size={10}/> {new Date(t.payment_date || t.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                      <span className="text-gray-300">•</span>
                                      <span className="truncate">{t.account_name}</span>
                                  </div>
                              </div>
                              <div className={`text-xs font-black font-mono ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                  {t.type === 'INCOME' ? '+' : '-'} {formatCurrency(t.amount)}
                              </div>
                          </div>
                      ))}
                  </div>
                  <button className="w-full mt-6 py-2 border-2 border-dashed border-gray-100 rounded-xl text-[10px] font-black text-gray-400 hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-all uppercase flex items-center justify-center gap-2">
                      Ver Relatório Completo <ArrowRight size={14}/>
                  </button>
              </div>
          </div>

      </div>
    </div>
  );
};

export default FinancialDashboard;
