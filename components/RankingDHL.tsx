import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Calendar, RefreshCw, Loader2, Activity, Lock } from 'lucide-react';

const VALOR_POR_OS = 10;

// Usuários excluídos do ranking DHL (não recebem premiação)
const EXCLUIDOS = new Set<string>([
    'PLINIO ALVES PRADO DOS SANTOS',
]);

type Row = { name: string; dhl: number; demais: number; value: number };
type ProdRow = { name: string; total: number };

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

function isDiretoria(): boolean {
    try {
        const u = JSON.parse(localStorage.getItem('userData') || '{}');
        const role = (u.role || '').toLowerCase();
        return role === 'diretoria';
    } catch { return false; }
}

export default function RankingDHL() {
    const now = new Date();
    const [year, setYear] = useState<number>(now.getFullYear());
    const [month, setMonth] = useState<number>(now.getMonth()); // 0-based
    const [rows, setRows] = useState<Row[]>([]);
    const [prodRows, setProdRows] = useState<ProdRow[]>([]);
    const [loading, setLoading] = useState(false);
    const diretoria = isDiretoria();

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

            // 2) Busca todas as missões criadas pra saber cliente e status
            // Somente OS finalizadas (Concluída ou Cancelada) entram no controle.
            // OS Recusada e status intermediários não contam.
            const ids = Array.from(new Set((logs || []).map(l => l.entity_id).filter(Boolean)));
            const clientMap = new Map<string, string>();
            const statusMap = new Map<string, string>();
            if (ids.length > 0) {
                const { data: ms, error: mErr } = await supabase
                    .from('missions')
                    .select('id, client, status')
                    .in('id', ids);
                if (mErr) throw mErr;
                for (const m of (ms || []) as any[]) {
                    clientMap.set(m.id, String(m.client || ''));
                    statusMap.set(m.id, String(m.status || ''));
                }
            }

            // 3) Conta criações por usuário (DHL e Demais), 1ª criação por OS
            //    Só conta OS com status final "Concluída" ou "Cancelada".
            const STATUS_VALIDOS = new Set(['Concluída', 'Cancelada']);
            const seen = new Set<string>();
            const map = new Map<string, { dhl: number; demais: number }>();
            for (const l of (logs || [])) {
                if (!l.entity_id || seen.has(l.entity_id)) continue;
                seen.add(l.entity_id);
                const st = statusMap.get(l.entity_id) || '';
                if (!STATUS_VALIDOS.has(st)) continue; // ignora Solicitada/Em Viagem/Recusada/etc.
                const raw = (l as any).user_name;
                if (!raw) continue;
                const name = String(raw).trim();
                if (!name) continue;
                const key = name.toUpperCase();
                if (EXCLUIDOS.has(key)) continue;
                const client = (clientMap.get(l.entity_id) || '').toUpperCase();
                const isDhl = client.includes('DHL');
                const cur = map.get(key) || { dhl: 0, demais: 0 };
                if (isDhl) cur.dhl += 1; else cur.demais += 1;
                map.set(key, cur);
            }
            const list: Row[] = Array.from(map.entries())
                .map(([name, c]) => ({ name, dhl: c.dhl, demais: c.demais, value: c.dhl * VALOR_POR_OS }))
                .sort((a, b) => b.dhl - a.dhl || b.demais - a.demais);
            setRows(list);

            // 4) Produtividade no sistema (todas atualizações no período) — somente diretoria
            if (diretoria) {
                // Pagina pra evitar truncamento (Supabase devolve no máx ~1000 por padrão)
                const pmap = new Map<string, number>();
                const PAGE = 1000;
                let from = 0;
                while (true) {
                    const { data: pages, error: pErr } = await supabase
                        .from('system_logs')
                        .select('user_name')
                        .gte('created_at', start)
                        .lt('created_at', end)
                        .range(from, from + PAGE - 1);
                    if (pErr) throw pErr;
                    if (!pages || pages.length === 0) break;
                    for (const p of pages as any[]) {
                        const n = String(p.user_name || '').trim();
                        if (!n) continue;
                        const k = n.toUpperCase();
                        pmap.set(k, (pmap.get(k) || 0) + 1);
                    }
                    if (pages.length < PAGE) break;
                    from += PAGE;
                }
                const plist: ProdRow[] = Array.from(pmap.entries())
                    .map(([name, total]) => ({ name, total }))
                    .sort((a, b) => b.total - a.total);
                setProdRows(plist);
            } else {
                setProdRows([]);
            }
        } catch (e: any) {
            console.error('[RankingDHL] erro:', e);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [year, month]);

    const totals = useMemo(() => ({
        dhl: rows.reduce((a, r) => a + r.dhl, 0),
        demais: rows.reduce((a, r) => a + r.demais, 0),
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

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mês de Referência</div>
                    <div className="text-base font-black text-gray-900 mt-1" data-testid="text-month-label">{monthLabel(year, month)}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Funcionários</div>
                    <div className="text-base font-black text-blue-700 mt-1" data-testid="text-total-people">{totals.people}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">OS DHL</div>
                    <div className="text-base font-black text-emerald-700 mt-1" data-testid="text-total-count">{totals.dhl}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">OS Demais</div>
                    <div className="text-base font-black text-gray-700 mt-1" data-testid="text-total-demais">{totals.demais}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 col-span-2 md:col-span-1">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor a Pagar</div>
                    <div className="text-base font-black text-emerald-700 mt-1" data-testid="text-total-value">{formatBRL(totals.value)}</div>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Calendar className="text-amber-700 flex-shrink-0" size={18} />
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Data de Pagamento:</span>
                <span className="text-base font-black text-amber-900" data-testid="text-payment-date">{paymentDate}</span>
                <span className="text-xs font-bold text-amber-700">(fim do mês de referência + 40 dias)</span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-900 to-gray-700 text-white">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest w-16">#</th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Nome</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">DHL</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Demais</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Valor</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Pagamento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-bold">
                                <Loader2 size={20} className="animate-spin inline mr-2" /> Carregando...
                            </td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-bold" data-testid="text-empty">
                                Nenhuma OS criada neste mês.
                            </td></tr>
                        )}
                        {!loading && rows.map((r, i) => (
                            <tr key={r.name} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`row-rank-${i}`}>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-black ${medal(i)}`}>{i + 1}</span>
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-gray-800" data-testid={`text-name-${i}`}>{r.name}</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-700 text-right" data-testid={`text-dhl-${i}`}>{r.dhl}</td>
                                <td className="px-4 py-3 text-sm font-black text-gray-700 text-right" data-testid={`text-demais-${i}`}>{r.demais}</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-700 text-right" data-testid={`text-value-${i}`}>{formatBRL(r.value)}</td>
                                <td className="px-4 py-3 text-sm font-black text-amber-700 text-right whitespace-nowrap" data-testid={`text-payment-${i}`}>{paymentDate}</td>
                            </tr>
                        ))}
                        {!loading && rows.length > 0 && (
                            <tr className="bg-gray-50 border-t-2 border-gray-300">
                                <td colSpan={2} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 text-right">Total</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-700 text-right">{totals.dhl}</td>
                                <td className="px-4 py-3 text-sm font-black text-gray-700 text-right">{totals.demais}</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-700 text-right">{formatBRL(totals.value)}</td>
                                <td className="px-4 py-3"></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {diretoria && (
                <div className="mt-8" data-testid="section-produtividade">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-900 text-white shadow">
                            <Activity size={18} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                Produtividade no Sistema
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                    <Lock size={10} /> Somente Diretoria
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 font-semibold">Total de ações registradas (criação, atualização, financeiro, etc.) no mês</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gradient-to-r from-indigo-900 to-indigo-700 text-white">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest w-16">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Usuário</th>
                                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Ações no Sistema</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 font-bold">
                                        <Loader2 size={20} className="animate-spin inline mr-2" /> Carregando...
                                    </td></tr>
                                )}
                                {!loading && prodRows.length === 0 && (
                                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 font-bold">
                                        Sem registros no período.
                                    </td></tr>
                                )}
                                {!loading && prodRows.map((p, i) => (
                                    <tr key={p.name} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`row-prod-${i}`}>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-black ${medal(i)}`}>{i + 1}</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-bold text-gray-800" data-testid={`text-prod-name-${i}`}>{p.name}</td>
                                        <td className="px-4 py-3 text-sm font-black text-indigo-700 text-right" data-testid={`text-prod-total-${i}`}>{p.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
