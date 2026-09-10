import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, FileSpreadsheet, Loader2, RefreshCw,
  Receipt, Search, ShieldAlert, Wallet, XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { carregarPainelFaturamento } from '../lib/faturamento/carregarPainelFaturamento';
import type { LinhaRelatorioFaturamento, SemaforoFaturamento } from '../lib/faturamento/painelFaturamento';

type FiltroRelatorio = 'todos' | 'aberto' | 'pago' | 'atraso' | 'os_faltando';

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d?: string | null): string {
  if (!d || d === '—') return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

function SemaforoDot({ s }: { s: SemaforoFaturamento }) {
  const cls = s === 'ok' ? 'bg-emerald-500' : s === 'alerta' ? 'bg-amber-400' : 'bg-red-500';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function Kpi({
  label, value, sub, tone, testid,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'ok' | 'alerta' | 'critico' | 'neutro';
  testid?: string;
}) {
  const box =
    tone === 'ok'
      ? 'bg-emerald-50 border-emerald-200'
      : tone === 'alerta'
        ? 'bg-amber-50 border-amber-200'
        : tone === 'critico'
          ? 'bg-red-50 border-red-200'
          : 'bg-white border-gray-200';
  const num =
    tone === 'ok'
      ? 'text-emerald-800'
      : tone === 'alerta'
        ? 'text-amber-800'
        : tone === 'critico'
          ? 'text-red-700'
          : 'text-gray-900';
  return (
    <div data-testid={testid} className={`rounded-xl border p-3 ${box}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-black leading-none ${num}`}>{value}</p>
      {sub ? <p className="mt-1 text-[10px] font-bold text-gray-500">{sub}</p> : null}
    </div>
  );
}

type Props = {
  onNavigate?: (screen: string) => void;
  onEditClient?: (id: string) => void;
};

const DiretoriaFaturamentoPage: React.FC<Props> = ({ onNavigate, onEditClient }) => {
  const [filtro, setFiltro] = useState<FiltroRelatorio>('todos');
  const [busca, setBusca] = useState('');
  const [osAberta, setOsAberta] = useState<{ cliente: string; periodo: string; ids: string[] } | null>(null);

  const { data: painel, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['faturamento-painel'],
    queryFn: () => carregarPainelFaturamento(supabase),
    staleTime: 60_000,
  });

  const kpis = painel?.kpis;
  const semaforo = kpis?.semaforo || 'alerta';

  const relatorio = useMemo(() => {
    const rows = painel?.relatorio || [];
    const q = busca.trim().toUpperCase();
    return rows.filter((r) => {
      if (q && !r.cliente.toUpperCase().includes(q) && !r.periodo.toUpperCase().includes(q)) return false;
      if (filtro === 'aberto') return r.statusPagamento === 'EM ABERTO';
      if (filtro === 'pago') return r.statusPagamento === 'PAGO';
      if (filtro === 'atraso') return r.statusPagamento === 'ATRASADO' || (r.diasAtraso != null && r.diasAtraso > 0 && r.statusPagamento !== 'PAGO');
      if (filtro === 'os_faltando') return r.coberturaOk === false;
      return true;
    });
  }, [painel, filtro, busca]);

  const hero =
    semaforo === 'ok'
      ? { bg: 'from-emerald-600 to-emerald-700', titulo: 'Faturamento em dia', sub: 'Toda OS dos ciclos fechados está faturada e aprovada.' }
      : semaforo === 'alerta'
        ? { bg: 'from-amber-500 to-amber-600', titulo: 'Atenção no ciclo atual', sub: 'Há OS para aprovar ou ciclo de cliente sem cadastro.' }
        : { bg: 'from-red-600 to-red-700', titulo: 'Há OS ou fatura em atraso', sub: 'Não feche boletim enquanto restar OS sem fatura ou sem APROVADA.' };

  return (
    <div className="space-y-4 pb-10" data-testid="diretoria-faturamento-page">
      <div className={`rounded-2xl bg-gradient-to-br ${hero.bg} p-5 text-white shadow-lg`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Diretoria · Faturamento</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">{hero.titulo}</h1>
            <p className="mt-1 text-sm text-white/90">{hero.sub}</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-black uppercase hover:bg-white/25"
            data-testid="btn-refresh-faturamento"
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
        {painel?.consultaIncompleta ? (
          <p className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-xs font-bold">
            CONSULTA INCOMPLETA — números abaixo não são o universo total. {painel.error || ''}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          {error instanceof Error ? error.message : 'Falha ao carregar o painel.'}
        </div>
      ) : null}

      {isLoading && !painel ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="animate-spin" /> Carregando universo de OS e faturas…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi
              testid="kpi-cobertura"
              label="Cobertura OS"
              value={kpis?.coberturaPct == null ? '—' : `${kpis.coberturaPct}%`}
              sub={kpis ? `${kpis.osFaturadasFechado}/${kpis.osCicloFechado} ciclos fechados` : undefined}
              tone={kpis?.coberturaPct === 100 ? 'ok' : 'critico'}
            />
            <Kpi
              testid="kpi-os-sem-fatura"
              label="OS sem fatura"
              value={String(kpis?.osSemFaturaFechado ?? 0)}
              sub="Ciclo já fechado"
              tone={(kpis?.osSemFaturaFechado || 0) > 0 ? 'critico' : 'ok'}
            />
            <Kpi
              testid="kpi-os-sem-aprovacao"
              label="Sem APROVADA"
              value={String(kpis?.osSemAprovacaoFechado ?? 0)}
              sub="Bloqueia o boletim"
              tone={(kpis?.osSemAprovacaoFechado || 0) > 0 ? 'critico' : 'ok'}
            />
            <Kpi
              testid="kpi-pendentes-aberto"
              label="Aprovar agora"
              value={String(kpis?.osPendentesAberto ?? 0)}
              sub="Ciclo em curso"
              tone={(kpis?.osPendentesAberto || 0) > 0 ? 'alerta' : 'ok'}
            />
            <Kpi
              testid="kpi-faturas-atraso"
              label="Faturas atrasadas"
              value={String(kpis?.faturasAtrasadas ?? 0)}
              sub={`${kpis?.faturasEmAberto ?? 0} em aberto`}
              tone={(kpis?.faturasAtrasadas || 0) > 0 ? 'critico' : (kpis?.faturasEmAberto || 0) > 0 ? 'alerta' : 'ok'}
            />
            <Kpi
              testid="kpi-sem-ciclo"
              label="Sem ciclo"
              value={String(kpis?.clientesSemCiclo ?? 0)}
              sub="Cadastrar no cliente"
              tone={(kpis?.clientesSemCiclo || 0) > 0 ? 'alerta' : 'ok'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">Fila de ação</h2>
                <span className="text-[10px] font-bold text-gray-400">{painel?.fila.length || 0} itens</span>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {(painel?.fila || []).length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-4 text-sm font-bold text-emerald-800">
                    <CheckCircle2 size={16} /> Nenhum cliente travado.
                  </div>
                ) : (
                  (painel?.fila || []).map((row) => (
                    <button
                      key={`${row.clienteId || row.cliente}|${row.periodo}`}
                      type="button"
                      onClick={() => onNavigate?.('fin-billing')}
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left hover:border-gray-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-black text-gray-900">
                          <SemaforoDot s={row.semaforo} />
                          {row.cliente}
                        </span>
                        <span className="text-[10px] font-black uppercase text-gray-400">{row.cicloLabel}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] font-bold text-gray-500">{row.periodo}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {row.osSemFatura > 0 ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">{row.osSemFatura} sem fatura</span>
                        ) : null}
                        {row.osSemAprovacao > 0 ? (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-black text-orange-700">{row.osSemAprovacao} sem aprovação</span>
                        ) : null}
                        {row.osAbertas > 0 ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">{row.osAbertas} aberta</span>
                        ) : null}
                        {row.ciclo == null && onEditClient && row.clienteId ? (
                          <span
                            className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditClient(row.clienteId!);
                            }}
                          >
                            Cadastrar ciclo
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">Relatório geral</h2>
                <div className="flex flex-wrap gap-1">
                  {([
                    ['todos', 'Todos'],
                    ['aberto', 'Em aberto'],
                    ['pago', 'Pago'],
                    ['atraso', 'Atraso'],
                    ['os_faltando', 'OS faltando'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFiltro(id)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                        filtro === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm"
                  placeholder="Cliente ou período"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-left text-xs" data-testid="tabela-relatorio-faturamento">
                  <thead className="sticky top-0 bg-gray-50 text-[10px] font-black uppercase text-gray-500">
                    <tr>
                      <th className="px-2 py-2">Cliente</th>
                      <th className="px-2 py-2">Período</th>
                      <th className="px-2 py-2">Faturamento</th>
                      <th className="px-2 py-2">Pagamento</th>
                      <th className="px-2 py-2">Dias</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">OS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-8 text-center text-gray-400">Nenhuma fatura neste filtro.</td>
                      </tr>
                    ) : (
                      relatorio.map((r) => (
                        <RelatorioRow key={r.faturaId} row={r} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {(painel?.alertas || []).length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-gray-800">Alertas</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {(painel?.alertas || []).slice(0, 12).map((a, i) => (
                  <button
                    key={`${a.tipo}|${a.cliente}|${a.periodo}|${i}`}
                    type="button"
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left ${
                      a.severidade === 'critico' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                    }`}
                    onClick={() => {
                      if (a.osIds.length) setOsAberta({ cliente: a.cliente, periodo: a.periodo, ids: a.osIds });
                      else if (a.tipo === 'CICLO_NAO_CADASTRADO' && a.clienteId) onEditClient?.(a.clienteId);
                      else onNavigate?.('fin-billing');
                    }}
                  >
                    {a.severidade === 'critico' ? <ShieldAlert size={16} className="mt-0.5 text-red-600" /> : <AlertTriangle size={16} className="mt-0.5 text-amber-600" />}
                    <div>
                      <p className="text-sm font-black text-gray-900">{a.cliente}</p>
                      <p className="text-[11px] font-bold text-gray-600">{a.periodo} · {a.detalhe}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {osAberta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOsAberta(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black">{osAberta.cliente} · {osAberta.periodo}</h3>
              <button type="button" onClick={() => setOsAberta(null)}><XCircle size={18} /></button>
            </div>
            <ul className="space-y-1 font-mono text-xs">
              {osAberta.ids.map((id) => (
                <li key={id} className="rounded bg-gray-50 px-2 py-1">{id}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-red-700 py-2 text-xs font-black uppercase text-white"
              onClick={() => {
                setOsAberta(null);
                onNavigate?.('fin-billing');
              }}
            >
              Ir ao boletim de medição
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-gray-500">
        <span className="inline-flex items-center gap-1"><Receipt size={12} /> Boletim só sai com 100% APROVADA</span>
        <span className="inline-flex items-center gap-1"><Wallet size={12} /> Quinzenal = 1–15 e 16–fim · Mensal = mês cheio · Diário = o dia</span>
        <span className="inline-flex items-center gap-1"><FileSpreadsheet size={12} /> Ciclo vem do cadastro do cliente</span>
        <span className="inline-flex items-center gap-1"><Clock size={12} /> Dias = atraso contra o vencimento</span>
      </div>
    </div>
  );
};

function RelatorioRow({ row }: { row: LinhaRelatorioFaturamento }) {
  const st =
    row.statusPagamento === 'PAGO'
      ? 'bg-emerald-50 text-emerald-800'
      : row.statusPagamento === 'ATRASADO'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-800';
  const dias =
    row.diasAtraso == null
      ? '—'
      : row.diasAtraso === 0
        ? '0'
        : String(row.diasAtraso);
  const osTxt =
    row.coberturaEstado !== 'ENCONTRADO'
      ? '—'
      : row.coberturaOk
        ? `${row.osVinculadas}/${row.osPeriodo}`
        : `${row.osVinculadas}/${row.osPeriodo ?? '?'}`;
  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-2 font-bold text-gray-900">{row.cliente}</td>
      <td className="px-2 py-2 text-gray-600">
        {row.periodo}
        {row.periodoEstado === 'NÃO VALIDADO' ? <span className="ml-1 text-[9px] font-black uppercase text-amber-600">estimado</span> : null}
      </td>
      <td className="px-2 py-2 font-mono">{fmtDate(row.dataFaturamento)}</td>
      <td className="px-2 py-2 font-mono">{fmtDate(row.dataPagamento)}</td>
      <td className={`px-2 py-2 font-mono font-black ${row.diasAtraso && row.diasAtraso > 0 ? 'text-red-700' : 'text-gray-700'}`}>{dias}</td>
      <td className="px-2 py-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${st}`}>{row.statusPagamento}</span>
      </td>
      <td className={`px-2 py-2 font-mono ${row.coberturaOk === false ? 'font-black text-red-700' : 'text-gray-600'}`}>
        {osTxt}
        {row.coberturaOk === false ? ' ⚠' : ''}
      </td>
    </tr>
  );
}

export default DiretoriaFaturamentoPage;
