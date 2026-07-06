
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { formatDateBR, formatDateTimeBR } from '../lib/dateUtils';
import { logAction } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { useNotification } from '../lib/NotificationContext';
import { FinancialAccount, FinancialCategory } from '../types';
import { Plus, Trash2, Landmark, Save, X, Loader2, Wallet, Pencil, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, AlertCircle, Zap, PencilLine, Calculator, History, Sparkles, BarChart, DollarSign, ArrowUpRight, ArrowDownRight, Calendar, Clock, Eye, ChevronDown, ChevronUp, Brain, LineChart as LineChartIcon } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart, Bar } from 'recharts';

interface Props {
    onClose?: () => void;
}

interface BalanceSnapshot {
    id: number;
    account_id: string;
    balance: number;
    notes: string;
    created_by: string;
    recorded_at: string;
}

interface EnrichedAccount extends FinancialAccount {
    current_calculated_balance: number;
    snapshots: BalanceSnapshot[];
    latestSnapshot?: BalanceSnapshot;
    previousSnapshot?: BalanceSnapshot;
    changeValue: number;
    changePercent: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    monthlyChange: number;
    monthlyChangePercent: number;
}

type ViewMode = 'dashboard' | 'account-detail';
type PeriodFilter = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const formatDate = (d: string) => formatDateBR(d);
const formatDateTime = (d: string) => formatDateTimeBR(d);

const FinancialAccountManager: React.FC<Props> = ({ onClose }) => {
    const { showNotification } = useNotification();
    const [accounts, setAccounts] = useState<EnrichedAccount[]>([]);
    const [allSnapshots, setAllSnapshots] = useState<BalanceSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [categories, setCategories] = useState<FinancialCategory[]>([]);

    const [formData, setFormData] = useState({ name: '', initial_balance: '', bank_name: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);

    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('90d');

    const [updateAccountId, setUpdateAccountId] = useState<string | null>(null);
    const [newBalanceInput, setNewBalanceInput] = useState('');
    const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);

    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [asaasBalances, setAsaasBalances] = useState<{ company: string; name: string; balance: number; pendingBalance: number; error?: string }[]>([]);
    const [asaasLoading, setAsaasLoading] = useState(false);

    const [dbReady, setDbReady] = useState(false);

    useEffect(() => {
        const init = async () => {
            await authFetch('/api/investment/init', { method: 'POST' });
            setDbReady(true);
        };
        init();
    }, []);

    const fetchAsaasBalances = useCallback(async () => {
        setAsaasLoading(true);
        try {
            const res = await authFetch('/api/asaas/balances');
            const data = await res.json();
            if (data.balances) setAsaasBalances(data.balances);
        } catch {}
        setAsaasLoading(false);
    }, []);

    useEffect(() => {
        if (dbReady) {
            fetchData();
            fetchAsaasBalances();
        }
    }, [dbReady, periodFilter]);

    useRealtimeRefresh(['financial_accounts', 'financial_categories', 'financial_transactions'], () => { if (dbReady) fetchData(); });

    const fetchSnapshotsSafe = async (days: number): Promise<BalanceSnapshot[]> => {
        try {
            const res = await authFetch(`/api/investment/snapshots-all?days=${days}&_t=${Date.now()}`);
            if (!res.ok) return [];
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                console.warn('[Investment] snapshots-all retornou conteúdo não-JSON — histórico ignorado');
                return [];
            }
            const data = await res.json();
            if (!Array.isArray(data)) return [];
            return data.map((s: any) => ({ ...s, balance: parseFloat(s.balance) }));
        } catch (e) {
            console.warn('[Investment] Falha ao carregar snapshots — histórico ignorado:', e);
            return [];
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const days = periodFilter === 'all' ? 3650 : parseInt(periodFilter);
            const [accRes, catRes, snapshots] = await Promise.all([
                supabase.from('financial_accounts').select('*').order('name'),
                supabase.from('financial_categories').select('*'),
                fetchSnapshotsSafe(days),
            ]);

            if (accRes.error) {
                showNotification('Erro', 'Não foi possível carregar contas: ' + accRes.error.message, 'error');
            }

            const accData = accRes.data || [];
            setCategories((catRes.data || []) as any);
            setAllSnapshots(snapshots);

            const now = Date.now();
            const weekAgo = now - 7 * 86400000;
            const monthAgo = now - 30 * 86400000;

            const enriched: EnrichedAccount[] = accData.map((acc: any) => {
                const accSnaps = snapshots.filter((s: BalanceSnapshot) => s.account_id === acc.id).sort((a: BalanceSnapshot, b: BalanceSnapshot) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

                const latestSnapshot = accSnaps.length > 0 ? accSnaps[accSnaps.length - 1] : null;
                const previousSnapshot = accSnaps.length > 1 ? accSnaps[accSnaps.length - 2] : null;
                const currentBalance = latestSnapshot ? latestSnapshot.balance : acc.initial_balance;

                const changeValue = previousSnapshot ? currentBalance - previousSnapshot.balance : 0;
                const changePercent = previousSnapshot && previousSnapshot.balance !== 0 ? (changeValue / previousSnapshot.balance) * 100 : 0;

                const weekSnap = accSnaps.filter((s: BalanceSnapshot) => new Date(s.recorded_at).getTime() <= weekAgo).pop();
                const weekRef = weekSnap ? weekSnap.balance : (accSnaps.length > 0 ? accSnaps[0].balance : acc.initial_balance);
                const weeklyChange = currentBalance - weekRef;
                const weeklyChangePercent = weekRef !== 0 ? (weeklyChange / weekRef) * 100 : 0;

                const monthSnap = accSnaps.filter((s: BalanceSnapshot) => new Date(s.recorded_at).getTime() <= monthAgo).pop();
                const monthRef = monthSnap ? monthSnap.balance : (accSnaps.length > 0 ? accSnaps[0].balance : acc.initial_balance);
                const monthlyChange = currentBalance - monthRef;
                const monthlyChangePercent = monthRef !== 0 ? (monthlyChange / monthRef) * 100 : 0;

                return {
                    ...acc,
                    current_calculated_balance: currentBalance,
                    snapshots: accSnaps,
                    latestSnapshot,
                    previousSnapshot,
                    changeValue,
                    changePercent,
                    weeklyChange,
                    weeklyChangePercent,
                    monthlyChange,
                    monthlyChangePercent,
                };
            });

            setAccounts(enriched);
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };

    const handleUpdateBalance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!updateAccountId) return;
        const newBal = parseFloat(newBalanceInput.replace(',', '.'));
        if (isNaN(newBal)) return;

        setIsProcessingUpdate(true);
        try {
            const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || '';
            await authFetch('/api/investment/snapshots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: updateAccountId, balance: newBal, notes: '', created_by: userName }),
            });

            const account = accounts.find(a => a.id === updateAccountId);
            if (account) {
                const diff = newBal - account.current_calculated_balance;
                if (Math.abs(diff) >= 0.01) {
                    const isGain = diff > 0;
                    // Preferir categoria do grupo INVESTIMENTOS pra que o ajuste de saldo
                    // não vaze para Contas a Pagar/Receber (filtro existente exclui INVESTIMENTOS).
                    // Fallback: NAO_OPERACIONAL/Ajuste — nesse caso o filtro de
                    // FinancialTransactionList ainda exclui via marcador no campo `notes`.
                    const cat = categories.find(c => c.group === 'INVESTIMENTOS')
                              || categories.find(c => c.group === 'NAO_OPERACIONAL' || c.name.includes('Ajuste'));
                    const adjRes = await supabase.from('financial_transactions').insert([{
                        description: isGain ? 'Rendimento de Investimento' : 'Desvalorização de Investimento',
                        amount: Math.abs(diff),
                        type: isGain ? 'INCOME' : 'EXPENSE',
                        status: 'PAID',
                        due_date: new Date().toISOString(),
                        payment_date: new Date().toISOString(),
                        category_id: cat?.id || null,
                        category_name: cat?.name || 'AJUSTE DE SALDO',
                        account_id: account.id,
                        account_name: account.name,
                        notes: `Atualização de saldo de investimento (${formatBRL(account.current_calculated_balance)} → ${formatBRL(newBal)})`,
                        created_by: userName,
                    }]);
                    if (adjRes.error) { showNotification('Erro', 'Saldo atualizado, mas falhou ao registrar lançamento de ajuste: ' + adjRes.error.message, 'error'); }
                }
            }

            setUpdateAccountId(null);
            setNewBalanceInput('');
            fetchData();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro desconhecido';
            showNotification('Erro', msg, 'error');
        } finally { setIsProcessingUpdate(false); }
    };

    const handleDeleteSnapshot = async (id: number) => {
        if (!confirm('Excluir este registro de saldo?')) return;
        await authFetch(`/api/investment/snapshots/${id}`, { method: 'DELETE' });
        fetchData();
    };

    const handleSubmitAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const val = parseFloat(formData.initial_balance);
            if (editingId) {
                const { error } = await supabase.from('financial_accounts').update({ name: formData.name, initial_balance: val, bank_name: formData.bank_name }).eq('id', editingId);
                if (error) { showNotification('Erro', 'Erro ao salvar conta: ' + error.message, 'error'); setIsSaving(false); return; }
            } else {
                const { error } = await supabase.from('financial_accounts').insert([{ name: formData.name, initial_balance: val, bank_name: formData.bank_name, status: 'Ativo' }]);
                if (error) { showNotification('Erro', 'Erro ao criar conta: ' + error.message, 'error'); setIsSaving(false); return; }
            }
            setEditingId(null);
            setShowForm(false);
            setFormData({ name: '', initial_balance: '', bank_name: '' });
            fetchData();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro desconhecido';
            showNotification('Erro', msg, 'error');
        } finally { setIsSaving(false); }
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('Excluir conta bancária e todo histórico?')) return;
        const acc = accounts.find(a => a.id === id);
        const delRes = await supabase.from('financial_accounts').delete().eq('id', id);
        if (delRes.error) { showNotification('Erro', 'Erro ao excluir conta: ' + delRes.error.message, 'error'); return; }
        await logAction('DELETE', 'FinancialAccount', id, `Conta bancária excluída: ${acc?.name || 'N/A'} — Banco: ${acc?.bank_name || 'N/A'}`);
        fetchData();
    };

    const runAIAnalysis = async () => {
        setIsAnalyzing(true);
        setAiAnalysis(null);
        try {
            const summaryData = accounts.map(a => ({
                conta: a.name,
                banco: a.bank_name,
                saldoInicial: a.initial_balance,
                saldoAtual: a.current_calculated_balance,
                variacaoSemana: `${formatPct(a.weeklyChangePercent)} (${formatBRL(a.weeklyChange)})`,
                variacaoMes: `${formatPct(a.monthlyChangePercent)} (${formatBRL(a.monthlyChange)})`,
                registros: a.snapshots.length,
                ultimosValores: a.snapshots.slice(-10).map(s => ({ data: formatDateTime(s.recorded_at), valor: s.balance })),
            }));

            const totalInvestido = accounts.reduce((s, a) => s + a.current_calculated_balance, 0);

            const prompt = `Você é um analista financeiro especializado em investimentos brasileiros. Analise os dados de investimento abaixo e forneça:

1. **Resumo Geral**: Total investido e distribuição
2. **Performance**: Quais contas estão com melhor e pior performance
3. **Tendências**: O que os dados mostram sobre a tendência de cada investimento
4. **Recomendações**: Sugestões de diversificação ou rebalanceamento
5. **Alerta de Riscos**: Se alguma conta apresenta sinais preocupantes
6. **Comparação com CDI**: Compare a rentabilidade com o CDI atual (~13.25% a.a. / ~1.04% a.m.)

Total investido: ${formatBRL(totalInvestido)}

Dados das contas:
${JSON.stringify(summaryData, null, 2)}

Responda de forma concisa e profissional, em português, formatado com markdown.`;

            const response = await authFetch('/api/chat', {
                method: 'POST',
                body: JSON.stringify({ message: prompt }),
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.text) fullText += parsed.text;
                            } catch { fullText += data; }
                        }
                    }
                    setAiAnalysis(fullText);
                }
            }
        } catch (e: any) {
            setAiAnalysis('Erro ao gerar análise: ' + e.message);
        } finally { setIsAnalyzing(false); }
    };

    const OPERATIONAL_ACCOUNTS = ['TM GESTÃO', 'TM SECURITY', 'TM SEGURANÇA'];
    const isInvestmentAccount = (a: EnrichedAccount) => !OPERATIONAL_ACCOUNTS.includes((a.name || '').toUpperCase().trim());

    const totalInvestido = useMemo(() => accounts.reduce((s, a) => s + a.current_calculated_balance, 0), [accounts]);
    const investmentAccounts = useMemo(() => accounts.filter(isInvestmentAccount), [accounts]);
    const totalInitial = useMemo(() => investmentAccounts.reduce((s, a) => s + a.initial_balance, 0), [investmentAccounts]);
    const totalInvestmentBalance = useMemo(() => investmentAccounts.reduce((s, a) => s + a.current_calculated_balance, 0), [investmentAccounts]);
    const totalChange = totalInvestmentBalance - totalInitial;
    const totalChangePct = totalInitial !== 0 ? (totalChange / totalInitial) * 100 : 0;

    const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

    const combinedChartData = useMemo(() => {
        if (accounts.length === 0) return [];
        const dateMap: Record<string, any> = {};

        accounts.forEach((acc) => {
            acc.snapshots.forEach((snap) => {
                const dateKey = formatDate(snap.recorded_at);
                if (!dateMap[dateKey]) dateMap[dateKey] = { date: dateKey, _ts: new Date(snap.recorded_at).getTime() };
                dateMap[dateKey][acc.name] = snap.balance;
            });
        });

        const sorted = Object.values(dateMap).sort((a: any, b: any) => a._ts - b._ts);
        let lastKnown: Record<string, number> = {};
        return sorted.map((point: any) => {
            accounts.forEach(acc => {
                if (point[acc.name] !== undefined) {
                    lastKnown[acc.name] = point[acc.name];
                } else if (lastKnown[acc.name] !== undefined) {
                    point[acc.name] = lastKnown[acc.name];
                }
            });
            let total = 0;
            accounts.forEach(acc => { if (point[acc.name]) total += point[acc.name]; });
            point['Total'] = total;
            return point;
        });
    }, [accounts]);

    const accountChartData = useMemo(() => {
        if (!selectedAccount) return [];
        return selectedAccount.snapshots.map(s => ({
            date: formatDateTime(s.recorded_at),
            dateShort: formatDate(s.recorded_at),
            saldo: s.balance,
            _ts: new Date(s.recorded_at).getTime(),
        }));
    }, [selectedAccount]);

    const accountEvolutionData = useMemo(() => {
        if (!selectedAccount || selectedAccount.snapshots.length < 2) return [];
        const snaps = selectedAccount.snapshots;
        return snaps.slice(1).map((s, i) => {
            const prev = snaps[i];
            const change = s.balance - prev.balance;
            const pct = prev.balance !== 0 ? (change / prev.balance) * 100 : 0;
            return {
                date: formatDate(s.recorded_at),
                dateTime: formatDateTime(s.recorded_at),
                valor: change,
                percentual: parseFloat(pct.toFixed(2)),
                saldo: s.balance,
            };
        });
    }, [selectedAccount]);

    const distributionData = useMemo(() => {
        return accounts.filter(a => a.current_calculated_balance > 0).map(a => ({
            name: a.name,
            value: a.current_calculated_balance,
        }));
    }, [accounts]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl border border-gray-700 text-xs">
                <p className="font-bold mb-1">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }}/>
                        {p.name}: {formatBRL(p.value)}
                    </p>
                ))}
            </div>
        );
    };

    if (isLoading && !accounts.length) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 min-h-[400px] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-blue-600" />
            </div>
        );
    }

    if (viewMode === 'account-detail' && selectedAccount) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative min-h-[400px] space-y-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setViewMode('dashboard'); setSelectedAccountId(null); setAiAnalysis(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">{selectedAccount.name}</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{selectedAccount.bank_name || 'Sem banco definido'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value as PeriodFilter)} className="text-xs font-bold border rounded-lg px-3 py-2 bg-gray-50 uppercase">
                            <option value="7d">7 Dias</option>
                            <option value="30d">30 Dias</option>
                            <option value="90d">90 Dias</option>
                            <option value="180d">6 Meses</option>
                            <option value="365d">1 Ano</option>
                            <option value="all">Tudo</option>
                        </select>
                        {onClose && <button onClick={onClose}><X size={20}/></button>}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-4 rounded-xl">
                        <p className="text-[10px] font-bold uppercase opacity-70">Saldo Atual</p>
                        <p className="text-xl font-black">{formatBRL(selectedAccount.current_calculated_balance)}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${selectedAccount.changeValue >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-[10px] font-bold uppercase text-gray-500">Última Variação</p>
                        <p className={`text-lg font-black ${selectedAccount.changeValue >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatBRL(selectedAccount.changeValue)}</p>
                        <p className={`text-xs font-bold ${selectedAccount.changeValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPct(selectedAccount.changePercent)}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${selectedAccount.weeklyChange >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
                        <p className="text-[10px] font-bold uppercase text-gray-500">Semana</p>
                        <p className={`text-lg font-black ${selectedAccount.weeklyChange >= 0 ? 'text-emerald-700' : 'text-orange-700'}`}>{formatBRL(selectedAccount.weeklyChange)}</p>
                        <p className={`text-xs font-bold ${selectedAccount.weeklyChange >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{formatPct(selectedAccount.weeklyChangePercent)}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${selectedAccount.monthlyChange >= 0 ? 'bg-teal-50 border-teal-200' : 'bg-rose-50 border-rose-200'}`}>
                        <p className="text-[10px] font-bold uppercase text-gray-500">Mês</p>
                        <p className={`text-lg font-black ${selectedAccount.monthlyChange >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>{formatBRL(selectedAccount.monthlyChange)}</p>
                        <p className={`text-xs font-bold ${selectedAccount.monthlyChange >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>{formatPct(selectedAccount.monthlyChangePercent)}</p>
                    </div>
                </div>

                {accountChartData.length >= 2 && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h4 className="text-xs font-black uppercase text-gray-600 mb-3 flex items-center gap-2"><TrendingUp size={14}/> Evolução do Saldo</h4>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={accountChartData}>
                                <defs>
                                    <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                                <XAxis dataKey="dateShort" tick={{ fontSize: 10, fill: '#6b7280' }}/>
                                <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#6b7280' }}/>
                                <Tooltip content={<CustomTooltip/>}/>
                                <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#3B82F6" fill="url(#colorSaldo)" strokeWidth={2.5} dot={{ r: 3, fill: '#3B82F6' }} activeDot={{ r: 5 }}/>
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {accountEvolutionData.length > 0 && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h4 className="text-xs font-black uppercase text-gray-600 mb-3 flex items-center gap-2"><BarChart size={14}/> Variação entre Registros (R$ e %)</h4>
                        <ResponsiveContainer width="100%" height={200}>
                            <ComposedChart data={accountEvolutionData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }}/>
                                <YAxis yAxisId="left" tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 9, fill: '#6b7280' }}/>
                                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9, fill: '#6b7280' }}/>
                                <Tooltip content={({ active, payload, label }: any) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                        <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
                                            <p className="font-bold mb-1">{label}</p>
                                            <p>Variação: {formatBRL(payload[0]?.value || 0)}</p>
                                            <p>Percentual: {formatPct(payload[1]?.value || 0)}</p>
                                        </div>
                                    );
                                }}/>
                                <Bar yAxisId="left" dataKey="valor" name="Variação R$" fill="#3B82F6" radius={[4, 4, 0, 0]}/>
                                <Line yAxisId="right" type="monotone" dataKey="percentual" name="%" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }}/>
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
                    <table className="w-full text-left text-[10px] uppercase font-bold">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-400 tracking-widest">
                            <tr>
                                <th className="p-3">Data/Hora</th>
                                <th className="p-3">Saldo Registrado</th>
                                <th className="p-3">Variação</th>
                                <th className="p-3">%</th>
                                <th className="p-3">Registrado por</th>
                                <th className="p-3 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {[...selectedAccount.snapshots].reverse().map((snap, idx, arr) => {
                                const prevSnap = idx < arr.length - 1 ? arr[idx + 1] : null;
                                const diff = prevSnap ? snap.balance - prevSnap.balance : 0;
                                const pct = prevSnap && prevSnap.balance !== 0 ? (diff / prevSnap.balance) * 100 : 0;
                                return (
                                    <tr key={snap.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-3 text-gray-600 flex items-center gap-1.5"><Clock size={12} className="text-gray-300"/>{formatDateTime(snap.recorded_at)}</td>
                                        <td className="p-3 font-mono text-blue-700 font-black text-sm">{formatBRL(snap.balance)}</td>
                                        <td className={`p-3 font-mono ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                            {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatBRL(diff)}` : '-'}
                                        </td>
                                        <td className={`p-3 font-mono ${pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                            {pct !== 0 ? formatPct(pct) : '-'}
                                        </td>
                                        <td className="p-3 text-gray-500">{snap.created_by || '-'}</td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => handleDeleteSnapshot(snap.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {selectedAccount.snapshots.length === 0 && (
                                <tr><td colSpan={6} className="p-6 text-center text-gray-400">Nenhum registro de saldo ainda. Clique em "Atualizar Saldo" para começar.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative min-h-[400px] space-y-6">
            {updateAccountId && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200">
                        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest"><DollarSign size={16} className="text-blue-600" /> Atualizar Saldo de Investimento</h3>
                            <button onClick={() => setUpdateAccountId(null)}><X size={18} className="text-gray-400"/></button>
                        </div>
                        <form onSubmit={handleUpdateBalance} className="p-6 space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="text-[10px] font-bold text-blue-600 uppercase">Conta</p>
                                <p className="font-black text-blue-900">{accounts.find(a => a.id === updateAccountId)?.name}</p>
                                <p className="text-[10px] font-bold text-blue-600 uppercase mt-2">Saldo Atual no Sistema</p>
                                <p className="text-lg font-black text-blue-900">{formatBRL(accounts.find(a => a.id === updateAccountId)?.current_calculated_balance || 0)}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Informe o Saldo Real do Investimento Hoje</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">R$</span>
                                    <input type="number" step="0.01" required autoFocus className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-gray-900 focus:border-blue-500 outline-none" placeholder="0.00" value={newBalanceInput} onChange={e => setNewBalanceInput(e.target.value)} />
                                </div>
                                <p className="text-[9px] text-gray-400 mt-1 flex items-center gap-1"><Clock size={10}/> Data e hora serão registradas automaticamente</p>
                            </div>
                            <button type="submit" disabled={isProcessingUpdate} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg">
                                {isProcessingUpdate ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />} Registrar Saldo
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-gray-800 flex items-center gap-3 uppercase tracking-tight">
                    <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl shadow-lg"><Landmark size={22}/></div>
                    Painel de Investimentos
                </h3>
                <div className="flex items-center gap-2">
                    <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value as PeriodFilter)} className="text-xs font-bold border rounded-lg px-3 py-2 bg-gray-50 uppercase">
                        <option value="7d">7 Dias</option>
                        <option value="30d">30 Dias</option>
                        <option value="90d">90 Dias</option>
                        <option value="180d">6 Meses</option>
                        <option value="365d">1 Ano</option>
                        <option value="all">Tudo</option>
                    </select>
                    <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-md">
                        <Plus size={14}/> Nova Conta
                    </button>
                    <button onClick={runAIAnalysis} disabled={isAnalyzing || accounts.length === 0} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-50">
                        {isAnalyzing ? <Loader2 size={14} className="animate-spin"/> : <Brain size={14}/>} Análise IA
                    </button>
                    {onClose && <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>}
                </div>
            </div>

            {showForm && (
                <form onSubmit={handleSubmitAccount} className={`p-4 rounded-xl border grid grid-cols-1 md:grid-cols-4 gap-4 items-end transition-colors animate-in slide-in-from-top-2 ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div><label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Identificação</label><input type="text" required className="w-full p-2.5 border rounded-lg text-sm bg-white" placeholder="Ex: Itaú Investimento" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                    <div><label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Banco / Corretora</label><input type="text" className="w-full p-2.5 border rounded-lg text-sm bg-white" placeholder="Ex: BTG Pactual" value={formData.bank_name} onChange={e => setFormData({...formData, bank_name: e.target.value})} /></div>
                    <div><label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Saldo Inicial</label><input type="number" step="0.01" required className="w-full p-2.5 border rounded-lg text-sm font-mono font-bold text-blue-700 bg-white" placeholder="0.00" value={formData.initial_balance} onChange={e => setFormData({...formData, initial_balance: e.target.value})} /></div>
                    <div className="flex gap-2">
                        <button type="submit" disabled={isSaving} className={`flex-1 text-white p-2.5 rounded-lg hover:opacity-90 font-bold text-sm flex items-center justify-center gap-2 ${editingId ? 'bg-amber-600' : 'bg-blue-600'}`}>
                            {isSaving ? <Loader2 size={16} className="animate-spin"/> : (editingId ? <Save size={16}/> : <Plus size={16}/>)} 
                            {editingId ? 'Salvar' : 'Cadastrar'}
                        </button>
                        <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setFormData({ name: '', initial_balance: '', bank_name: '' }); }} className="px-3 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 font-bold text-sm"><X size={16}/></button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-4 rounded-xl shadow-lg">
                    <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest">Patrimônio Total</p>
                    <p className="text-2xl font-black mt-1">{formatBRL(totalInvestido)}</p>
                    <p className="text-[10px] mt-1 opacity-60">{accounts.length} conta(s) ativa(s)</p>
                </div>
                <div className={`p-4 rounded-xl border shadow-sm ${totalChange >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Rentabilidade Total</p>
                    <p className={`text-xl font-black mt-1 ${totalChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatBRL(totalChange)}</p>
                    <p className={`text-xs font-bold ${totalChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPct(totalChangePct)} desde o início</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Maior Posição</p>
                    {accounts.length > 0 ? (() => {
                        const top = [...accounts].sort((a, b) => b.current_calculated_balance - a.current_calculated_balance)[0];
                        return (<><p className="text-lg font-black text-blue-700 mt-1">{formatBRL(top.current_calculated_balance)}</p><p className="text-[10px] text-blue-600 font-bold truncate">{top.name}</p></>);
                    })() : <p className="text-gray-400 mt-1">-</p>}
                </div>
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Melhor Performance Mês</p>
                    {investmentAccounts.filter(a => a.snapshots.length > 0).length > 0 ? (() => {
                        const best = [...investmentAccounts].filter(a => a.snapshots.length > 0).sort((a, b) => b.monthlyChangePercent - a.monthlyChangePercent)[0];
                        return (<><p className={`text-lg font-black mt-1 ${best.monthlyChangePercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatPct(best.monthlyChangePercent)}</p><p className="text-[10px] text-purple-600 font-bold truncate">{best.name}</p></>);
                    })() : <p className="text-gray-400 mt-1">-</p>}
                </div>
            </div>

            {asaasBalances.length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-black uppercase text-green-800 flex items-center gap-2" data-testid="title-asaas-balances">
                            <DollarSign size={14}/> Saldo Asaas — Contas Operacionais
                        </h4>
                        <button onClick={fetchAsaasBalances} disabled={asaasLoading} className="text-[10px] font-bold text-green-600 hover:text-green-800 flex items-center gap-1" data-testid="btn-refresh-asaas">
                            {asaasLoading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} Atualizar
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {asaasBalances.map(b => (
                            <div key={b.company} className="bg-white rounded-lg p-3 border border-green-100 shadow-sm" data-testid={`asaas-balance-${b.company}`}>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{b.company}</p>
                                {b.error ? (
                                    <p className="text-xs text-red-500 mt-1">{b.error}</p>
                                ) : (
                                    <>
                                        <p className={`text-lg font-black mt-1 ${b.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(b.balance)}</p>
                                        {b.pendingBalance > 0 && (
                                            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Pendente: {formatBRL(b.pendingBalance)}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 text-right">
                        Total disponível: <span className="font-black text-green-700">{formatBRL(asaasBalances.reduce((s, b) => s + (b.error ? 0 : b.balance), 0))}</span>
                        {asaasBalances.some(b => b.pendingBalance > 0) && (
                            <> | Pendente total: <span className="font-bold text-amber-600">{formatBRL(asaasBalances.reduce((s, b) => s + (b.error ? 0 : b.pendingBalance), 0))}</span></>
                        )}
                    </p>
                </div>
            )}

            {combinedChartData.length >= 2 && (
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                    <h4 className="text-xs font-black uppercase text-gray-600 mb-4 flex items-center gap-2"><LineChartIcon size={14}/> Evolução Comparativa de Todos os Investimentos</h4>
                    <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={combinedChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }}/>
                            <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#6b7280' }}/>
                            <Tooltip content={<CustomTooltip/>}/>
                            <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}/>
                            {accounts.map((acc, i) => (
                                <Line key={acc.id} type="monotone" dataKey={acc.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls/>
                            ))}
                            <Line type="monotone" dataKey="Total" stroke="#111827" strokeWidth={3} strokeDasharray="5 5" dot={false} connectNulls/>
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {distributionData.length > 0 && (
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                        <h4 className="text-xs font-black uppercase text-gray-600 mb-3 flex items-center gap-2"><Wallet size={14}/> Distribuição do Patrimônio</h4>
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={distributionData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, percent }) => `${name.substring(0,15)} (${(percent*100).toFixed(0)}%)`} labelLine={false} style={{ fontSize: '9px', fontWeight: 'bold' }}>
                                    {distributionData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                                </Pie>
                                <Tooltip formatter={(v: number) => formatBRL(v)}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                    <h4 className="text-xs font-black uppercase text-gray-600 mb-3 flex items-center gap-2"><TrendingUp size={14}/> Performance Mensal por Conta</h4>
                    {accounts.filter(a => a.snapshots.length > 0).length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart layout="vertical" data={accounts.filter(a => a.snapshots.length > 0).map(a => ({ name: a.name.substring(0, 20), pct: parseFloat(a.monthlyChangePercent.toFixed(2)), valor: a.monthlyChange })).sort((a, b) => b.pct - a.pct)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#6b7280' }}/>
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} width={120}/>
                                <Tooltip content={({ active, payload }: any) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                        <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
                                            <p className="font-bold">{payload[0]?.payload?.name}</p>
                                            <p>Variação: {formatPct(payload[0]?.value || 0)}</p>
                                            <p>Valor: {formatBRL(payload[0]?.payload?.valor || 0)}</p>
                                        </div>
                                    );
                                }}/>
                                <Bar dataKey="pct" name="% Mês" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                                    {accounts.filter(a => a.snapshots.length > 0).map((_, i) => <Cell key={i} fill={accounts[i]?.monthlyChangePercent >= 0 ? '#10B981' : '#EF4444'}/>)}
                                </Bar>
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-gray-400 text-xs">Registre saldos para ver a performance</div>
                    )}
                </div>
            </div>

            <div className="overflow-hidden border border-gray-200 rounded-xl">
                <table className="w-full text-left text-sm font-bold uppercase">
                    <thead className="bg-gray-100 text-gray-500 text-[10px] tracking-widest">
                        <tr>
                            <th className="p-3">Conta / Investimento</th>
                            <th className="p-3">Saldo Atual</th>
                            <th className="p-3 text-center">Semana</th>
                            <th className="p-3 text-center">Mês</th>
                            <th className="p-3 text-center">Último Registro</th>
                            <th className="p-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {accounts.map(acc => (
                            <tr key={acc.id} className="hover:bg-blue-50/50 group transition-colors cursor-pointer" onClick={() => { setSelectedAccountId(acc.id); setViewMode('account-detail'); }}>
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-8 rounded-full" style={{ background: COLORS[accounts.indexOf(acc) % COLORS.length] }}/>
                                        <div>
                                            <p className="text-gray-800 text-xs">{acc.name}</p>
                                            <p className="text-[9px] text-gray-400 normal-case">{acc.bank_name || '-'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-3">
                                    <p className={`font-mono text-sm font-black ${acc.current_calculated_balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>{formatBRL(acc.current_calculated_balance)}</p>
                                </td>
                                <td className="p-3 text-center">
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${acc.weeklyChange > 0 ? 'bg-green-50 text-green-700' : acc.weeklyChange < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-400'}`}>
                                        {acc.weeklyChange > 0 ? <ArrowUpRight size={10}/> : acc.weeklyChange < 0 ? <ArrowDownRight size={10}/> : null}
                                        {acc.weeklyChange !== 0 ? formatPct(acc.weeklyChangePercent) : '-'}
                                    </div>
                                </td>
                                <td className="p-3 text-center">
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${acc.monthlyChange > 0 ? 'bg-green-50 text-green-700' : acc.monthlyChange < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-400'}`}>
                                        {acc.monthlyChange > 0 ? <ArrowUpRight size={10}/> : acc.monthlyChange < 0 ? <ArrowDownRight size={10}/> : null}
                                        {acc.monthlyChange !== 0 ? formatPct(acc.monthlyChangePercent) : '-'}
                                    </div>
                                </td>
                                <td className="p-3 text-center">
                                    <span className="text-[10px] text-gray-400">{acc.latestSnapshot ? formatDateTime(acc.latestSnapshot.recorded_at) : 'Sem registro'}</span>
                                </td>
                                <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1.5">
                                        <button onClick={() => { setUpdateAccountId(acc.id); setNewBalanceInput(acc.current_calculated_balance.toFixed(2)); }} className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm" title="Atualizar Saldo">
                                            <DollarSign size={12}/> Atualizar
                                        </button>
                                        <button onClick={() => { setSelectedAccountId(acc.id); setViewMode('account-detail'); }} className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm">
                                            <Eye size={12}/> Detalhe
                                        </button>
                                        <button onClick={() => { setEditingId(acc.id); setFormData({ name: acc.name, initial_balance: acc.initial_balance.toString(), bank_name: acc.bank_name || '' }); setShowForm(true); }} className="text-gray-300 hover:text-blue-600 p-1 transition-colors">
                                            <Pencil size={14}/>
                                        </button>
                                        <button onClick={() => handleDeleteAccount(acc.id)} className="text-gray-300 hover:text-red-500 p-1 transition-colors">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {accounts.length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400 text-xs">Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.</td></tr>
                        )}
                    </tbody>
                    {accounts.length > 0 && (
                        <tfoot className="border-t-2 border-gray-200">
                            <tr className="bg-gray-50">
                                <td className="p-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total Geral</p>
                                </td>
                                <td className="p-3">
                                    <p className={`font-mono text-base font-black ${totalInvestido < 0 ? 'text-red-600' : 'text-blue-800'}`} data-testid="text-total-geral">{formatBRL(totalInvestido)}</p>
                                </td>
                                <td colSpan={4}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {aiAnalysis && (
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-5 rounded-xl border border-purple-200 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black uppercase text-purple-700 flex items-center gap-2"><Brain size={14}/> Análise de Investimentos por IA</h4>
                        <button onClick={() => setAiAnalysis(null)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700 text-xs leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
                </div>
            )}
        </div>
    );
};

export default FinancialAccountManager;
