
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { formatDateBR } from '../lib/dateUtils';
import { FinancialCategory, FinancialTransaction } from '../types';
import { Calendar, FileText, Download, Loader2, Printer, TrendingUp, DollarSign, RefreshCw } from 'lucide-react';
import { isInternalGroupTransfer } from '../lib/financialInternalTransfer';
import { billableClientToll } from '../lib/toll/clientTollBilling';

const getTodayBR = (): string => {
    const now = new Date();
    const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const y = brDate.getFullYear();
    const m = String(brDate.getMonth() + 1).padStart(2, '0');
    const d = String(brDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getMonthStartBR = (): string => {
    const now = new Date();
    const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const y = brDate.getFullYear();
    const m = String(brDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
};

interface DRERow {
    label: string;
    value: number;
    type: 'header' | 'item' | 'total' | 'subtotal' | 'summary';
    indent: number;
    color?: string;
}

const FinancialDRE: React.FC = () => {
    const [startDate, setStartDate] = useState('2026-02-15');
    const [endDate, setEndDate] = useState(getTodayBR());
    const [report, setReport] = useState<DRERow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        generateDRE();
    }, []);

    useRealtimeRefresh(['financial_transactions', 'financial_categories', 'missions'], () => generateDRE());

    const fetchAllTransactions = async (start: string, end: string): Promise<FinancialTransaction[]> => {
        const all: FinancialTransaction[] = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('status', 'PAID')
                .gte('due_date', start)
                .lte('due_date', `${end}T23:59:59`)
                .range(from, from + PAGE - 1);
            if (error) { console.error(error); break; }
            if (!data || data.length === 0) break;
            all.push(...(data as FinancialTransaction[]));
            if (data.length < PAGE) break;
            from += PAGE;
        }
        return all;
    };

    const fetchAllMissions = async (start: string, end: string) => {
        const all: any[] = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('missions')
                .select('id, revenue_value, cost_value, toll_value, toll_value_provider, displacement_value, displacement_value_provider, status, end_time, billing_approved, is_same_os')
                .in('status', ['Concluída', 'Faturada'])
                .gte('end_time', `${start}T00:00:00`)
                .lte('end_time', `${end}T23:59:59`)
                .range(from, from + PAGE - 1);
            if (error) { console.error(error); break; }
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
        }
        return all;
    };

    const generateDRE = async () => {
        setLoading(true);
        try {
            const [transactions, missions] = await Promise.all([
                fetchAllTransactions(startDate, endDate),
                fetchAllMissions(startDate, endDate)
            ]);
            const { data: categoriesData } = await supabase.from('financial_categories').select('*');
            const categories = (categoriesData || []) as FinancialCategory[];

            const dreTransactions = transactions.filter(t => !isInternalGroupTransfer(t));
            const sumByCategory = (catId: string) => dreTransactions.filter(t => t.category_id === catId).reduce((acc, t) => acc + t.amount, 0);
            const sumByGroup = (group: string) => categories.filter(c => c.group === group).reduce((acc, cat) => acc + sumByCategory(cat.id), 0);

            const missionRevenue = missions.reduce((acc: number, m: any) => acc + (m.revenue_value || 0), 0);
            const missionTollClient = missions.reduce((acc: number, m: any) => acc + billableClientToll(m.toll_value || 0), 0);
            const missionDisplacementClient = missions.reduce((acc: number, m: any) => acc + (m.displacement_value || 0), 0);
            const missionCost = missions.filter((m: any) => m.is_same_os !== true).reduce((acc: number, m: any) => acc + (m.cost_value || 0), 0);
            const missionTollProvider = missions.reduce((acc: number, m: any) => acc + (m.toll_value_provider || m.toll_value || 0), 0);
            const missionDisplacementProvider = missions.reduce((acc: number, m: any) => acc + (m.displacement_value_provider || 0), 0);
            const totalMissionCount = missions.length;

            const rows: DRERow[] = [];

            const financialRevenue = sumByGroup('RECEITA_BRUTA');
            const grossRevenue = missionRevenue + missionTollClient + missionDisplacementClient + financialRevenue;
            const deductions = sumByGroup('DEDUCOES');
            const netRevenue = grossRevenue - deductions;

            const financialVariableCosts = sumByGroup('CUSTOS_VARIAVEIS');
            const variableCosts = missionCost + missionTollProvider + missionDisplacementProvider + financialVariableCosts;
            const grossProfit = netRevenue - variableCosts;
            const fixedExpenses = sumByGroup('DESPESAS_FIXAS');
            const operationalResult = grossProfit - fixedExpenses;
            
            const nonOperationalBalance = sumByGroup('NAO_OPERACIONAL');

            rows.push({ label: '(=) RECEITA OPERACIONAL BRUTA', value: grossRevenue, type: 'header', indent: 0, color: 'text-blue-700' });
            rows.push({ label: `(+) RECEITA DE MISSÕES (${totalMissionCount} OS)`, value: missionRevenue, type: 'item', indent: 1 });
            if (missionTollClient > 0) rows.push({ label: '(+) PEDÁGIO CLIENTE', value: missionTollClient, type: 'item', indent: 1 });
            if (missionDisplacementClient > 0) rows.push({ label: '(+) DESLOCAMENTO CLIENTE', value: missionDisplacementClient, type: 'item', indent: 1 });
            categories.filter(c => c.group === 'RECEITA_BRUTA').forEach(c => {
                const val = sumByCategory(c.id);
                if (val !== 0) rows.push({ label: `(+) ${c.name}`, value: val, type: 'item', indent: 1 });
            });

            rows.push({ label: '(-) DEDUÇÕES E IMPOSTOS', value: deductions, type: 'header', indent: 0, color: 'text-red-600' });
            categories.filter(c => c.group === 'DEDUCOES').forEach(c => {
                const val = sumByCategory(c.id);
                if (val !== 0) rows.push({ label: `(-) ${c.name}`, value: val, type: 'item', indent: 1 });
            });
            rows.push({ label: '(=) RECEITA OPERACIONAL LÍQUIDA', value: netRevenue, type: 'subtotal', indent: 0, color: 'text-gray-900 bg-gray-50' });

            rows.push({ label: '(-) CUSTOS VARIÁVEIS (MISSÕES)', value: variableCosts, type: 'header', indent: 0, color: 'text-red-600' });
            rows.push({ label: '(-) CUSTO FORNECEDORES (MISSÕES)', value: missionCost, type: 'item', indent: 1 });
            if (missionTollProvider > 0) rows.push({ label: '(-) PEDÁGIO FORNECEDOR', value: missionTollProvider, type: 'item', indent: 1 });
            if (missionDisplacementProvider > 0) rows.push({ label: '(-) DESLOCAMENTO FORNECEDOR', value: missionDisplacementProvider, type: 'item', indent: 1 });
            categories.filter(c => c.group === 'CUSTOS_VARIAVEIS').forEach(c => {
                const val = sumByCategory(c.id);
                if (val !== 0) rows.push({ label: `(-) ${c.name}`, value: val, type: 'item', indent: 1 });
            });

            rows.push({ label: '(=) MARGEM DE CONTRIBUIÇÃO (LUCRO BRUTO)', value: grossProfit, type: 'subtotal', indent: 0, color: 'text-gray-900 bg-gray-100' });

            rows.push({ label: '(-) DESPESAS OPERACIONAIS FIXAS', value: fixedExpenses, type: 'header', indent: 0, color: 'text-red-600' });
            categories.filter(c => c.group === 'DESPESAS_FIXAS').forEach(c => {
                const val = sumByCategory(c.id);
                if (val !== 0) rows.push({ label: `(-) ${c.name}`, value: val, type: 'item', indent: 1 });
            });

            rows.push({ label: '(=) RESULTADO OPERACIONAL (EBITDA)', value: operationalResult, type: 'subtotal', indent: 0, color: 'text-gray-900 font-black bg-blue-50/50 border-y-2 border-blue-100' });
            
            rows.push({ label: '(+/-) AJUSTES E RENDIMENTOS NÃO OPERACIONAIS', value: nonOperationalBalance, type: 'header', indent: 0, color: 'text-purple-600' });
            categories.filter(c => c.group === 'NAO_OPERACIONAL').forEach(c => {
                const val = sumByCategory(c.id);
                if (val !== 0) rows.push({ label: `(+/-) ${c.name}`, value: val, type: 'item', indent: 1 });
            });
            rows.push({ label: '(=) RESULTADO LÍQUIDO FINAL', value: operationalResult + nonOperationalBalance, type: 'total', indent: 0, color: (operationalResult + nonOperationalBalance) >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' });

            setReport(rows);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <FileText className="text-indigo-600" /> DRE Gerencial de Resultados
                    </h2>
                    <p className="text-sm text-gray-500 font-medium">Análise de Performance Operacional vs Lucro Final</p>
                </div>
                <div className="flex items-end gap-3">
                    <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="p-2 border rounded text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <input type="date" className="p-2 border rounded text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <button onClick={generateDRE} disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-md uppercase">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Atualizar
                    </button>
                    <button onClick={() => window.print()} className="p-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors shadow-md">
                        <Printer size={20} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-10">
                    <div className="flex justify-between items-start mb-10 pb-6 border-b-2 border-gray-900">
                        <img src="/logo.png" alt="TMSEG" className="h-12 object-contain" />
                        <div className="text-right">
                            <h1 className="text-2xl font-black text-gray-900 uppercase">Demonstrativo de Resultado</h1>
                            <p className="text-sm font-bold text-gray-500">{formatDateBR(startDate + 'T12:00:00')} a {formatDateBR(endDate + 'T12:00:00')}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {report.map((row, idx) => (
                            <div key={idx} className={`flex justify-between items-center py-2.5 px-4 rounded transition-all
                                    ${row.type === 'total' ? 'text-lg font-black border-t-4 border-gray-900 mt-6 py-5' : ''}
                                    ${row.type === 'subtotal' ? 'font-bold border-t border-gray-200 mt-3 uppercase text-xs' : ''}
                                    ${row.type === 'header' ? 'font-black mt-5 mb-1 text-[10px] tracking-widest' : ''}
                                    ${row.type === 'item' ? 'text-[11px] text-gray-600 hover:bg-gray-50 italic' : ''}
                                    ${row.color || ''}
                                `}
                                style={{ paddingLeft: `${row.indent * 24 + 16}px` }}
                            >
                                <span className="uppercase tracking-tight">{row.label}</span>
                                <span className="font-mono font-bold tracking-tighter">
                                    {row.value < 0 ? '-' : ''} R$ {Math.abs(row.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-gray-50 p-6 text-center text-[10px] text-gray-400 border-t border-gray-200 uppercase font-black tracking-[0.3em]">
                    Grupo TMSEG &copy; {new Date().getFullYear()} - Documento Interno de Gestão Financeira
                </div>
            </div>
            
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    .bg-white { box-shadow: none !important; }
                }
            `}</style>
        </div>
    );
};

export default FinancialDRE;
