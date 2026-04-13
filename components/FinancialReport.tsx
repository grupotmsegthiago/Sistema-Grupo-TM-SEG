
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FinancialTransaction, FinancialCategory } from '../types';
import { 
    FileText, Calendar, DollarSign, Download, Printer, Filter, 
    ArrowUpCircle, ArrowDownCircle, ShieldAlert, Loader2, Search, TrendingUp, User,
    AlertTriangle, BarChart3, Clock, ChevronRight, RefreshCw
} from 'lucide-react';

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getTodayBR = (): string => {
    const now = new Date();
    const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const y = brDate.getFullYear();
    const m = String(brDate.getMonth() + 1).padStart(2, '0');
    const d = String(brDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTH_NAMES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const MonthlyBarChart: React.FC<{ data: { month: string; value: number; monthIdx: number }[]; color: string; title: string; icon: React.ReactNode }> = ({ data, color, title, icon }) => {
    if (!data || data.length === 0) return (
        <div className="h-52 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <BarChart3 size={28} className="mb-2 opacity-50"/>
            <p className="text-xs">Sem dados para o período.</p>
        </div>
    );

    const maxVal = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h4 className="text-xs font-black text-gray-900 uppercase mb-4 flex items-center gap-2">{icon} {title}</h4>
            <div className="flex items-end gap-2 h-40">
                {data.map((d, i) => {
                    const pct = (d.value / maxVal) * 100;
                    return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                            <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[9px] px-2 py-1 rounded shadow-xl whitespace-nowrap z-10 font-mono pointer-events-none">
                                {formatCurrency(d.value)}
                            </div>
                            <div 
                                className="w-full rounded-t-md transition-all duration-500 min-h-[4px]"
                                style={{ height: `${Math.max(pct, 3)}%`, backgroundColor: color, opacity: 0.85 }}
                            />
                            <p className="text-[9px] font-bold text-gray-500 mt-1.5 uppercase">{d.month}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const FinancialReport: React.FC = () => {
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [categories, setCategories] = useState<FinancialCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDirector, setIsDirector] = useState(false);
    const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewPeriod, setViewPeriod] = useState<'DIA' | 'SEMANA' | 'MES' | 'TRIMESTRE' | 'SEMESTRE' | 'ANUAL' | 'TODOS'>('TODOS');

    useEffect(() => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
                setIsDirector(true);
                fetchData();
                fetchCategories();
            } else {
                setIsDirector(false);
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .gte('due_date', '2026-02-15')
                .order('due_date', { ascending: false });
            if (error) throw error;
            setTransactions(data as FinancialTransaction[]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        const { data } = await supabase.from('financial_categories').select('*');
        if (data) setCategories(data as FinancialCategory[]);
    };

    const investmentCategoryIds = useMemo(() => {
        return new Set(categories.filter(c => c.group === 'INVESTIMENTOS').map(c => c.id));
    }, [categories]);

    const todayStr = getTodayBR();
    const today = new Date(todayStr + 'T12:00:00');

    const nonInvestTx = useMemo(() => {
        return transactions.filter(t => {
            if (investmentCategoryIds.has(t.category_id)) return false;
            const catName = (t.category_name || '').toLowerCase();
            if (catName.includes('investimento') || catName.includes('investimentos') || catName.includes('aplicaç') || catName.includes('resgate')) return false;
            return true;
        });
    }, [transactions, investmentCategoryIds]);

    const periodLabel = useMemo(() => {
        const now = today;
        const labels: Record<string, string> = {
            DIA: now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            SEMANA: 'Semana Atual',
            MES: `${MONTH_NAMES[now.getMonth()]}/${now.getFullYear()}`,
            TRIMESTRE: `${MONTH_NAMES[now.getMonth()]}—${MONTH_NAMES[Math.min(now.getMonth()+2, 11)]}/${now.getFullYear()}`,
            SEMESTRE: `${MONTH_NAMES[now.getMonth()]}—${MONTH_NAMES[Math.min(now.getMonth()+5, 11)]}/${now.getFullYear()}`,
            ANUAL: `${now.getFullYear()}`,
            TODOS: 'Todos os períodos',
        };
        return labels[viewPeriod] || '';
    }, [viewPeriod, today]);

    const periodFilteredTx = useMemo(() => {
        if (viewPeriod === 'TODOS') return nonInvestTx;
        const now = today;
        const getRange = (): [string, string] => {
            const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            switch (viewPeriod) {
                case 'DIA': return [todayStr, todayStr];
                case 'SEMANA': {
                    const dayOfWeek = now.getDay();
                    const sunday = new Date(now.getTime() - dayOfWeek * 86400000);
                    const saturday = new Date(sunday.getTime() + 6 * 86400000);
                    return [fmtDate(sunday), fmtDate(saturday)];
                }
                case 'MES': {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    return [fmtDate(start), fmtDate(end)];
                }
                case 'TRIMESTRE': {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
                    return [fmtDate(start), fmtDate(end)];
                }
                case 'SEMESTRE': {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
                    return [fmtDate(start), fmtDate(end)];
                }
                case 'ANUAL': {
                    return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
                }
                default: return ['2000-01-01', '2099-12-31'];
            }
        };
        const [rangeStart, rangeEnd] = getRange();
        return nonInvestTx.filter(t => {
            const d = t.due_date.split('T')[0];
            return d >= rangeStart && d <= rangeEnd;
        });
    }, [nonInvestTx, viewPeriod, today, todayStr]);

    const pendingIncome = useMemo(() => periodFilteredTx.filter(t => t.type === 'INCOME' && (t.status === 'PENDING' || t.status === 'SCHEDULED')), [periodFilteredTx]);
    const pendingExpense = useMemo(() => periodFilteredTx.filter(t => t.type === 'EXPENSE' && (t.status === 'PENDING' || t.status === 'SCHEDULED')), [periodFilteredTx]);

    const aReceberFuture = useMemo(() => pendingIncome.filter(t => t.due_date.split('T')[0] >= todayStr), [pendingIncome, todayStr]);
    const aPagarFuture = useMemo(() => pendingExpense.filter(t => t.due_date.split('T')[0] >= todayStr), [pendingExpense, todayStr]);
    const overdueIncome = useMemo(() => pendingIncome.filter(t => t.due_date.split('T')[0] < todayStr), [pendingIncome, todayStr]);
    const overdueExpense = useMemo(() => pendingExpense.filter(t => t.due_date.split('T')[0] < todayStr), [pendingExpense, todayStr]);

    const receberByMonth = useMemo(() => {
        const map: Record<string, { value: number; count: number; monthIdx: number; year: number }> = {};
        aReceberFuture.forEach(t => {
            const d = new Date(t.due_date + 'T12:00:00');
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (!map[key]) map[key] = { value: 0, count: 0, monthIdx: d.getMonth(), year: d.getFullYear() };
            map[key].value += t.amount;
            map[key].count += 1;
        });
        return Object.values(map).sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx);
    }, [aReceberFuture]);

    const pagarByMonth = useMemo(() => {
        const map: Record<string, { value: number; count: number; monthIdx: number; year: number }> = {};
        aPagarFuture.forEach(t => {
            const d = new Date(t.due_date + 'T12:00:00');
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (!map[key]) map[key] = { value: 0, count: 0, monthIdx: d.getMonth(), year: d.getFullYear() };
            map[key].value += t.amount;
            map[key].count += 1;
        });
        return Object.values(map).sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx);
    }, [aPagarFuture]);

    const getWeekRanges = (items: FinancialTransaction[]) => {
        const weeks: Record<string, { label: string; value: number; count: number; start: string; end: string; items: FinancialTransaction[] }> = {};
        items.forEach(t => {
            const parts = t.due_date.split('T')[0].split('-');
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            const d = new Date(year, month, day, 12, 0, 0);
            const dayOfWeek = d.getDay();
            const sundayTs = d.getTime() - dayOfWeek * 86400000;
            const saturdayTs = sundayTs + 6 * 86400000;
            const sunday = new Date(sundayTs);
            const saturday = new Date(saturdayTs);
            const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
            const keyFmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            const key = keyFmt(sunday);
            if (!weeks[key]) weeks[key] = { label: `${fmt(sunday)} — ${fmt(saturday)}`, value: 0, count: 0, start: key, end: keyFmt(saturday), items: [] };
            weeks[key].value += t.amount;
            weeks[key].count += 1;
            weeks[key].items.push(t);
        });
        return Object.values(weeks).sort((a, b) => a.start.localeCompare(b.start));
    };

    const receberByWeek = useMemo(() => getWeekRanges(aReceberFuture), [aReceberFuture]);
    const pagarByWeek = useMemo(() => getWeekRanges(aPagarFuture), [aPagarFuture]);

    const overdueByClient = useMemo(() => {
        const map: Record<string, { client: string; type: 'INCOME' | 'EXPENSE'; value: number; count: number; oldestDue: string; maxDays: number; items: FinancialTransaction[] }> = {};
        const allOverdue = [...overdueIncome.map(t => ({ ...t, _overType: 'INCOME' as const })), ...overdueExpense.map(t => ({ ...t, _overType: 'EXPENSE' as const }))];
        allOverdue.forEach(t => {
            const client = t.entity_name || t.description || 'Outros';
            const typeKey = t._overType;
            const groupKey = `${client}___${typeKey}`;
            const dueDateStr = t.due_date.split('T')[0];
            const dueDate = new Date(dueDateStr + 'T12:00:00');
            const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (!map[groupKey]) map[groupKey] = { client, type: typeKey, value: 0, count: 0, oldestDue: dueDateStr, maxDays: 0, items: [] };
            map[groupKey].value += t.amount;
            map[groupKey].count += 1;
            map[groupKey].items.push(t);
            if (diffDays > map[groupKey].maxDays) {
                map[groupKey].maxDays = diffDays;
                map[groupKey].oldestDue = dueDateStr;
            }
        });
        return Object.values(map).sort((a, b) => b.maxDays - a.maxDays);
    }, [overdueIncome, overdueExpense, today]);

    const paidIncome = useMemo(() => periodFilteredTx.filter(t => t.type === 'INCOME' && t.status === 'PAID'), [periodFilteredTx]);
    const paidExpense = useMemo(() => periodFilteredTx.filter(t => t.type === 'EXPENSE' && t.status === 'PAID'), [periodFilteredTx]);

    const totalRecebido = useMemo(() => paidIncome.reduce((a, t) => a + t.amount, 0), [paidIncome]);
    const totalPago = useMemo(() => paidExpense.reduce((a, t) => a + t.amount, 0), [paidExpense]);
    const totalAReceber = useMemo(() => aReceberFuture.reduce((a, t) => a + t.amount, 0), [aReceberFuture]);
    const totalAPagar = useMemo(() => aPagarFuture.reduce((a, t) => a + t.amount, 0), [aPagarFuture]);
    const totalInadimplencia = useMemo(() => [...overdueIncome, ...overdueExpense].reduce((a, t) => a + t.amount, 0), [overdueIncome, overdueExpense]);

    const chartReceberData = useMemo(() => receberByMonth.map(m => ({ month: `${MONTH_NAMES_SHORT[m.monthIdx]}/${String(m.year).slice(2)}`, value: m.value, monthIdx: m.monthIdx })), [receberByMonth]);
    const chartPagarData = useMemo(() => pagarByMonth.map(m => ({ month: `${MONTH_NAMES_SHORT[m.monthIdx]}/${String(m.year).slice(2)}`, value: m.value, monthIdx: m.monthIdx })), [pagarByMonth]);

    if (!isDirector) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-gray-50 rounded-xl border border-gray-200">
                <ShieldAlert size={64} className="text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900">Acesso Restrito</h2>
                <p className="text-gray-600 mt-2 max-w-md">
                    Este relatório financeiro detalhado contém informações sensíveis e é exclusivo para membros da <strong>Diretoria</strong>.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
                        Relatório Financeiro Geral
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 ml-4.5">Painel consolidado de contas a receber, a pagar, inadimplência e projeções.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchData} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500" data-testid="btn-refresh-report"><RefreshCw size={18} className={loading ? "animate-spin" : ""}/></button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm" data-testid="btn-print-report">
                        <Printer size={16}/> Imprimir / PDF
                    </button>
                </div>
            </div>

            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 no-print">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-1">Período:</span>
                    {([
                        { id: 'DIA', label: 'Dia' },
                        { id: 'SEMANA', label: 'Semana' },
                        { id: 'MES', label: 'Mês' },
                        { id: 'TRIMESTRE', label: 'Trimestre' },
                        { id: 'SEMESTRE', label: 'Semestre' },
                        { id: 'ANUAL', label: 'Anual' },
                        { id: 'TODOS', label: 'Todos' },
                    ] as { id: typeof viewPeriod; label: string }[]).map(p => (
                        <button
                            key={p.id}
                            onClick={() => setViewPeriod(p.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                viewPeriod === p.id
                                    ? 'bg-gray-900 text-white shadow-md'
                                    : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                            data-testid={`btn-period-${p.id.toLowerCase()}`}
                        >
                            {p.label}
                        </button>
                    ))}
                    <span className="text-[10px] font-bold text-gray-400 ml-2">{periodLabel}</span>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-red-600" size={32}/></div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Já Recebido</p>
                            <p className="text-lg font-black text-green-600 font-mono" data-testid="val-recebido">{formatCurrency(totalRecebido)}</p>
                            <p className="text-[9px] text-green-500 font-bold">{paidIncome.length} título(s)</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">A Receber</p>
                            <p className="text-lg font-black text-blue-600 font-mono" data-testid="val-a-receber">{formatCurrency(totalAReceber)}</p>
                            <p className="text-[9px] text-blue-500 font-bold">{aReceberFuture.length} título(s)</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Já Pago</p>
                            <p className="text-lg font-black text-red-600 font-mono" data-testid="val-pago">{formatCurrency(totalPago)}</p>
                            <p className="text-[9px] text-red-500 font-bold">{paidExpense.length} título(s)</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">A Pagar</p>
                            <p className="text-lg font-black text-orange-600 font-mono" data-testid="val-a-pagar">{formatCurrency(totalAPagar)}</p>
                            <p className="text-[9px] text-orange-500 font-bold">{aPagarFuture.length} título(s)</p>
                        </div>
                        <div className={`p-4 rounded-xl border-2 shadow-sm ${totalInadimplencia > 0 ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                            <p className="text-[9px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1"><AlertTriangle size={10}/> Inadimplência</p>
                            <p className={`text-lg font-black font-mono ${totalInadimplencia > 0 ? 'text-red-700' : 'text-green-600'}`} data-testid="val-inadimplencia">{formatCurrency(totalInadimplencia)}</p>
                            <p className="text-[9px] text-red-500 font-bold">{overdueIncome.length + overdueExpense.length} título(s) vencido(s)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <MonthlyBarChart 
                            data={chartReceberData} 
                            color="#2563eb" 
                            title="Previsão de Recebimentos por Mês" 
                            icon={<ArrowUpCircle size={14} className="text-blue-600"/>}
                        />
                        <MonthlyBarChart 
                            data={chartPagarData} 
                            color="#dc2626" 
                            title="Previsão de Pagamentos por Mês" 
                            icon={<ArrowDownCircle size={14} className="text-red-600"/>}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
                                <h4 className="text-xs font-black text-blue-800 uppercase flex items-center gap-2"><ArrowUpCircle size={14}/> Contas a Receber — Por Mês</h4>
                            </div>
                            <table className="w-full text-left">
                                <thead><tr className="text-[9px] font-black text-blue-700 uppercase bg-blue-50/50"><th className="px-4 py-2">Mês</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2 text-right">Qtd.</th></tr></thead>
                                <tbody>
                                    {receberByMonth.map((m, i) => (
                                        <tr key={i} className="border-t border-gray-100 hover:bg-blue-50/30"><td className="px-4 py-2 text-sm font-bold text-gray-700">{MONTH_NAMES[m.monthIdx]}/{m.year}</td><td className="px-4 py-2 text-sm font-mono text-blue-700 text-right">{formatCurrency(m.value)}</td><td className="px-4 py-2 text-sm text-gray-500 text-right">{m.count}</td></tr>
                                    ))}
                                    <tr className="bg-blue-50 border-t-2 border-blue-200"><td className="px-4 py-2 text-xs font-black text-blue-800 uppercase">Total Geral</td><td className="px-4 py-2 text-sm font-black font-mono text-blue-800 text-right">{formatCurrency(totalAReceber)}</td><td className="px-4 py-2 text-sm font-black text-blue-800 text-right">{aReceberFuture.length}</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-red-50 border-b border-red-200">
                                <h4 className="text-xs font-black text-red-800 uppercase flex items-center gap-2"><ArrowDownCircle size={14}/> Contas a Pagar — Por Mês</h4>
                            </div>
                            <table className="w-full text-left">
                                <thead><tr className="text-[9px] font-black text-red-700 uppercase bg-red-50/50"><th className="px-4 py-2">Mês</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2 text-right">Qtd.</th></tr></thead>
                                <tbody>
                                    {pagarByMonth.map((m, i) => (
                                        <tr key={i} className="border-t border-gray-100 hover:bg-red-50/30"><td className="px-4 py-2 text-sm font-bold text-gray-700">{MONTH_NAMES[m.monthIdx]}/{m.year}</td><td className="px-4 py-2 text-sm font-mono text-red-700 text-right">{formatCurrency(m.value)}</td><td className="px-4 py-2 text-sm text-gray-500 text-right">{m.count}</td></tr>
                                    ))}
                                    <tr className="bg-red-50 border-t-2 border-red-200"><td className="px-4 py-2 text-xs font-black text-red-800 uppercase">Total Geral</td><td className="px-4 py-2 text-sm font-black font-mono text-red-800 text-right">{formatCurrency(totalAPagar)}</td><td className="px-4 py-2 text-sm font-black text-red-800 text-right">{aPagarFuture.length}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
                                <h4 className="text-xs font-black text-blue-800 uppercase flex items-center gap-2"><Calendar size={14}/> Receber — Por Semana</h4>
                            </div>
                            <table className="w-full text-left">
                                <thead><tr className="text-[9px] font-black text-blue-700 uppercase bg-blue-50/50"><th className="px-4 py-2">Semana (Dom — Sáb)</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2 text-right">Qtd.</th></tr></thead>
                                <tbody>
                                    {receberByWeek.length === 0 ? (
                                        <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhum título a receber no período.</td></tr>
                                    ) : receberByWeek.map((w, i) => {
                                        const isCurrent = todayStr >= w.start && todayStr <= w.end;
                                        return (
                                            <tr key={i} className={`border-t border-gray-100 hover:bg-blue-50/30 ${isCurrent ? 'bg-blue-50/50' : ''}`}>
                                                <td className="px-4 py-2 text-xs font-bold text-gray-600 font-mono">{w.label}{isCurrent && <span className="ml-2 text-[8px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">ATUAL</span>}</td>
                                                <td className="px-4 py-2 text-sm font-mono text-blue-700 text-right">{formatCurrency(w.value)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-500 text-right">{w.count}</td>
                                            </tr>
                                        );
                                    })}
                                    {receberByWeek.length > 0 && (
                                        <tr className="bg-blue-50 border-t-2 border-blue-200"><td className="px-4 py-2 text-xs font-black text-blue-800 uppercase">Total</td><td className="px-4 py-2 text-sm font-black font-mono text-blue-800 text-right">{formatCurrency(receberByWeek.reduce((a, w) => a + w.value, 0))}</td><td className="px-4 py-2 text-sm font-black text-blue-800 text-right">{receberByWeek.reduce((a, w) => a + w.count, 0)}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-red-50 border-b border-red-200">
                                <h4 className="text-xs font-black text-red-800 uppercase flex items-center gap-2"><Calendar size={14}/> Pagar — Por Semana</h4>
                            </div>
                            <table className="w-full text-left">
                                <thead><tr className="text-[9px] font-black text-red-700 uppercase bg-red-50/50"><th className="px-4 py-2">Semana (Dom — Sáb)</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2 text-right">Qtd.</th></tr></thead>
                                <tbody>
                                    {pagarByWeek.length === 0 ? (
                                        <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhum título a pagar no período.</td></tr>
                                    ) : pagarByWeek.map((w, i) => {
                                        const isCurrent = todayStr >= w.start && todayStr <= w.end;
                                        return (
                                            <tr key={i} className={`border-t border-gray-100 hover:bg-red-50/30 ${isCurrent ? 'bg-red-50/50' : ''}`}>
                                                <td className="px-4 py-2 text-xs font-bold text-gray-600 font-mono">{w.label}{isCurrent && <span className="ml-2 text-[8px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded">ATUAL</span>}</td>
                                                <td className="px-4 py-2 text-sm font-mono text-red-700 text-right">{formatCurrency(w.value)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-500 text-right">{w.count}</td>
                                            </tr>
                                        );
                                    })}
                                    {pagarByWeek.length > 0 && (
                                        <tr className="bg-red-50 border-t-2 border-red-200"><td className="px-4 py-2 text-xs font-black text-red-800 uppercase">Total</td><td className="px-4 py-2 text-sm font-black font-mono text-red-800 text-right">{formatCurrency(pagarByWeek.reduce((a, w) => a + w.value, 0))}</td><td className="px-4 py-2 text-sm font-black text-red-800 text-right">{pagarByWeek.reduce((a, w) => a + w.count, 0)}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {(overdueIncome.length > 0 || overdueExpense.length > 0) && (
                        <div className="bg-white rounded-xl border-2 border-red-300 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-red-100 border-b border-red-300 flex justify-between items-center">
                                <h4 className="text-xs font-black text-red-800 uppercase flex items-center gap-2"><AlertTriangle size={14}/> Inadimplência — Títulos Vencidos</h4>
                                <span className="text-[10px] font-bold text-red-600 bg-red-200 px-2 py-0.5 rounded-full">{overdueIncome.length + overdueExpense.length} título(s)</span>
                            </div>

                            {overdueByClient.map((group, gi) => {
                                const sortedItems = [...group.items].sort((a, b) => a.due_date.localeCompare(b.due_date));
                                return (
                                    <div key={gi} className="border-b border-red-200 last:border-b-0">
                                        <div className={`px-5 py-2.5 flex items-center justify-between ${group.type === 'INCOME' ? 'bg-orange-50' : 'bg-red-50/60'}`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${group.type === 'INCOME' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {group.type === 'INCOME' ? 'A RECEBER' : 'A PAGAR'}
                                                </span>
                                                <span className="text-sm font-black text-gray-800 uppercase">{group.client}</span>
                                                <span className="text-[10px] text-gray-400 font-bold">{group.count} título(s)</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[10px] font-bold text-red-600">{group.maxDays} dias</span>
                                                <span className="text-sm font-black font-mono text-red-700">{formatCurrency(group.value)}</span>
                                            </div>
                                        </div>
                                        <table className="w-full text-left">
                                            <thead><tr className="text-[8px] font-black text-gray-400 uppercase bg-gray-50/50"><th className="px-5 py-1.5 pl-10">Vencimento</th><th className="px-4 py-1.5">Descrição</th><th className="px-4 py-1.5">Categoria</th><th className="px-4 py-1.5 text-right">Dias</th><th className="px-4 py-1.5 text-right">Valor</th></tr></thead>
                                            <tbody>
                                                {sortedItems.map((item, ii) => {
                                                    const dueDateStr = item.due_date.split('T')[0];
                                                    const dueDate = new Date(dueDateStr + 'T12:00:00');
                                                    const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                                                    return (
                                                        <tr key={ii} className="border-t border-gray-100 hover:bg-red-50/30">
                                                            <td className="px-5 py-2 pl-10 text-xs font-mono text-gray-600">{dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                                                            <td className="px-4 py-2 text-xs font-bold text-gray-700 uppercase max-w-[300px] truncate">{item.description}</td>
                                                            <td className="px-4 py-2 text-[10px]"><span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-gray-500">{item.category_name || '-'}</span></td>
                                                            <td className="px-4 py-2 text-xs font-black text-red-600 text-right">{diffDays}</td>
                                                            <td className="px-4 py-2 text-xs font-bold font-mono text-red-700 text-right">{formatCurrency(item.amount)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}

                            <div className="px-5 py-3 bg-red-100 border-t-2 border-red-300 flex justify-between items-center">
                                <span className="text-xs font-black text-red-800 uppercase">Total Inadimplência</span>
                                <div className="flex items-center gap-6">
                                    <span className="text-xs font-bold text-red-700">{overdueByClient.length > 0 ? Math.max(...overdueByClient.map(c => c.maxDays)) : 0} dias (máx.)</span>
                                    <span className="text-sm font-black font-mono text-red-800">{formatCurrency(totalInadimplencia)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row justify-between items-center gap-3">
                            <h4 className="text-xs font-black text-gray-700 uppercase flex items-center gap-2"><FileText size={14}/> Todos os Lançamentos</h4>
                            <div className="flex gap-2 items-center no-print">
                                <div className="flex gap-1">
                                    {(['ALL','INCOME','EXPENSE'] as const).map(ft => (
                                        <button key={ft} onClick={() => setFilterType(ft)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${filterType === ft ? (ft === 'INCOME' ? 'bg-green-600 text-white' : ft === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white') : 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-50'}`} data-testid={`btn-filter-${ft.toLowerCase()}`}>
                                            {ft === 'ALL' ? 'Todos' : ft === 'INCOME' ? 'Receitas' : 'Despesas'}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative">
                                    <input type="text" placeholder="Buscar..." className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs w-48 focus:border-blue-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} data-testid="input-search-report"/>
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100 text-[9px] font-black text-gray-500 uppercase sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2">Vencimento</th>
                                        <th className="px-4 py-2">Descrição</th>
                                        <th className="px-4 py-2">Responsável</th>
                                        <th className="px-4 py-2">Categoria</th>
                                        <th className="px-4 py-2">Entidade</th>
                                        <th className="px-4 py-2">Status</th>
                                        <th className="px-4 py-2 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(() => {
                                        let list = periodFilteredTx;
                                        if (filterType !== 'ALL') list = list.filter(t => t.type === filterType);
                                        if (searchTerm.trim()) {
                                            const term = searchTerm.toLowerCase().trim();
                                            list = list.filter(t => t.description.toLowerCase().includes(term) || (t.entity_name || '').toLowerCase().includes(term) || (t.category_name || '').toLowerCase().includes(term));
                                        }
                                        if (list.length === 0) return <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-xs">Nenhum lançamento encontrado.</td></tr>;
                                        return list.slice(0, 200).map(item => {
                                            const isOverdue = item.status === 'PENDING' && item.due_date.split('T')[0] < todayStr;
                                            return (
                                                <tr key={item.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                                                    <td className="px-4 py-2 text-xs font-mono text-gray-600">{new Date(item.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                                                    <td className="px-4 py-2 text-xs font-bold text-gray-800 uppercase max-w-[250px] truncate">{item.description}</td>
                                                    <td className="px-4 py-2 text-[10px] text-gray-500 uppercase">{item.updated_by || item.created_by || 'SISTEMA'}</td>
                                                    <td className="px-4 py-2 text-[10px]"><span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{item.category_name || '-'}</span></td>
                                                    <td className="px-4 py-2 text-[10px] text-gray-600">{item.entity_name || '-'}</td>
                                                    <td className="px-4 py-2">
                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${item.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-200' : isOverdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                            {item.status === 'PAID' ? 'PAGO' : isOverdue ? 'VENCIDO' : 'PENDENTE'}
                                                        </span>
                                                    </td>
                                                    <td className={`px-4 py-2 text-right font-mono font-bold text-xs ${item.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                                        {item.type === 'INCOME' ? '+' : '-'} {formatCurrency(item.amount)}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FinancialReport;
