import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign, Filter, Loader2, Receipt,
  Wallet, X, Landmark, FileSpreadsheet, RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';
import { fetchAllPages } from '../lib/supabasePaging';
import {
  calcularComissao,
  COMISSAO_STATUS_LABEL,
  type ComissaoStatus,
} from '../lib/comissao/comissaoCalc';
import { registrarPagamentoComissao } from '../lib/comissao/comissaoService';
import { sincronizarComerciaisDeUsuarios } from '../lib/comissao/comissaoUsuarios';
import { carregarPendenciasComissao, type PendenciaComissaoCliente } from '../lib/comissao/sincronizarComissoesFaturas';
import {
  anosFiltroComissao,
  carregarQuadroTmSeg,
  quadroDeComissoesTorres,
  resolverPeriodoInicialFaturas,
  somarQuadro,
  type LinhaQuadroCliente,
} from '../lib/comissao/quadroFaturamentoComissao';
import InvoiceDivergenceAuditPanel from './InvoiceDivergenceAuditPanel';
import {
  calcularApuracaoComissao,
  gerarLinhasTabelaReferencia,
  TABELA_COMISSAO_PADRAO,
} from '../lib/comissao/tabelaComissaoPadrao';
import {
  intervaloQuinzena,
  labelQuinzena,
  montarCsvRelatorioComissoes,
  nomeArquivoRelatorioComissoes,
  quinzenaDeDataFaturamento,
  type QuinzenaFiltro,
} from '../lib/comercial/tabelaPrecosRegionais';

type Comercial = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  pix_chave?: string | null;
  ativo?: boolean;
  usuario_id?: number | null;
  valor_fixo?: number | null;
  tabela_comissao_codigo?: string | null;
};

type EmpresaOrigem = 'TM_SEG' | 'TORRES';

type ComissaoRow = {
  id: string;
  fatura_id: string | null;
  fatura_numero: string | null;
  empresa_origem?: EmpresaOrigem | string | null;
  cliente_id: number | null;
  cliente_origem_id?: number | null;
  cliente_nome: string | null;
  comercial_id: string;
  valor_faturamento: number;
  percentual_imposto_aplicado: number;
  valor_base_liquida: number;
  percentual_comissao_aplicado: number;
  valor_comissao: number;
  status: ComissaoStatus;
  data_faturamento: string | null;
  data_recebimento_cliente: string | null;
  data_pagamento_comissao: string | null;
  comprovante_url: string | null;
  comerciais?: { nome?: string | null; pix_chave?: string | null } | null;
};

function empresaLabel(empresa?: string | null): string {
  return String(empresa || '').toUpperCase() === 'TORRES' ? 'TORRES' : 'TM SEG';
}

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

function labelMesAno(ym: string): string {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [y, m] = String(ym).split('-');
  const i = Number(m) - 1;
  return `${nomes[i] || m}/${y}`;
}

const STATUS_BADGE: Record<ComissaoStatus, string> = {
  AGUARDANDO_PAGAMENTO_CLIENTE: 'bg-amber-50 text-amber-800 border-amber-200',
  LIBERADO_PARA_PAGAMENTO: 'bg-blue-50 text-blue-800 border-blue-200',
  PAGO: 'bg-green-50 text-green-800 border-green-200',
  CANCELADO: 'bg-gray-100 text-gray-500 border-gray-200',
};

function TabelaQuadroEmpresa({
  titulo,
  linhas,
  vazio,
  testid,
}: {
  titulo: string;
  linhas: LinhaQuadroCliente[];
  vazio: string;
  testid: string;
}) {
  const tot = somarQuadro(linhas);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid={testid}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase">{titulo}</p>
          <p className="text-[11px] text-gray-500">Cliente · faturamento · comissão prevista (bruto − 16% × 3%)</p>
        </div>
        <p className="text-[11px] font-black text-gray-700 whitespace-nowrap">{fmtBRL(tot.faturamento)}</p>
      </div>
      {linhas.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">{vazio}</div>
      ) : (
        <div className="overflow-x-auto max-h-80">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Comercial</th>
                <th className="text-right px-3 py-2">Faturas</th>
                <th className="text-right px-3 py-2">Faturamento</th>
                <th className="text-right px-3 py-2">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.cliente} className="border-t border-gray-50">
                  <td className="px-3 py-2 text-xs font-bold uppercase">{c.cliente}</td>
                  <td className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">{c.comercialNome || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{c.faturas}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.faturamento)}</td>
                  <td className="px-3 py-2 text-right font-black">{fmtBRL(c.comissao)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-3 py-2 text-[10px] font-black uppercase" colSpan={2}>Total</td>
                <td className="px-3 py-2 text-right font-mono font-black">{tot.faturas}</td>
                <td className="px-3 py-2 text-right font-mono font-black">{fmtBRL(tot.faturamento)}</td>
                <td className="px-3 py-2 text-right font-black">{fmtBRL(tot.comissao)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

const ComissoesComerciaisPage: React.FC = () => {
  const { showNotification } = useNotification();
  const now = new Date();
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(9);
  const [periodoPronto, setPeriodoPronto] = useState(false);
  const [quinzenaFiltro, setQuinzenaFiltro] = useState<QuinzenaFiltro>('todas');
  const [comercialId, setComercialId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ComissaoStatus>('');
  const [empresaFilter, setEmpresaFilter] = useState<'' | EmpresaOrigem>('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ComissaoRow[]>([]);
  const [comerciais, setComerciais] = useState<Comercial[]>([]);
  const [paying, setPaying] = useState<ComissaoRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [savingPay, setSavingPay] = useState(false);
  const [showCadastro, setShowCadastro] = useState(false);
  const [syncingUsers, setSyncingUsers] = useState(false);
  const [showTabela, setShowTabela] = useState(false);
  const [novoPix, setNovoPix] = useState('');
  const [novoFixo, setNovoFixo] = useState('');
  const [savingComercial, setSavingComercial] = useState(false);
  const [syncingFaturas, setSyncingFaturas] = useState(false);
  const [pendencias, setPendencias] = useState<PendenciaComissaoCliente[]>([]);
  const [quadroTm, setQuadroTm] = useState<LinhaQuadroCliente[]>([]);
  const [quadroTorres, setQuadroTorres] = useState<LinhaQuadroCliente[]>([]);
  const [mesesDisponiveis, setMesesDisponiveis] = useState<string[]>([]);
  const autoSyncRef = useRef(false);

  const { start: periodStart, end: periodEnd } = intervaloQuinzena(year, month, quinzenaFiltro);

  const loadComerciais = useCallback(async () => {
    const { data, error } = await supabase.from('comerciais').select('id, nome, email, telefone, pix_chave, ativo, usuario_id, valor_fixo, tabela_comissao_codigo').order('nome');
    if (error) throw new Error(error.message);
    const lista = (data || []) as Comercial[];
    setComerciais(lista);
    return lista;
  }, []);

  const load = useCallback(async () => {
    if (!periodoPronto) return;
    setLoading(true);
    try {
      const listaComerciais = await loadComerciais();
      if (!autoSyncRef.current) {
        autoSyncRef.current = true;
        setSyncingFaturas(true);
        try {
          const syncRes = await authFetch('/api/comissoes/sync-faturas', { method: 'POST', body: '{}' });
          const sync = await syncRes.json().catch(() => ({}));
          if (sync.pendencias) setPendencias(sync.pendencias);
        } catch {
          /* fail-soft: quadro das faturas continua */
        } finally {
          setSyncingFaturas(false);
        }
      }
      const result = await fetchAllPages<ComissaoRow>(async (from, size) => {
        let q = supabase
          .from('comissoes')
          .select('*, comerciais(nome, pix_chave)', { count: 'exact' })
          .gte('data_faturamento', periodStart)
          .lte('data_faturamento', periodEnd)
          .order('data_faturamento', { ascending: false })
          .range(from, from + size - 1);
        if (comercialId) q = q.eq('comercial_id', comercialId);
        if (statusFilter) q = q.eq('status', statusFilter);
        if (empresaFilter) q = q.eq('empresa_origem', empresaFilter);
        const { data, error, count } = await q;
        return { data: data as ComissaoRow[] | null, error, count };
      });
      setRows(result.rows);
      try {
        const quadroRes = await authFetch(`/api/comissoes/quadro?start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`);
        const quadroJson = await quadroRes.json().catch(() => ({}));
        if (quadroRes.ok && (quadroJson.ok || (quadroJson.linhasTm || []).length > 0 || (quadroJson.meses || []).length > 0)) {
          setQuadroTm(quadroJson.linhasTm || []);
          setQuadroTorres(quadroJson.linhasTorres || []);
          setMesesDisponiveis(quadroJson.meses || []);
          if (Array.isArray(quadroJson.pendencias)) setPendencias(quadroJson.pendencias);
          if (quadroJson.error && !(quadroJson.linhasTm || []).length) {
            showNotification('Quadro', quadroJson.error, 'warning');
          }
        } else {
          const quadro = await carregarQuadroTmSeg(supabase, periodStart, periodEnd, listaComerciais);
          setQuadroTm(quadro.linhas);
          setQuadroTorres(quadroDeComissoesTorres(result.rows));
          setMesesDisponiveis(quadro.meses);
          if (quadro.error || quadroJson.error) {
            showNotification('Quadro', quadroJson.error || quadro.error || 'Falha ao carregar faturamento', 'warning');
          }
        }
      } catch (e: any) {
        try {
          const quadro = await carregarQuadroTmSeg(supabase, periodStart, periodEnd, listaComerciais);
          setQuadroTm(quadro.linhas);
          setQuadroTorres(quadroDeComissoesTorres(result.rows));
          setMesesDisponiveis(quadro.meses);
        } catch {
          setQuadroTm([]);
          setQuadroTorres(quadroDeComissoesTorres(result.rows));
        }
        showNotification('Quadro', e?.message || 'Falha ao carregar faturamento', 'warning');
      }
      try {
        const pend = await carregarPendenciasComissao(supabase);
        if (pend.ok && pend.pendencias.length) setPendencias(pend.pendencias);
      } catch {
        /* pendências já podem ter vindo da API */
      }
      if (!result.complete) {
        showNotification('Consulta incompleta', 'Nem todas as comissões do período foram carregadas.', 'warning');
      }
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao carregar comissões', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periodoPronto, periodStart, periodEnd, comercialId, statusFilter, empresaFilter, quinzenaFiltro, loadComerciais, showNotification]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await resolverPeriodoInicialFaturas(supabase);
      if (alive && p) {
        setYear(p.year);
        setMonth(p.month);
      }
      if (alive) setPeriodoPronto(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (periodoPronto) void load(); }, [load, periodoPronto]);

  useEffect(() => {
    const c = comerciais.find((x) => x.id === comercialId);
    setNovoPix(c?.pix_chave || '');
    setNovoFixo(c?.valor_fixo != null ? String(c.valor_fixo) : '');
  }, [comercialId, comerciais]);

  const stats = useMemo(() => {
    const fat = rows.reduce((s, r) => s + Number(r.valor_faturamento || 0), 0);
    const imposto = rows.reduce((s, r) => s + calcularComissao(Number(r.valor_faturamento), Number(r.percentual_imposto_aplicado), 0).valorImposto, 0);
    const base = rows.reduce((s, r) => s + Number(r.valor_base_liquida || 0), 0);
    const lib = rows.filter((r) => r.status === 'LIBERADO_PARA_PAGAMENTO').reduce((s, r) => s + Number(r.valor_comissao || 0), 0);
    const pago = rows.filter((r) => r.status === 'PAGO').reduce((s, r) => s + Number(r.valor_comissao || 0), 0);
    const porEmpresa = {
      TM_SEG: rows.filter((r) => empresaLabel(r.empresa_origem) === 'TM SEG').reduce((s, r) => s + Number(r.valor_comissao || 0), 0),
      TORRES: rows.filter((r) => empresaLabel(r.empresa_origem) === 'TORRES').reduce((s, r) => s + Number(r.valor_comissao || 0), 0),
    };
    const porClienteMap = new Map<string, { cliente: string; empresa: string; fat: number; comissao: number; qtd: number }>();
    for (const r of rows) {
      const empresa = empresaLabel(r.empresa_origem);
      const cliente = String(r.cliente_nome || '—').toUpperCase();
      const key = `${empresa}|${cliente}`;
      const prev = porClienteMap.get(key) || { cliente, empresa, fat: 0, comissao: 0, qtd: 0 };
      prev.fat += Number(r.valor_faturamento || 0);
      prev.comissao += Number(r.valor_comissao || 0);
      prev.qtd += 1;
      porClienteMap.set(key, prev);
    }
    const porComercialMap = new Map<string, { comercial: string; fat: number; comissaoLinhas: number; tm: number; torres: number }>();
    for (const r of rows) {
      const key = r.comercial_id || r.comerciais?.nome || '—';
      const nome = String(r.comerciais?.nome || '—');
      const prev = porComercialMap.get(key) || { comercial: nome, fat: 0, comissaoLinhas: 0, tm: 0, torres: 0 };
      prev.fat += Number(r.valor_faturamento || 0);
      prev.comissaoLinhas += Number(r.valor_comissao || 0);
      if (empresaLabel(r.empresa_origem) === 'TORRES') prev.torres += Number(r.valor_faturamento || 0);
      else prev.tm += Number(r.valor_faturamento || 0);
      porComercialMap.set(key, prev);
    }
    const porComercial = Array.from(porComercialMap.entries()).map(([id, v]) => {
      const cadastro = comerciais.find((c) => c.id === id);
      const apuracao = calcularApuracaoComissao({
        valorBruto: v.fat,
        valorFixo: Number(cadastro?.valor_fixo || 0),
      });
      return { id, ...v, apuracao, usuarioVinculado: !!cadastro?.usuario_id };
    }).sort((a, b) => b.fat - a.fat);
    const porCliente = Array.from(porClienteMap.values()).sort((a, b) => b.comissao - a.comissao);
    return { fat, imposto, base, lib, pago, qtd: rows.length, porEmpresa, porCliente, porComercial };
  }, [rows, comerciais]);

  const quadroVisivel = useMemo(() => {
    const tm = empresaFilter === 'TORRES' ? [] : quadroTm;
    const torres = empresaFilter === 'TM_SEG' ? [] : quadroTorres;
    const all = [...tm, ...torres];
    return {
      tm,
      torres,
      totais: somarQuadro(all),
      totTm: somarQuadro(tm),
      totTorres: somarQuadro(torres),
    };
  }, [quadroTm, quadroTorres, empresaFilter]);

  const confirmarPagamento = async () => {
    if (!paying || !file) {
      showNotification('Comprovante', 'Anexe o comprovante da transferência.', 'warning');
      return;
    }
    setSavingPay(true);
    try {
      const res = await registrarPagamentoComissao(paying.id, file);
      if (!res.ok) throw new Error(res.error || 'Falha ao registrar pagamento');
      showNotification('Pago', 'Comissão marcada como paga.', 'success');
      setPaying(null);
      setFile(null);
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao pagar comissão', 'error');
    } finally {
      setSavingPay(false);
    }
  };

  const exportarRelatorio = () => {
    if (rows.length === 0) {
      showNotification('Relatório', 'Não há comissões neste filtro para exportar.', 'warning');
      return;
    }
    const comercialNome = comerciais.find((c) => c.id === comercialId)?.nome || 'Todos';
    const csv = montarCsvRelatorioComissoes(
      rows.map((r) => ({
        empresa: empresaLabel(r.empresa_origem),
        cliente_nome: r.cliente_nome,
        comercial_nome: r.comerciais?.nome || comercialNome,
        fatura_numero: r.fatura_numero,
        data_faturamento: r.data_faturamento,
        valor_faturamento: Number(r.valor_faturamento),
        valor_comissao: Number(r.valor_comissao),
        status: COMISSAO_STATUS_LABEL[r.status] || r.status,
      })),
      { year, month, quinzena: quinzenaFiltro, comercialNome },
    );
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivoRelatorioComissoes({ year, month, quinzena: quinzenaFiltro, comercialNome });
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const sincronizarFaturasExistentes = async () => {
    setSyncingFaturas(true);
    try {
      const syncRes = await authFetch('/api/comissoes/sync-faturas', { method: 'POST', body: '{}' });
      const res = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || res.ok === false) throw new Error(res.error || 'Falha ao sincronizar faturas');
      setPendencias(res.pendencias || []);
      showNotification(
        'Comissões',
        `${res.generated || 0} gerada(s). Sem comercial: ${res.skippedSemComercial || 0}. Já existiam: ${res.skippedJaExiste || 0}.`,
        res.generated > 0 ? 'success' : 'warning',
      );
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao gerar comissões das faturas existentes.', 'error');
    } finally {
      setSyncingFaturas(false);
    }
  };

  const sincronizarUsuarios = async () => {
    setSyncingUsers(true);
    try {
      const res = await sincronizarComerciaisDeUsuarios(supabase);
      if (!res.ok) throw new Error(res.error || 'Falha ao sincronizar');
      showNotification('Usuários', `${res.linked} comercial(is) vinculado(s) à tabela padrão.`, 'success');
      await loadComerciais();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao sincronizar usuários Comercial.', 'error');
    } finally {
      setSyncingUsers(false);
    }
  };

  const salvarDadosComercial = async () => {
    if (!comercialId) {
      showNotification('Comercial', 'Selecione o comercial no filtro para gravar PIX e valor fixo.', 'warning');
      return;
    }
    setSavingComercial(true);
    try {
      const { error } = await supabase.from('comerciais').update({
        pix_chave: novoPix.trim() || null,
        valor_fixo: Number(novoFixo) || 0,
      }).eq('id', comercialId);
      if (error) throw error;
      showNotification('Salvo', 'PIX e valor fixo atualizados.', 'success');
      await loadComerciais();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao salvar dados do comercial', 'error');
    } finally {
      setSavingComercial(false);
    }
  };

  return (
    <div className="space-y-5 p-2" data-testid="comissoes-comerciais-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
            <BadgeDollarSign className="text-red-600" size={22} /> Comissões Comerciais
          </h1>
          <p className="text-xs text-gray-500 font-medium">Controle único TM SEG + TORRES. Vínculo pelo usuário COMERCIAL. Fórmula: bruto − 16% da NF = líquido; 3% sobre o líquido. Total a pagar = fixo + comissão.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTabela((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50"
            data-testid="btn-toggle-tabela-comissao"
          >
            {showTabela ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Tabela padrão
          </button>
          <button
            type="button"
            disabled={syncingUsers}
            onClick={() => void sincronizarUsuarios()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            data-testid="btn-sync-usuarios-comercial"
          >
            {syncingUsers ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar usuários
          </button>
          <button
            type="button"
            disabled={syncingFaturas}
            onClick={() => void sincronizarFaturasExistentes()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-black uppercase text-red-800 hover:bg-red-100 disabled:opacity-50"
            data-testid="btn-sync-comissoes-faturas"
          >
            {syncingFaturas ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Gerar comissões das faturas
          </button>
          <button
            type="button"
            onClick={() => setShowCadastro((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50"
            data-testid="btn-toggle-cadastro-comercial"
          >
            {showCadastro ? 'Fechar PIX/fixo' : 'PIX e valor fixo'}
          </button>
        </div>
      </div>

      <InvoiceDivergenceAuditPanel onSynced={() => { void load(); }} />

      {pendencias.length > 0 && (
        <div className="border-2 border-amber-400 bg-amber-50 rounded-xl p-4" data-testid="comissao-pendencias-banner">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500 shrink-0"><AlertTriangle size={18} className="text-white" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm uppercase text-amber-900">Faturamento sem comissão</p>
              <p className="text-[11px] text-amber-800 mt-1">
                O quadro acima lista o faturamento das faturas mesmo sem comercial. A comissão só entra para pagamento se o cliente tiver <strong>Responsável Comercial</strong> no cadastro (Clientes). TORRES entra por ingest no faturamento da TORRES — não pelo cadastro de cliente da TM SEG.
              </p>
              <div className="overflow-x-auto mt-3 max-h-48">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-black text-amber-800 uppercase">
                      <th className="text-left py-1 pr-3">Cliente na fatura</th>
                      <th className="text-left py-1 pr-3">Motivo</th>
                      <th className="text-right py-1 pr-3">Faturas</th>
                      <th className="text-right py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendencias.slice(0, 20).map((p) => (
                      <tr key={`${p.motivo}-${p.cliente}`} className="border-t border-amber-200">
                        <td className="py-1 pr-3 font-bold uppercase">{p.cliente}</td>
                        <td className="py-1 pr-3">
                          {p.motivo === 'sem_comercial' ? 'Sem comercial no cadastro' : p.motivo === 'cadastro_ambiguo' ? 'Cadastro duplicado' : 'Nome da fatura não achou o cliente'}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono">{p.faturas}</td>
                        <td className="py-1 text-right font-mono">{fmtBRL(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTabela && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="tabela-comissao-padrao">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase">{TABELA_COMISSAO_PADRAO.nome}</p>
            <p className="text-[11px] text-gray-500">Até R$ 50 mil: só o valor fixo. Depois: bruto − 16% da NF = líquido, e 3% sobre esse líquido. Os 16% não entram no pagamento. Bônus R$ 5.000 a partir de R$ 500 mil e R$ 10.000 a partir de R$ 1 milhão.</p>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-right px-3 py-2">Valor bruto</th>
                  <th className="text-right px-3 py-2">NF (−16%)</th>
                  <th className="text-right px-3 py-2">Líquido</th>
                  <th className="text-right px-3 py-2">Comissão 3%</th>
                  <th className="text-right px-3 py-2">Bônus</th>
                  <th className="text-right px-3 py-2">Total escala</th>
                </tr>
              </thead>
              <tbody>
                {gerarLinhasTabelaReferencia().map((l) => (
                  <tr key={l.valorBruto} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.valorBruto)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-red-700">− {fmtBRL(l.notaFiscal)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.resultadoLiquido)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.comissao)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.bonusAcumulado)}</td>
                    <td className="px-3 py-1.5 text-right font-black">{fmtBRL(l.totalAPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCadastro && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="cadastro-comercial">
          <p className="md:col-span-4 text-[11px] text-gray-500">Cadastre o vendedor em Configurações → Usuários internos com perfil COMERCIAL, depois sincronize. Aqui só grava PIX e o salário fixo do selecionado no filtro.</p>
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Chave PIX" value={novoPix} onChange={(e) => setNovoPix(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Valor fixo (R$)" type="number" min="0" step="0.01" value={novoFixo} onChange={(e) => setNovoFixo(e.target.value)} data-testid="input-comercial-valor-fixo" />
          <button type="button" disabled={savingComercial} onClick={() => void salvarDadosComercial()} className="bg-black text-white rounded-lg px-3 py-2 text-xs font-black uppercase disabled:opacity-50">
            {savingComercial ? 'Salvando…' : 'Salvar PIX e fixo'}
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end" data-testid="comissoes-filtros">
        <label className="text-[10px] font-black text-gray-400 uppercase">Mês
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Ano
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="filter-ano-comissao">
            {anosFiltroComissao(year, now.getFullYear()).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Quinzena
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={quinzenaFiltro} onChange={(e) => setQuinzenaFiltro(e.target.value as QuinzenaFiltro)} data-testid="filter-quinzena-comissao">
            <option value="todas">Mês completo</option>
            <option value="q1">1ª Quinzena (01 a 15)</option>
            <option value="q2">2ª Quinzena (16 ao fim)</option>
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Comercial
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold min-w-[180px]" value={comercialId} onChange={(e) => setComercialId(e.target.value)} data-testid="filter-comercial">
            <option value="">Todos</option>
            {comerciais.filter((c) => c.ativo !== false).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Empresa
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={empresaFilter} onChange={(e) => setEmpresaFilter(e.target.value as EmpresaOrigem | '')} data-testid="filter-empresa-comissao">
            <option value="">Todas</option>
            <option value="TM_SEG">TM SEG</option>
            <option value="TORRES">TORRES</option>
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Status
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ComissaoStatus | '')} data-testid="filter-status-comissao">
            <option value="">Todos</option>
            <option value="AGUARDANDO_PAGAMENTO_CLIENTE">Aguardando cliente</option>
            <option value="LIBERADO_PARA_PAGAMENTO">Liberado</option>
            <option value="PAGO">Pago</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-black uppercase">
          <Filter size={12} /> Atualizar
        </button>
        <button type="button" onClick={exportarRelatorio} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50" data-testid="btn-exportar-relatorio-comissao">
          <FileSpreadsheet size={12} /> Exportar relatório
        </button>
      </div>

      {mesesDisponiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="meses-com-fatura">
          <span className="text-[10px] font-black text-gray-400 uppercase">Faturamento em</span>
          {mesesDisponiveis.map((ym) => (
            <button
              key={ym}
              type="button"
              onClick={() => {
                const [y, m] = ym.split('-');
                setYear(Number(y));
                setMonth(Number(m));
                setComercialId('');
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${
                `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}` === ym
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {labelMesAno(ym)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Faturamento acumulado</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(quadroVisivel.totais.faturamento)}</p>
          <p className="text-[10px] text-gray-400">{quadroVisivel.totais.faturas} fatura(s)</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Impostos retidos</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(quadroVisivel.totais.imposto)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Margem líquida (lucro base)</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(quadroVisivel.totais.baseLiquida)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Liberadas × pagas</p>
          <p className="text-sm font-black text-blue-700">{fmtBRL(stats.lib)}</p>
          <p className="text-sm font-black text-green-700">{fmtBRL(stats.pago)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Comissão TM SEG</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(quadroVisivel.totTm.comissao)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Comissão TORRES</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(quadroVisivel.totTorres.comissao)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {empresaFilter !== 'TORRES' && (
          <TabelaQuadroEmpresa
            titulo="TM SEG — por cliente"
            linhas={quadroVisivel.tm}
            vazio={loading ? 'Carregando faturamento…' : 'Sem faturas TM SEG neste mês. Use os atalhos de faturamento acima.'}
            testid="quadro-tm-seg"
          />
        )}
        {empresaFilter !== 'TM_SEG' && (
          <TabelaQuadroEmpresa
            titulo="TORRES — por cliente"
            linhas={quadroVisivel.torres}
            vazio={loading ? 'Carregando faturamento…' : 'Sem faturamento TORRES neste filtro. A TORRES entra aqui pelo ingest no faturamento da TORRES.'}
            testid="quadro-torres"
          />
        )}
      </div>

      {stats.porComercial.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="apuracao-escala-comercial">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase">Apuração do período (TM SEG + TORRES)</p>
            <p className="text-[11px] text-gray-500">Bruto TM SEG + TORRES. Imposto de 16% é abatido do bruto (não é pago ao comercial). Comissão = 3% do líquido. Total a pagar = fixo + comissão.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-left px-3 py-2">Comercial</th>
                  <th className="text-right px-3 py-2">Bruto TM SEG</th>
                  <th className="text-right px-3 py-2">Bruto TORRES</th>
                  <th className="text-right px-3 py-2">Bruto total</th>
                  <th className="text-right px-3 py-2">Líquido (−16%)</th>
                  <th className="text-right px-3 py-2">Fixo</th>
                  <th className="text-right px-3 py-2">Comissão 3%</th>
                  <th className="text-right px-3 py-2">Bônus</th>
                  <th className="text-right px-3 py-2">Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {stats.porComercial.map((c) => (
                  <tr key={c.id} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-xs font-black uppercase">
                      {c.comercial}
                      {c.apuracao.abaixoDoPiso && <span className="ml-2 text-[9px] font-bold text-amber-700">Abaixo do piso</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.tm)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.torres)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.fat)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.resultadoLiquido)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.valorFixo)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.comissaoPercentual)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.bonusAcumulado)}</td>
                    <td className="px-3 py-2 text-right font-black">{fmtBRL(c.apuracao.totalAPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-gray-500 text-sm"><Loader2 className="animate-spin" size={16} /> Carregando comissões…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">Nenhuma comissão lançada para pagamento neste filtro. O quadro acima já lista o faturamento das faturas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-left px-3 py-2">Empresa</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">NF / OS</th>
                  <th className="text-left px-3 py-2">Fechamento</th>
                  <th className="text-right px-3 py-2">Faturamento</th>
                  <th className="text-right px-3 py-2">Imposto %</th>
                  <th className="text-right px-3 py-2">Lucro base</th>
                  <th className="text-right px-3 py-2">% Comissão</th>
                  <th className="text-right px-3 py-2">Vlr. comissão</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-center px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50" data-testid={`comissao-row-${r.id}`}>
                    <td className="px-3 py-2 text-[10px] font-black text-gray-500">{empresaLabel(r.empresa_origem)}</td>
                    <td className="px-3 py-2">
                      <div className="font-bold text-gray-900 uppercase text-xs">{r.cliente_nome || '—'}</div>
                      <div className="text-[10px] text-gray-400">{r.comerciais?.nome || '—'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.fatura_numero || r.fatura_id?.slice(0, 8) || '—'}</td>
                    <td className="px-3 py-2 text-[10px] font-bold text-gray-600">
                      <div>{fmtDate(r.data_faturamento)}</div>
                      <div className="text-gray-400 uppercase">{labelQuinzena(quinzenaDeDataFaturamento(r.data_faturamento))}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(Number(r.valor_faturamento))}</td>
                    <td className="px-3 py-2 text-right">{Number(r.percentual_imposto_aplicado).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(Number(r.valor_base_liquida))}</td>
                    <td className="px-3 py-2 text-right">{Number(r.percentual_comissao_aplicado).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-black">{fmtBRL(Number(r.valor_comissao))}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${STATUS_BADGE[r.status]}`}>
                        {COMISSAO_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.status === 'LIBERADO_PARA_PAGAMENTO' && (
                        <button type="button" onClick={() => { setPaying(r); setFile(null); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase" data-testid={`btn-pagar-${r.id}`}>
                          <Wallet size={12} /> Pagar comissão
                        </button>
                      )}
                      {r.status === 'PAGO' && r.comprovante_url && (
                        <a href={r.comprovante_url} target="_blank" rel="noreferrer" className="text-[10px] font-black text-green-700 uppercase inline-flex items-center gap-1">
                          <Receipt size={12} /> Comprovante
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {paying && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="modal-pagar-comissao">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm uppercase">Pagar comissão</h3>
              <button type="button" onClick={() => setPaying(null)}><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-700">{paying.cliente_nome} · {fmtBRL(Number(paying.valor_comissao))}</p>
            {paying.comerciais?.pix_chave && (
              <p className="text-xs text-gray-500 flex items-center gap-1"><Landmark size={12} /> PIX: {paying.comerciais.pix_chave}</p>
            )}
            <label className="block text-[10px] font-black text-gray-400 uppercase">
              Comprovante
              <input type="file" className="mt-1 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="input-comprovante-comissao" />
            </label>
            <button type="button" disabled={savingPay} onClick={() => void confirmarPagamento()} className="w-full bg-red-600 text-white rounded-lg py-2.5 text-xs font-black uppercase disabled:opacity-50">
              {savingPay ? 'Confirmando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComissoesComerciaisPage;
