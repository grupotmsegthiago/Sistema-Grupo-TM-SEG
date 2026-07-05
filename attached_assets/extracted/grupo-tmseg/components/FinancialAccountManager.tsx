
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FinancialAccount, FinancialCategory } from '../types';
import { Plus, Trash2, Landmark, Save, X, Loader2, Wallet, Pencil, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, AlertCircle, Zap, PencilLine, Calculator, History, Sparkles, BarChart } from 'lucide-react';

interface Props {
    onClose?: () => void;
}

interface HistoryPoint {
    day: number;
    date: string;
    value: number;
    yield: number;
    yieldPercent: number;
    isAdjustment: boolean;
    hasMovement: boolean;
}

interface EnrichedFinancialAccount extends FinancialAccount {
    current_calculated_balance: number;
    historyPoints?: number[]; 
}

const Sparkline: React.FC<{ data: number[]; width?: number; height?: number }> = ({ data, width = 120, height = 40 }) => {
    if (!data || data.length < 2) return <div style={{ width, height }} className="flex items-center justify-center text-[10px] text-gray-300 bg-gray-50 rounded">Sem dados</div>;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 10) - 5; 
        return `${x},${y}`;
    }).join(' ');
    const isGrowth = data[data.length - 1] >= data[0];
    const color = isGrowth ? '#22c55e' : '#ef4444'; 
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={width} cy={height - ((data[data.length - 1] - min) / range) * (height - 10) - 5} r="3" fill={color} />
        </svg>
    );
};

const FinancialAccountManager: React.FC<Props> = ({ onClose }) => {
    const [accounts, setAccounts] = useState<EnrichedFinancialAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [formData, setFormData] = useState({ name: '', initial_balance: '', bank_name: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(null);
    const [newBalanceInput, setNewBalanceInput] = useState<string>('');
    const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);

    const [categories, setCategories] = useState<FinancialCategory[]>([]);
    const [viewHistoryId, setViewHistoryId] = useState<string | null>(null);
    const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        fetchAccounts();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        const { data } = await supabase.from('financial_categories').select('*');
        if (data) setCategories(data as any);
    };

    const fetchAccounts = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const { data: accData } = await supabase.from('financial_accounts').select('*').order('name');
            const { data: transData } = await supabase.from('financial_transactions').select('*').eq('status', 'PAID');

            const enriched: EnrichedFinancialAccount[] = (accData || []).map((acc: any) => {
                const accTrans = (transData || []).filter((t: any) => t.account_id === acc.id);
                let currentVal = acc.initial_balance;
                const points = [currentVal];

                accTrans.forEach((t: any) => {
                    if (t.type === 'INCOME') currentVal += t.amount;
                    else currentVal -= t.amount;
                    points.push(currentVal);
                });

                return { ...acc, current_calculated_balance: currentVal, historyPoints: points };
            });

            setAccounts(enriched);
        } catch (e) { console.error(e); } finally { if (!silent) setIsLoading(false); }
    };

    const fetchAccountHistory = async (accountId: string) => {
        setHistoryLoading(true);
        try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const { data: accData } = await supabase.from('financial_accounts').select('initial_balance').eq('id', accountId).single();
            // Busca TODAS as transações passadas para compor o saldo inicial do mês
            const { data: transactions } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('account_id', accountId)
                .eq('status', 'PAID')
                .order('payment_date', { ascending: true });

            let runningBalance = accData?.initial_balance || 0;
            const fullHistory: HistoryPoint[] = [];

            // 1. Calcula saldo até o início do mês atual
            const startOfMonth = new Date(currentYear, currentMonth, 1);
            
            const monthPoints: Record<number, { value: number, yield: number, isAdj: boolean, hasMovement: boolean }> = {};
            
            // Inicializa os 31 dias
            for(let d=1; d<=31; d++) {
                monthPoints[d] = { value: 0, yield: 0, isAdj: false, hasMovement: false };
            }

            if (transactions) {
                transactions.forEach(t => {
                    const tDate = new Date(t.payment_date || t.due_date);
                    const prevBal = runningBalance;
                    
                    if (t.type === 'INCOME') runningBalance += t.amount;
                    else runningBalance -= t.amount;

                    // Se a transação for do mês atual, marca o dia
                    if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                        const day = tDate.getDate();
                        const isAdj = (t.notes || '').includes('Conciliação') || (t.category_name || '').includes('Ajuste');
                        
                        monthPoints[day] = {
                            value: runningBalance,
                            yield: (monthPoints[day].yield || 0) + (t.type === 'INCOME' ? t.amount : -t.amount),
                            isAdj: monthPoints[day].isAdj || isAdj,
                            hasMovement: true
                        };
                    }
                });
            }

            // 2. Preenche as lacunas (dias sem movimento mantêm o saldo do dia anterior)
            let lastKnownBalance = runningBalance; 
            // Precisamos descobrir o saldo EXATO no dia 1 (antes de qualquer transação do dia 1)
            // Para simplificar, vamos iterar do dia 1 ao 31 reconstruindo a linha do tempo do mês
            
            // Primeiro: Descobrir saldo em 01/Mês
            let balanceAtStartOfMonth = accData?.initial_balance || 0;
            if (transactions) {
                transactions.forEach(t => {
                    const tDate = new Date(t.payment_date || t.due_date);
                    if (tDate < startOfMonth) {
                        if (t.type === 'INCOME') balanceAtStartOfMonth += t.amount;
                        else balanceAtStartOfMonth -= t.amount;
                    }
                });
            }

            let currentRefBalance = balanceAtStartOfMonth;
            for (let d = 1; d <= 31; d++) {
                const dayData = monthPoints[d];
                if (dayData.hasMovement) {
                    currentRefBalance = dayData.value;
                }
                
                fullHistory.push({
                    day: d,
                    date: `${d}/${currentMonth + 1}`,
                    value: currentRefBalance,
                    yield: dayData.yield,
                    yieldPercent: (currentRefBalance - dayData.yield) > 0 ? (dayData.yield / (currentRefBalance - dayData.yield)) * 100 : 0,
                    isAdjustment: dayData.isAdj,
                    hasMovement: dayData.hasMovement
                });
            }

            setHistoryData(fullHistory);
        } catch (e) { 
            console.error(e); 
        } finally { 
            setHistoryLoading(false); 
        }
    };

    const handleUpdateBalance = async (e: React.FormEvent) => {
        e.preventDefault();
        const account = accounts.find(a => a.id === updatingAccountId);
        if (!account) return;

        const newBal = parseFloat(newBalanceInput);
        const diff = newBal - account.current_calculated_balance;
        if (Math.abs(diff) < 0.01) return setUpdatingAccountId(null);

        setIsProcessingUpdate(true);
        try {
            const isGain = diff > 0;
            const cat = categories.find(c => c.group === 'NAO_OPERACIONAL' || c.name.includes('Ajuste'));

            await supabase.from('financial_transactions').insert([{
                description: isGain ? 'Rendimento Automático (Ajuste)' : 'Desvalorização/Ajuste (Perda)',
                amount: Math.abs(diff),
                type: isGain ? 'INCOME' : 'EXPENSE',
                status: 'PAID',
                due_date: new Date().toISOString(),
                payment_date: new Date().toISOString(),
                category_id: cat?.id || null,
                category_name: cat?.name || 'AJUSTE DE SALDO',
                account_id: account.id,
                account_name: account.name,
                notes: 'Ajuste Automático de Saldo Real (Conciliação)',
                created_by: JSON.parse(localStorage.getItem('userData') || '{}').name
            }]);

            setUpdatingAccountId(null);
            fetchAccounts();
            alert("Saldo sincronizado com sucesso!");
        } catch (e: any) { alert(e.message); } finally { setIsProcessingUpdate(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir conta bancária?")) return;
        try {
            const { error } = await supabase.from('financial_accounts').delete().eq('id', id);
            if (error) throw error;
            fetchAccounts();
        } catch (e: any) { alert("Erro ao excluir: " + e.message); }
    };

    const handleCancelEdit = () => { setEditingId(null); setFormData({ name: '', initial_balance: '', bank_name: '' }); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const val = parseFloat(formData.initial_balance);
            if (editingId) await supabase.from('financial_accounts').update({ name: formData.name, initial_balance: val, bank_name: formData.bank_name }).eq('id', editingId);
            else await supabase.from('financial_accounts').insert([{ name: formData.name, initial_balance: val, bank_name: formData.bank_name, status: 'Ativo' }]);
            handleCancelEdit();
            fetchAccounts();
        } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
    };

    const maxHistoryValue = useMemo(() => {
        return Math.max(...historyData.map(h => h.value), 1);
    }, [historyData]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative min-h-[400px]">
            {/* MODAL HISTÓRICO */}
            {viewHistoryId && (
                <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md rounded-xl flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gray-900 text-white rounded-2xl"><TrendingUp size={24}/></div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight">Evolução Patrimonial Diária</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Performance consolidada do mês atual</p>
                            </div>
                        </div>
                        <button onClick={() => setViewHistoryId(null)} className="p-2 hover:bg-gray-100 rounded-full border border-gray-200 shadow-sm"><X size={24}/></button>
                    </div>

                    {historyLoading ? (
                        <div className="flex-1 flex items-center justify-center"><Loader2 size={40} className="animate-spin text-blue-600"/></div>
                    ) : (
                        <div className="space-y-8">
                            {/* GRÁFICO DE BARRAS 1-31 */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <div className="h-48 flex items-end gap-1 px-2">
                                    {historyData.map((point, idx) => (
                                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                                            {/* Tooltip */}
                                            <div className="absolute bottom-full mb-2 bg-gray-900 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                                Dia {point.day}: R$ {point.value.toLocaleString('pt-BR')}
                                            </div>
                                            
                                            <div 
                                                className={`w-full rounded-t-sm transition-all duration-500 cursor-help ${point.hasMovement ? 'bg-indigo-600 group-hover:bg-indigo-400' : 'bg-gray-100 group-hover:bg-gray-200'}`}
                                                style={{ height: `${(point.value / maxHistoryValue) * 100}%`, minHeight: '2px' }}
                                            ></div>
                                            <span className={`text-[8px] font-black mt-2 ${point.day % 5 === 0 || point.day === 1 || point.day === 31 ? 'text-gray-400' : 'text-transparent'}`}>{point.day}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between mt-2 px-1 text-[9px] text-gray-300 font-bold uppercase tracking-widest border-t border-gray-50 pt-2">
                                    <span>Início do Mês</span>
                                    <span>Ciclo Diário (1 a 31)</span>
                                    <span>Fechamento</span>
                                </div>
                            </div>

                            <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
                                <table className="w-full text-left text-[10px] uppercase font-bold">
                                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-400 tracking-widest">
                                        <tr>
                                            <th className="p-4">Dia/Data</th>
                                            <th className="p-4">Saldo Final do Dia</th>
                                            <th className="p-4">Variação Líquida</th>
                                            <th className="p-4 text-right">Status Mov.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {[...historyData].reverse().map((point, idx) => (
                                            <tr key={idx} className={`hover:bg-gray-50 transition-colors ${point.hasMovement ? 'bg-blue-50/20' : 'opacity-60'}`}>
                                                <td className="p-4 text-gray-500">
                                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 mr-2">DIA {point.day.toString().padStart(2, '0')}</span>
                                                    {point.date}
                                                </td>
                                                <td className="p-4 font-mono text-blue-700 font-black">R$ {point.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                <td className={`p-4 font-mono ${point.yield > 0 ? 'text-green-600' : point.yield < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                                    {point.yield > 0 ? '+' : ''}{point.yield !== 0 ? point.yield.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}
                                                </td>
                                                <td className="p-4 text-right">
                                                    {point.hasMovement ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[8px]">MOVIMENTADO</span>
                                                    ) : (
                                                        <span className="text-gray-300">ESTÁVEL</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL CONCILIAÇÃO */}
            {updatingAccountId && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200">
                        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest"><RefreshCw size={16} className="text-blue-600" /> Sincronizar Saldo Real</h3>
                            <button onClick={() => setUpdatingAccountId(null)}><X size={18} className="text-gray-400"/></button>
                        </div>
                        <form onSubmit={handleUpdateBalance} className="p-6 space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
                                <div><p className="text-[10px] font-bold text-blue-600 uppercase">Saldo no Sistema</p><p className="text-lg font-black text-blue-900">R$ {accounts.find(a => a.id === updatingAccountId)?.current_calculated_balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
                                <Calculator size={20} className="text-blue-600"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Informe o Saldo Real no Aplicativo do Banco</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">R$</span>
                                    <input type="number" step="0.01" required autoFocus className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-gray-900 focus:border-blue-500 outline-none" placeholder="0.00" value={newBalanceInput} onChange={e => setNewBalanceInput(e.target.value)} />
                                </div>
                            </div>
                            <button type="submit" disabled={isProcessingUpdate} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg">{isProcessingUpdate ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />} Atualizar Saldo</button>
                        </form>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Landmark className="text-blue-600" /> Instituições e Contas Bancárias</h3>
                {onClose && <button onClick={onClose}><X size={20} /></button>}
            </div>

            <form onSubmit={handleSubmit} className={`p-4 rounded-lg border mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="md:col-span-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Identificação</label><input type="text" required className="w-full p-2 border rounded text-sm bg-white" placeholder="Ex: Itaú Empresa" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                <div className="md:col-span-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Banco</label><input type="text" className="w-full p-2 border rounded text-sm bg-white" placeholder="Ex: Banco Itaú" value={formData.bank_name} onChange={e => setFormData({...formData, bank_name: e.target.value})} /></div>
                <div className="md:col-span-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Saldo de Início</label><input type="number" step="0.01" required className="w-full p-2 border rounded text-sm font-mono font-bold text-blue-700 bg-white" placeholder="0.00" value={formData.initial_balance} onChange={e => setFormData({...formData, initial_balance: e.target.value})} /></div>
                <div className="flex gap-2">
                    <button type="submit" disabled={isSaving} className={`flex-1 text-white p-2 rounded hover:opacity-90 font-bold text-sm flex items-center justify-center gap-2 h-[38px] ${editingId ? 'bg-amber-600' : 'bg-blue-600'}`}>
                        {isSaving ? <Loader2 size={16} className="animate-spin"/> : (editingId ? <Save size={16}/> : <Plus size={16}/>)} 
                        {editingId ? 'Salvar' : 'Cadastrar'}
                    </button>
                    {editingId && <button type="button" onClick={handleCancelEdit} className="px-3 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 font-bold text-sm"><X size={16} /></button>}
                </div>
            </form>

            <div className="overflow-hidden border border-gray-200 rounded-lg">
                <table className="w-full text-left text-sm font-bold uppercase">
                    <thead className="bg-gray-100 text-gray-600 text-[10px] tracking-widest">
                        <tr><th className="p-3">Conta</th><th className="p-3">Saldo Sistema</th><th className="p-3 text-center">Tendência</th><th className="p-3 text-right">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading ? <tr><td colSpan={4} className="p-4 text-center text-gray-500">Carregando...</td></tr> : accounts.map(acc => (
                            <tr key={acc.id} className="hover:bg-gray-50 group">
                                <td className="p-3">
                                    <div className="flex items-center gap-2"><Wallet size={16} className="text-gray-400"/><div><p className="text-gray-800">{acc.name}</p><p className="text-[9px] text-gray-500">{acc.bank_name || '-'}</p></div></div>
                                </td>
                                <td className="p-3"><p className={`font-mono text-base font-black ${acc.current_calculated_balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>R$ {acc.current_calculated_balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></td>
                                <td className="p-3">{acc.historyPoints && <div className="flex justify-center"><Sparkline data={acc.historyPoints} width={70} height={25} /></div>}</td>
                                <td className="p-3 text-right">
                                    <div className="flex justify-end gap-2 transition-opacity">
                                        <button onClick={() => { setUpdatingAccountId(acc.id); setNewBalanceInput(acc.current_calculated_balance.toFixed(2)); }} className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1.5 shadow-sm" title="Sincronizar Saldo"><PencilLine size={14}/> Sincronizar</button>
                                        <button onClick={() => { setViewHistoryId(acc.id); fetchAccountHistory(acc.id); }} className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1.5 shadow-sm"><History size={14}/> Histórico</button>
                                        <button onClick={() => { setEditingId(acc.id); setFormData({ name: acc.name, initial_balance: acc.initial_balance.toString(), bank_name: acc.bank_name || '' }); }} className="text-gray-400 hover:text-blue-600 p-1.5 transition-colors"><Pencil size={16}/></button>
                                        <button onClick={() => handleDelete(acc.id)} className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FinancialAccountManager;
