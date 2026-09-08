import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign, Filter, Loader2, Receipt,
  Wallet, X, UserPlus, Landmark,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { fetchAllPages } from '../lib/supabasePaging';
import {
  calcularComissao,
  COMISSAO_STATUS_LABEL,
  type ComissaoStatus,
} from '../lib/comissao/comissaoCalc';
import { registrarPagamentoComissao } from '../lib/comissao/comissaoService';

type Comercial = { id: string; nome: string; email?: string | null; telefone?: string | null; pix_chave?: string | null; ativo?: boolean };

type ComissaoRow = {
  id: string;
  fatura_id: string | null;
  fatura_numero: string | null;
  cliente_id: number | null;
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

const STATUS_BADGE: Record<ComissaoStatus, string> = {
  AGUARDANDO_PAGAMENTO_CLIENTE: 'bg-amber-50 text-amber-800 border-amber-200',
  LIBERADO_PARA_PAGAMENTO: 'bg-blue-50 text-blue-800 border-blue-200',
  PAGO: 'bg-green-50 text-green-800 border-green-200',
  CANCELADO: 'bg-gray-100 text-gray-500 border-gray-200',
};

const ComissoesComerciaisPage: React.FC = () => {
  const { showNotification } = useNotification();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [comercialId, setComercialId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ComissaoStatus>('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ComissaoRow[]>([]);
  const [comerciais, setComerciais] = useState<Comercial[]>([]);
  const [paying, setPaying] = useState<ComissaoRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [savingPay, setSavingPay] = useState(false);
  const [showCadastro, setShowCadastro] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novoPix, setNovoPix] = useState('');
  const [savingComercial, setSavingComercial] = useState(false);

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);

  const loadComerciais = useCallback(async () => {
    const { data, error } = await supabase.from('comerciais').select('id, nome, email, telefone, pix_chave, ativo').order('nome');
    if (error) throw new Error(error.message);
    setComerciais((data || []) as Comercial[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadComerciais();
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
        const { data, error, count } = await q;
        return { data: data as ComissaoRow[] | null, error, count };
      });
      setRows(result.rows);
      if (!result.complete) {
        showNotification('Consulta incompleta', 'Nem todas as comissões do período foram carregadas.', 'warning');
      }
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao carregar comissões', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, comercialId, statusFilter, loadComerciais, showNotification]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const fat = rows.reduce((s, r) => s + Number(r.valor_faturamento || 0), 0);
    const imposto = rows.reduce((s, r) => s + calcularComissao(Number(r.valor_faturamento), Number(r.percentual_imposto_aplicado), 0).valorImposto, 0);
    const base = rows.reduce((s, r) => s + Number(r.valor_base_liquida || 0), 0);
    const lib = rows.filter((r) => r.status === 'LIBERADO_PARA_PAGAMENTO').reduce((s, r) => s + Number(r.valor_comissao || 0), 0);
    const pago = rows.filter((r) => r.status === 'PAGO').reduce((s, r) => s + Number(r.valor_comissao || 0), 0);
    return { fat, imposto, base, lib, pago, qtd: rows.length };
  }, [rows]);

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

  const salvarComercial = async () => {
    if (!novoNome.trim()) {
      showNotification('Nome', 'Informe o nome do comercial.', 'warning');
      return;
    }
    setSavingComercial(true);
    try {
      const { error } = await supabase.from('comerciais').insert({
        nome: novoNome.trim(),
        email: novoEmail.trim() || null,
        pix_chave: novoPix.trim() || null,
        ativo: true,
      });
      if (error) throw error;
      showNotification('Salvo', 'Comercial cadastrado.', 'success');
      setNovoNome('');
      setNovoEmail('');
      setNovoPix('');
      await loadComerciais();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao cadastrar comercial', 'error');
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
          <p className="text-xs text-gray-500 font-medium">Faturamento → baixa do cliente → pagamento ao comercial (16% imposto / 3% sobre o líquido, salvo regra específica).</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCadastro((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50"
          data-testid="btn-toggle-cadastro-comercial"
        >
          <UserPlus size={14} /> {showCadastro ? 'Fechar cadastro' : 'Cadastrar comercial'}
        </button>
      </div>

      {showCadastro && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="cadastro-comercial">
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Nome *" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} data-testid="input-comercial-nome" />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="E-mail" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Chave PIX" value={novoPix} onChange={(e) => setNovoPix(e.target.value)} />
          <button type="button" disabled={savingComercial} onClick={() => void salvarComercial()} className="bg-black text-white rounded-lg px-3 py-2 text-xs font-black uppercase disabled:opacity-50">
            {savingComercial ? 'Salvando…' : 'Salvar comercial'}
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
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Faturamento acumulado</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(stats.fat)}</p>
          <p className="text-[10px] text-gray-400">{stats.qtd} fatura(s)</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Impostos retidos</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(stats.imposto)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Margem líquida (lucro base)</p>
          <p className="text-lg font-black text-gray-900">{fmtBRL(stats.base)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase">Liberadas × pagas</p>
          <p className="text-sm font-black text-blue-700">{fmtBRL(stats.lib)}</p>
          <p className="text-sm font-black text-green-700">{fmtBRL(stats.pago)}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-gray-500 text-sm"><Loader2 className="animate-spin" size={16} /> Carregando comissões…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">Nenhuma comissão neste filtro. Vincule um comercial no cadastro do cliente e emita a NF.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">NF / OS</th>
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
                    <td className="px-3 py-2">
                      <div className="font-bold text-gray-900 uppercase text-xs">{r.cliente_nome || '—'}</div>
                      <div className="text-[10px] text-gray-400">{r.comerciais?.nome || '—'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.fatura_numero || r.fatura_id?.slice(0, 8) || '—'}</td>
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
