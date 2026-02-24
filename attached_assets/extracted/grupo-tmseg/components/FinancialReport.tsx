
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FinancialTransaction } from '../types';
import { 
    FileText, Calendar, DollarSign, Download, Printer, Filter, 
    ArrowUpCircle, ArrowDownCircle, ShieldAlert, Loader2, Search, TrendingUp, User 
} from 'lucide-react';

// Componente Interno de Gráfico SVG Simples
const DailyEvolutionChart: React.FC<{ data: { date: string; income: number; expense: number }[] }> = ({ data }) => {
    if (!data || data.length < 2) return (
        <div className="h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <TrendingUp size={32} className="mb-2 opacity-50"/>
            <p className="text-xs">Dados insuficientes para gerar o gráfico (mínimo 2 dias com movimento).</p>
        </div>
    );

    const height = 100;
    const width = 100;
    
    // Encontrar o valor máximo para escala
    const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 100); // Mínimo 100 para não quebrar escala
    
    // Helper para criar pontos
    const createPoints = (key: 'income' | 'expense') => {
        return data.map((d, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (d[key] / maxVal) * height; // Inverter Y pois SVG 0 é topo
            return `${x},${y}`;
        }).join(' ');
    };

    const incomePoints = createPoints('income');
    const expensePoints = createPoints('expense');

    return (
        <div className="w-full h-64 relative bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-hidden group">
            <div className="absolute top-4 left-4 z-10">
                <h3 className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
                    <TrendingUp size={16} className="text-blue-600"/> Evolução Diária
                </h3>
            </div>

            {/* Legenda */}
            <div className="absolute top-4 right-4 z-10 flex gap-4 text-[10px] font-bold uppercase">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Receitas</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Despesas</div>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                {/* Grid Lines (Horizontal) */}
                {[0, 25, 50, 75, 100].map(p => (
                    <line key={p} x1="0" y1={p} x2="100" y2={p} stroke="#f3f4f6" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                ))}

                {/* AREA INCOME */}
                <polygon points={`0,100 ${incomePoints} 100,100`} fill="rgba(34, 197, 94, 0.1)" />
                {/* LINE INCOME */}
                <polyline points={incomePoints} fill="none" stroke="#22c55e" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />

                {/* AREA EXPENSE */}
                <polygon points={`0,100 ${expensePoints} 100,100`} fill="rgba(239, 68, 68, 0.05)" />
                {/* LINE EXPENSE */}
                <polyline points={expensePoints} fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeDasharray="4" />

                {/* Hover Points (Interactive) - Simplified visual representation */}
                {data.map((d, i) => {
                    const x = (i / (data.length - 1)) * width;
                    return (
                        <g key={i} className="group/point">
                            {/* Invisible interactive rect */}
                            <rect x={x - 2} y="0" width="4" height="100" fill="transparent" className="cursor-pointer hover:fill-black/5" />
                            
                            {/* Tooltip on Hover */}
                            <foreignObject x={x < 50 ? x : x - 25} y="0" width="30" height="100" className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none">
                                <div className="bg-gray-900 text-white text-[8px] p-1 rounded mt-2 w-max shadow-xl z-50">
                                    <div className="font-bold border-b border-gray-700 mb-1 pb-1">{new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, {day:'2-digit', month:'2-digit'})}</div>
                                    <div className="text-green-400 font-mono">+ {d.income.toLocaleString('pt-BR', { notation: "compact" })}</div>
                                    <div className="text-red-400 font-mono">- {d.expense.toLocaleString('pt-BR', { notation: "compact" })}</div>
                                </div>
                            </foreignObject>
                        </g>
                    )
                })}
            </svg>
        </div>
    );
};

const FinancialReport: React.FC = () => {
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDirector, setIsDirector] = useState(false);
    
    // Filtros
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
                setIsDirector(true);
                fetchData();
            } else {
                setIsDirector(false);
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, [startDate, endDate]); // Recarrega ao mudar datas

    const fetchData = async () => {
        setLoading(true);
        try {
            // Busca ampla baseada nas datas
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .gte('due_date', `${startDate}T00:00:00`)
                .lte('due_date', `${endDate}T23:59:59`)
                .order('due_date', { ascending: false });

            if (error) throw error;
            setTransactions(data as FinancialTransaction[]);
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar dados do relatório.");
        } finally {
            setLoading(false);
        }
    };

    // Filtros de Memória (Texto e Tipo)
    const filteredData = useMemo(() => {
        return transactions.filter(t => {
            const matchesSearch = 
                t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.category_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.entity_name || '').toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesType = filterType === 'ALL' || t.type === filterType;

            return matchesSearch && matchesType;
        });
    }, [transactions, searchTerm, filterType]);

    // Totais
    const totals = useMemo(() => {
        const income = filteredData.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
        const expense = filteredData.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
        return {
            income,
            expense,
            balance: income - expense
        };
    }, [filteredData]);

    // Dados para o Gráfico (Agrupado por Data)
    const chartData = useMemo(() => {
        const grouped: Record<string, { income: number; expense: number }> = {};
        
        // Inicializar o range de datas seria ideal, mas para simplificar vamos usar as datas existentes nos dados
        // ordenadas crescentemente.
        
        filteredData.forEach(t => {
            const dateKey = t.due_date.split('T')[0]; // YYYY-MM-DD
            if (!grouped[dateKey]) grouped[dateKey] = { income: 0, expense: 0 };
            
            if (t.type === 'INCOME') grouped[dateKey].income += t.amount;
            else grouped[dateKey].expense += t.amount;
        });

        return Object.entries(grouped)
            .map(([date, vals]) => ({ date, ...vals }))
            .sort((a, b) => a.date.localeCompare(b.date)); // Ordem cronológica para o gráfico
    }, [filteredData]);

    const handlePrint = () => {
        window.print();
    };

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
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-border { border: 1px solid #ddd; }
                    body { background: white; }
                    .print-header { display: block !important; margin-bottom: 20px; text-align: center; }
                }
                .print-header { display: none; }
            `}</style>

            {/* Header de Impressão */}
            <div className="print-header">
                <h1 className="text-2xl font-bold uppercase">Relatório Financeiro Geral - TMSEG</h1>
                <p className="text-sm text-gray-500">Período: {new Date(startDate).toLocaleDateString()} a {new Date(endDate).toLocaleDateString()}</p>
            </div>

            {/* Controles (Não imprime) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center gap-4 no-print">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <FileText className="text-blue-700" /> Relatório Financeiro Geral
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Visão completa de todas as movimentações salvas.</p>
                </div>
                
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">De</label>
                        <input type="date" className="p-2 border rounded-lg text-sm bg-gray-50" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Até</label>
                        <input type="date" className="p-2 border rounded-lg text-sm bg-gray-50" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <button 
                        onClick={fetchData} 
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                        title="Atualizar Dados"
                    >
                        <Search size={20} />
                    </button>
                    <button 
                        onClick={handlePrint} 
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
                    >
                        <Printer size={16} /> Imprimir / PDF
                    </button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Receitas (Período)</p>
                        <h3 className="text-2xl font-black text-green-600">
                            R$ {totals.income.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </h3>
                    </div>
                    <div className="p-3 bg-green-50 rounded-full text-green-600"><ArrowUpCircle size={24}/></div>
                </div>
                
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Despesas (Período)</p>
                        <h3 className="text-2xl font-black text-red-600">
                            R$ {totals.expense.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </h3>
                    </div>
                    <div className="p-3 bg-red-50 rounded-full text-red-600"><ArrowDownCircle size={24}/></div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Resultado Líquido</p>
                        <h3 className={`text-2xl font-black ${totals.balance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                            R$ {totals.balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </h3>
                    </div>
                    <div className="p-3 bg-gray-100 rounded-full text-gray-600"><DollarSign size={24}/></div>
                </div>
            </div>

            {/* GRÁFICO DE EVOLUÇÃO DIÁRIA (NOVO) */}
            <div className="no-print animate-in fade-in slide-in-from-bottom-2">
                <DailyEvolutionChart data={chartData} />
            </div>

            {/* Filtros de Tabela e Tabela */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-4 justify-between items-center no-print">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setFilterType('ALL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${filterType === 'ALL' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                        >
                            Todos
                        </button>
                        <button 
                            onClick={() => setFilterType('INCOME')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${filterType === 'INCOME' ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-green-50'}`}
                        >
                            Receitas
                        </button>
                        <button 
                            onClick={() => setFilterType('EXPENSE')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${filterType === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-red-50'}`}
                        >
                            Despesas
                        </button>
                    </div>
                    <div className="relative w-full md:w-64">
                        <input 
                            type="text" 
                            placeholder="Filtrar lançamentos..." 
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-xs sticky top-0">
                            <tr>
                                <th className="p-4 border-b border-gray-200">Data Venc.</th>
                                <th className="p-4 border-b border-gray-200">Descrição</th>
                                <th className="p-4 border-b border-gray-200 text-blue-700">Responsável / Data</th>
                                <th className="p-4 border-b border-gray-200">Categoria</th>
                                <th className="p-4 border-b border-gray-200">Entidade / Vínculo</th>
                                <th className="p-4 border-b border-gray-200">Conta / Banco</th>
                                <th className="p-4 border-b border-gray-200">Status</th>
                                <th className="p-4 border-b border-gray-200 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={8} className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-600"/></td></tr>
                            ) : filteredData.length === 0 ? (
                                <tr><td colSpan={8} className="p-10 text-center text-gray-500">Nenhum registro encontrado para este período.</td></tr>
                            ) : (
                                filteredData.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 text-gray-600 font-mono text-xs">
                                            {new Date(item.due_date).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="p-4 font-medium text-gray-800">
                                            {item.description}
                                            {item.notes && <div className="text-[10px] text-gray-400 mt-0.5 italic">{item.notes}</div>}
                                        </td>
                                        
                                        {/* NOVA COLUNA DE RESPONSÁVEL / DATA */}
                                        <td className="p-4 border-b border-gray-200">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1">
                                                    <User size={10} className="text-gray-400" />
                                                    {item.updated_by || item.created_by || 'SISTEMA'}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                    {new Date(item.created_at).toLocaleDateString('pt-BR')} {new Date(item.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="p-4 text-xs text-gray-600">
                                            <span className="bg-gray-100 px-2 py-1 rounded border border-gray-200">
                                                {item.category_name || 'Sem Categoria'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs text-gray-600">
                                            {item.entity_name ? (
                                                <>
                                                    <span className="font-bold">{item.entity_name}</span>
                                                    <span className="text-[10px] text-gray-400 block">{item.entity_type}</span>
                                                </>
                                            ) : '-'}
                                        </td>
                                        <td className="p-4 text-xs text-gray-600">
                                            {item.account_name || '-'}
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${item.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                {item.status === 'PAID' ? 'PAGO' : 'PENDENTE'}
                                            </span>
                                        </td>
                                        <td className={`p-4 text-right font-mono font-bold ${item.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                            {item.type === 'INCOME' ? '+' : '-'} R$ {item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-300">
                            <tr>
                                <td colSpan={7} className="p-4 text-right text-gray-700 uppercase">Total do Relatório:</td>
                                <td className={`p-4 text-right font-mono ${totals.balance >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
                                    R$ {totals.balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default FinancialReport;
