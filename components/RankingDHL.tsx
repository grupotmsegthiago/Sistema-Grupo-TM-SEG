import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Calendar, RefreshCw, Loader2 } from 'lucide-react';

const VALOR_POR_OS = 10;

type Row = { name: string; count: number; value: number };

function formatBRL(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthLabel(year: number, month0: number) {
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${meses[month0]} / ${year}`;
}

function endOfMonthPlus40(year: number, month0: number) {
    const lastDay = new Date(year, month0 + 1, 0);
    const payment = new Date(lastDay.getTime() + 40 * 24 * 60 * 60 * 1000);
    return payment.toLocaleDateString('pt-BR');
}

export default function RankingDHL() {
    const now = new Date();
    const [year, setYear] = useState<number>(now.getFullYear());
    const [month, setMonth] = useState<number>(now.getMonth()); // 0-based
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const start = new Date(year, month, 1).toISOString();
            const end = new Date(year, month + 1, 1).toISOString();
            // 1) Logs de CRIAÇÃO de OS no período
            const { data: logs, error: logErr } = await supabase
                .from('system_logs')
                .select('entity_id, user_name')
                .eq('entity', 'Mission')
                .eq('action_type', 'CREATE')
                .gte('created_at', start)
                .lt('created_at', end);
            if (logErr) throw logErr;
            const ids = Array.from(new Set((logs || []).map(l => l.entity_id).filter(Boolean)));
            if (ids.length === 0) { setRows([]); setLoading(false); return; }
            // 2) Filtra apenas missões do cliente DHL
            const { data: ms, error: mErr } = await supabase
                .from('missions')
                .select('id, client')
                .in('id', ids)
                .ilike('client', '%DHL%');
            if (mErr) throw mErr;
            const dhlIds = new Set((ms || []).map((m: any) => m.id));
            // 3) Conta criações por usuário (apenas 1ª criação por OS — evita duplicidade)
            const seen = new Set<string>();
            const map = new Map<string, number>();
            for (const l of (logs || [])) {
                if (!dhlIds.has(l.entity_id)) continue;
                if (seen.has(l.entity_id)) continue;
                seen.add(l.entity_id);
                const raw = (l as any).user_name;
                if (!raw) continue;
                const name = String(raw).trim();
                if (!name) continue;
                const key = name.toUpperCase();
                map.set(key, (map.get(key) || 0) + 1);
            }
            const list: Row[] = Array.from(map.entries())
                .map(([name, count]) => ({ name, count, value: count * VALOR_POR_OS }))
                .sort((a, b) => b.count - a.count);
            setRows(list);
        } catch (e: any) {
            console.error('[RankingDHL] erro:', e);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [year, month]);

    const totals = useMemo(() => ({
        count: rows.reduce((a, r) => a + r.count, 0),
        value: rows.reduce((a, r) => a + r.value, 0),
        people: rows.length,
    }), [rows]);

    const paymentDate = endOfMonthPlus40(year, month);

    const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    const medal = (idx: number) => {
        if (idx === 0) return 'bg-yellow-400 text-yellow-900';
        if (idx === 1) return 'bg-gray-300 text-gray-800';
        if (idx === 2) return 'bg-orange-400 text-orange-900';
        return 'bg-gray-100 text-gray-600';
    };

    return (
        <div className="p-6 max-w-6xl mx-auto" data-testid="page-ranking-dhl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 text-white shadow-lg">
                        <Trophy size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Ranking DHL</h1>
                        <p className="text-sm text-gray-500 font-semibold">R$ 10,00 por OS aberta para o cliente DHL</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 outline-none focus:border-red-500"
                        data-testid="select-month"
                    >
                        {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 outline-none focus:border-red-500"
                        data-testid="select-year"
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button
                        onClick={loadData}
                        className="p-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-all"
                        title="Atualizar"
                        data-testid="button-refresh"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mês de Referência</div>
                    <div className="text-lg font-black text-gray-900 mt-1" data-testid="text-month-label">{monthLabel(year, month)}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Funcionários no Ranking</div>
                    <div className="text-lg font-black text-blue-700 mt-1" data-testid="text-total-people">{totals.people}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total de OS DHL</div>
                    <div className="text-lg font-black text-emerald-700 mt-1" data-testid="text-total-count">{totals.count}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Total a Pagar</div>
                    <div className="text-lg font-black text-emerald-700 mt-1" data-testid="text-total-value">{formatBRL(totals.value)}</div>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
                <Calendar className="text-amber-700 flex-shrink-0" size={20} />
                <div>
                    <div className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Data de Pagamento</div>
                    <div className="text-base font-black text-amber-900" data-testid="text-payment-date">
                        {paymentDate} <span className="text-xs font-bold text-amber-700">(fim do mês de referência + 40 dias)</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-900 to-gray-700 text-white">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest w-16">#</th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Nome</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Quantidade</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 font-bold">
                                <Loader2 size={20} className="animate-spin inline mr-2" /> Carregando...
                            </td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 font-bold" data-testid="text-empty">
                                Nenhuma OS DHL aberta neste mês.
                            </td></tr>
                        )}
                        {!loading && rows.map((r, i) => (
                            <tr key={r.name} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`row-rank-${i}`}>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-black ${medal(i)}`}>{i + 1}</span>
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-gray-800" data-testid={`text-name-${i}`}>{r.name}</td>
                                <td className="px-4 py-3 text-sm font-black text-blue-700 text-right" data-testid={`text-count-${i}`}>{r.count}</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-700 text-right" data-testid={`text-value-${i}`}>{formatBRL(r.value)}</td>
                            </tr>
                        ))}
                        {!loading && rows.length > 0 && (
                            <tr className="bg-gray-50 border-t-2 border-gray-300">
                                <td colSpan={2} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 text-right">Total</td>
                                <td className="px-4 py-3 text-sm font-black text-blue-700 text-right">{totals.count}</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-700 text-right">{formatBRL(totals.value)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
