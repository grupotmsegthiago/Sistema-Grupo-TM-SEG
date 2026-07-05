
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { FinancialTransaction, FinancialAccount } from '../types';
import { 
    Calendar, ArrowUpCircle, ArrowDownCircle, Landmark, 
    RefreshCw, Loader2, Printer, Search, Building2,
    DollarSign, TrendingUp, TrendingDown, Wallet, FileText,
    ArrowRight, Filter, ChevronDown
} from 'lucide-react';

interface AccountMovement {
    account: FinancialAccount;
    inflow: number;
    outflow: number;
    transactions: FinancialTransaction[];
}

const DailyCashMovement: React.FC = () => {
    // Estados de Filtro
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
    
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    useRealtimeRefresh(['financial_transactions', 'financial_accounts'], () => fetchData());

    const fetchData = async () => {
        setLoading(true);
        try {
            const [accsRes, transRes] = await Promise.all([
                supabase.from('financial_accounts').select('*').order('name'),
                supabase.from('financial_transactions')
                    .select('*')
                    .gte('due_date', startDate)
                    .lte('due_date', endDate)
                    .order('due_date', { ascending: false })
            ]);

            if (accsRes.data) setAccounts(accsRes.data as any);
            if (transRes.data) setTransactions(transRes.data as any);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Agrupamento por conta para os gráficos e lista
    const movementsByAccount = useMemo(() => {
        const map: Record<string, AccountMovement> = {};

        accounts.forEach(acc => {
            map[acc.id] = {
                account: acc,
                inflow: 0,
                outflow: 0,
                transactions: []
            };
        });

        transactions.forEach(t => {
            const accId = t.account_id;
            if (accId && map[accId]) {
                map[accId].transactions.push(t);
                if (t.type === 'INCOME') map[accId].inflow += t.amount;
                else map[accId].outflow += t.amount;
            }
        });

        return Object.values(map);
    }, [transactions, accounts]);

    // Dados para os 3 gráficos principais (Contas do Grupo)
    const groupMainAccounts = useMemo(() => {
        const targetNames = ['TM SEGURANÇA', 'TM GESTÃO', 'TM SECURITY'];
        return movementsByAccount
            .filter(m => targetNames.includes(m.account.name.toUpperCase()))
            .sort((a, b) => targetNames.indexOf(a.account.name.toUpperCase()) - targetNames.indexOf(b.account.name.toUpperCase()));
    }, [movementsByAccount]);

    // Filtro final da lista detalhada
    const listData = useMemo(() => {
        if (selectedAccountId === 'ALL') {
            return movementsByAccount.filter(m => m.transactions.length > 0);
        }
        return movementsByAccount.filter(m => m.account.id === selectedAccountId && m.transactions.length > 0);
    }, [movementsByAccount, selectedAccountId]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    .print-area { padding: 0 !important; margin: 0 !important; }
                    .card { border: 1px solid #eee !important; box-shadow: none !important; }
                }
            `}</style>

            {/* HEADER E FILTROS */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                            <Calendar className="text-red-700" /> Movimentação de Caixa
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Relatórios por período e análise individual de empresas.</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchData} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500 transition-all">
                            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => window.print()} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-black transition-all shadow-md">
                            <Printer size={18} /> Exportar PDF
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Empresa / Conta</label>
                        <div className="relative">
                            <select 
                                className="w-full bg-white border border-gray-200 rounded-lg py-2 pl-9 pr-4 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-red-500/10 appearance-none"
                                value={selectedAccountId}
                                onChange={(e) => setSelectedAccountId(e.target.value)}
                            >
                                <option value="ALL">TODAS AS EMPRESAS</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                            <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Data Inicial</label>
                        <input 
                            type="date" 
                            className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-red-500/10"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Data Final</label>
                        <input 
                            type="date" 
                            className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-red-500/10"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-end">
                        <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 flex items-center justify-center gap-2 text-xs font-bold text-gray-500">
                           <Filter size={14}/> {transactions.length} lançamentos no período
                        </div>
                    </div>
                </div>
            </div>

            {/* TRÊS GRÁFICOS LADO A LADO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {groupMainAccounts.length > 0 ? groupMainAccounts.map(m => {
                    const total = m.inflow + m.outflow || 1;
                    const incomePerc = (m.inflow / total) * 100;
                    const expensePerc = (m.outflow / total) * 100;
                    const balance = m.inflow - m.outflow;

                    return (
                        <div key={m.account.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Performance Real</h3>
                                    <p className="text-lg font-black text-gray-800 uppercase tracking-tight">{m.account.name}</p>
                                </div>
                                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                                    <Landmark size={20} className="text-red-700" />
                                </div>
                            </div>

                            <div className="space-y-5 flex-1">
                                {/* Barra de Entrada */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-black uppercase">
                                        <span className="text-gray-400 flex items-center gap-1"><ArrowUpCircle size={10} className="text-green-500"/> Entradas</span>
                                        <span className="text-green-600">{formatCurrency(m.inflow)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${incomePerc}%` }}></div>
                                    </div>
                                </div>

                                {/* Barra de Saída */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-black uppercase">
                                        <span className="text-gray-400 flex items-center gap-1"><ArrowDownCircle size={10} className="text-red-500"/> Saídas</span>
                                        <span className="text-red-600">{formatCurrency(m.outflow)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${expensePerc}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t border-gray-50 flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Saldo Líquido</p>
                                    <p className={`text-xl font-black font-mono tracking-tighter ${balance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                        {formatCurrency(balance)}
                                    </p>
                                </div>
                                <div className={`text-[10px] font-black px-2 py-1 rounded-lg ${balance >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {Math.abs((balance / (m.inflow || 1)) * 100).toFixed(1)}% MARGEM
                                </div>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="col-span-3 bg-white p-10 rounded-2xl border-2 border-dashed border-gray-200 text-center">
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nenhuma das contas principais possui movimento neste período.</p>
                    </div>
                )}
            </div>

            {/* LISTAGEM DETALHADA GRUPADA POR EMPRESA */}
            <div className="space-y-8 print-area">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Loader2 size={40} className="animate-spin mb-4 text-red-700" />
                        <p className="font-bold uppercase text-xs tracking-widest">Consolidando Movimentos...</p>
                    </div>
                ) : listData.length === 0 ? (
                    <div className="bg-white p-20 rounded-xl border-2 border-dashed border-gray-200 text-center flex flex-col items-center">
                        <Wallet size={48} className="text-gray-200 mb-4" />
                        <h3 className="text-lg font-bold text-gray-400 uppercase">Nenhum lançamento filtrado</h3>
                        <p className="text-sm text-gray-300">Ajuste os filtros acima para visualizar o detalhamento das transações.</p>
                    </div>
                ) : (
                    listData.map(m => (
                        <div key={m.account.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden card">
                            {/* Header da Empresa na Lista */}
                            <div className="bg-gray-50 p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 shadow-sm font-bold text-sm">
                                        <Building2 size={18} className="text-red-700" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900 uppercase tracking-tight">{m.account.name}</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{m.account.bank_name || 'Caixa Geral'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Entradas</p>
                                        <p className="text-sm font-black text-green-600">{formatCurrency(m.inflow)}</p>
                                    </div>
                                    <div className="text-right border-l border-gray-200 pl-4">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Saídas</p>
                                        <p className="text-sm font-black text-red-600">{formatCurrency(m.outflow)}</p>
                                    </div>
                                    <div className="text-right border-l border-gray-200 pl-4">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Saldo Período</p>
                                        <p className={`text-sm font-black ${m.inflow - m.outflow >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                            {formatCurrency(m.inflow - m.outflow)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Tabela de Transações */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-white border-b border-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            <th className="px-6 py-4">Data</th>
                                            <th className="px-6 py-4">Descrição / Categoria</th>
                                            <th className="px-6 py-4">Vínculo</th>
                                            <th className="px-6 py-4 text-center">Status</th>
                                            <th className="px-6 py-4 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {m.transactions.map(t => (
                                            <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-mono font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded w-fit">
                                                        {new Date(t.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-800 text-sm uppercase">{t.description}</div>
                                                    <div className="text-[10px] text-gray-400 font-bold uppercase">{t.category_name}</div>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">
                                                    {t.entity_name || '-'}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${t.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                        {t.status === 'PAID' ? 'Confirmado' : 'Pendente'}
                                                    </span>
                                                </td>
                                                <td className={`px-6 py-4 text-right font-black font-mono text-sm ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {t.type === 'INCOME' ? '+' : '-'} {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* RODAPÉ DE IMPRESSÃO */}
            <div className="hidden print:block mt-10 border-t-2 border-gray-900 pt-4 text-center">
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.3em]">Grupo TMSEG - Inteligência Operacional & Financeira</p>
                <p className="text-[8px] text-gray-300 mt-1 italic">Relatório gerado em {new Date().toLocaleString('pt-BR')}</p>
            </div>
        </div>
    );
};

export default DailyCashMovement;
