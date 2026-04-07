import { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { formatDateTimeBR } from '../lib/dateUtils';
import { supabase } from '../lib/supabase';
import {
  FileText, Search, Filter, RefreshCw, ExternalLink, Copy, CheckCircle2,
  AlertCircle, Clock, XCircle, DollarSign, Receipt, Eye, Loader2,
  Calendar, Building2, Hash, ArrowUpDown, ChevronDown, ChevronUp,
  Ban, CreditCard, QrCode, Barcode, Download, X, ImageIcon, Trash2
} from 'lucide-react';

interface Invoice {
  id: string;
  client: string;
  number: string;
  amount: number;
  date: string;
  status: string;
  notes: string;
  created_by: string;
  created_at: string;
  nf_image_url?: string;
  boleto_image_url?: string;
  provider?: string;
  issuer_company?: string;
  boleto_due_date?: string;
  asaas_payment_id?: string;
  asaas_status?: string;
  asaas_invoice_url?: string;
  asaas_bankslip_url?: string;
  asaas_pix_payload?: string;
  asaas_barcode?: string;
}

type StatusFilter = 'ALL' | 'EMITIDA' | 'PAGA' | 'VENCIDA' | 'CANCELADA';
type SortField = 'date' | 'amount' | 'number' | 'client' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  EMITIDA: { label: 'Em Aberto', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock },
  PAGA: { label: 'Paga', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  VENCIDA: { label: 'Vencida', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle },
  CANCELADA: { label: 'Cancelada', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', icon: XCircle },
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => {
  if (!d) return '-';
  const dt = new Date(d + (d.length === 10 ? 'T12:00:00' : ''));
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const FinancialInvoiceControl: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      await authFetch('/api/supabase/init-invoices', { method: 'POST' });
      const { data, error } = await supabase
        .from('financial_invoices')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const now = new Date();
        const updated: Invoice[] = (data as Invoice[]).map(inv => {
          if (inv.status === 'EMITIDA' && inv.boleto_due_date) {
            const due = new Date(inv.boleto_due_date + 'T23:59:59');
            if (now > due) return { ...inv, status: 'VENCIDA' };
          }
          return inv;
        });
        setInvoices(updated);
      }
    } catch (e: any) {
      console.error('[InvoiceControl] Fetch error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSyncStatus = async (inv: Invoice) => {
    if (!inv.asaas_payment_id) return;
    setSyncingId(inv.id);
    try {
      const res = await authFetch('/api/asaas/sync-payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: inv.asaas_payment_id,
          invoiceId: inv.id,
          company: inv.issuer_company || '',
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      await fetchInvoices();
    } catch (e: any) {
      alert('Erro ao sincronizar: ' + e.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleCancelInvoice = async (inv: Invoice) => {
    if (!confirm(`Confirma o CANCELAMENTO da fatura NF ${inv.number}?\n\nIsso irá:\n- Alterar status para CANCELADA\n- Remover o título do Contas a Receber`)) return;
    setCancellingId(inv.id);
    try {
      const { error: invErr } = await supabase.from('financial_invoices').update({ status: 'CANCELADA' }).eq('id', inv.id);
      if (invErr) { alert('Erro ao cancelar fatura: ' + invErr.message); setCancellingId(null); return; }
      const { error: txErr } = await supabase.from('financial_transactions')
        .update({ status: 'CANCELLED' })
        .ilike('description', `%${inv.number}%`)
        .eq('status', 'PENDING');
      if (txErr) console.error('Erro ao cancelar lançamento vinculado:', txErr);

      if (inv.asaas_payment_id) {
        try {
          await authFetch(`/api/asaas/payment/${inv.asaas_payment_id}?company=${encodeURIComponent(inv.issuer_company || '')}`, { method: 'DELETE' });
        } catch {}
      }
      await fetchInvoices();
      setShowDetail(false);
    } catch (e: any) {
      alert('Erro ao cancelar: ' + e.message);
    } finally {
      setCancellingId(null);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const stats = useMemo(() => {
    const s = { total: invoices.length, emitida: 0, paga: 0, vencida: 0, cancelada: 0, totalEmitida: 0, totalPaga: 0, totalVencida: 0 };
    invoices.forEach(inv => {
      if (inv.status === 'EMITIDA') { s.emitida++; s.totalEmitida += inv.amount; }
      else if (inv.status === 'PAGA') { s.paga++; s.totalPaga += inv.amount; }
      else if (inv.status === 'VENCIDA') { s.vencida++; s.totalVencida += inv.amount; }
      else if (inv.status === 'CANCELADA') { s.cancelada++; }
    });
    return s;
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (statusFilter !== 'ALL') list = list.filter(i => i.status === statusFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(i =>
        i.client?.toLowerCase().includes(term) ||
        i.number?.toLowerCase().includes(term) ||
        i.provider?.toLowerCase().includes(term) ||
        i.issuer_company?.toLowerCase().includes(term) ||
        i.notes?.toLowerCase().includes(term)
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = (a.date || '').localeCompare(b.date || '');
      else if (sortField === 'amount') cmp = (a.amount || 0) - (b.amount || 0);
      else if (sortField === 'number') cmp = (a.number || '').localeCompare(b.number || '');
      else if (sortField === 'client') cmp = (a.client || '').localeCompare(b.client || '');
      else if (sortField === 'status') cmp = (a.status || '').localeCompare(b.status || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [invoices, statusFilter, searchTerm, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={10} className="text-gray-300" />;
    return sortDir === 'asc' ? <ChevronUp size={10} className="text-red-600" /> : <ChevronDown size={10} className="text-red-600" />;
  };

  const openDetail = (inv: Invoice) => { setSelectedInvoice(inv); setShowDetail(true); };

  return (
    <div className="p-4 max-w-[1600px] mx-auto" data-testid="financial-invoice-control">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <FileText size={22} className="text-red-600" /> Controle de Faturas / NF
          </h1>
          <p className="text-xs text-gray-400 font-semibold mt-1">Notas Fiscais, Boletos, Cobranças Asaas — Integrado ao Contas a Receber</p>
        </div>
        <button onClick={fetchInvoices} disabled={loading} className="flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm" data-testid="btn-refresh-invoices">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <button onClick={() => setStatusFilter(statusFilter === 'EMITIDA' ? 'ALL' : 'EMITIDA')} className={`rounded-xl p-4 border-2 transition-all text-left ${statusFilter === 'EMITIDA' ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-100 bg-white hover:border-amber-200'}`} data-testid="filter-emitida">
          <div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-amber-600" /><span className="text-[10px] font-black text-amber-600 uppercase">Em Aberto</span></div>
          <div className="text-xl font-black text-gray-900">{stats.emitida}</div>
          <div className="text-xs font-bold text-amber-600">{fmtBRL(stats.totalEmitida)}</div>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'PAGA' ? 'ALL' : 'PAGA')} className={`rounded-xl p-4 border-2 transition-all text-left ${statusFilter === 'PAGA' ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-100 bg-white hover:border-emerald-200'}`} data-testid="filter-paga">
          <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={14} className="text-emerald-600" /><span className="text-[10px] font-black text-emerald-600 uppercase">Pagas</span></div>
          <div className="text-xl font-black text-gray-900">{stats.paga}</div>
          <div className="text-xs font-bold text-emerald-600">{fmtBRL(stats.totalPaga)}</div>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'VENCIDA' ? 'ALL' : 'VENCIDA')} className={`rounded-xl p-4 border-2 transition-all text-left ${statusFilter === 'VENCIDA' ? 'border-red-400 bg-red-50 ring-2 ring-red-200' : 'border-gray-100 bg-white hover:border-red-200'}`} data-testid="filter-vencida">
          <div className="flex items-center gap-2 mb-1"><AlertCircle size={14} className="text-red-600" /><span className="text-[10px] font-black text-red-600 uppercase">Vencidas</span></div>
          <div className="text-xl font-black text-gray-900">{stats.vencida}</div>
          <div className="text-xs font-bold text-red-600">{fmtBRL(stats.totalVencida)}</div>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'CANCELADA' ? 'ALL' : 'CANCELADA')} className={`rounded-xl p-4 border-2 transition-all text-left ${statusFilter === 'CANCELADA' ? 'border-gray-400 bg-gray-100 ring-2 ring-gray-300' : 'border-gray-100 bg-white hover:border-gray-300'}`} data-testid="filter-cancelada">
          <div className="flex items-center gap-2 mb-1"><XCircle size={14} className="text-gray-400" /><span className="text-[10px] font-black text-gray-400 uppercase">Canceladas</span></div>
          <div className="text-xl font-black text-gray-900">{stats.cancelada}</div>
          <div className="text-xs font-bold text-gray-400">—</div>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="p-3 flex flex-wrap items-center gap-3 border-b border-gray-50">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input type="text" placeholder="Buscar por cliente, NF, fornecedor..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} data-testid="input-search-invoices" />
          </div>
          {statusFilter !== 'ALL' && (
            <button onClick={() => setStatusFilter('ALL')} className="text-[10px] font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-1">
              <X size={10} /> Limpar filtro: {STATUS_CONFIG[statusFilter]?.label}
            </button>
          )}
          <span className="text-[10px] font-bold text-gray-400">{filtered.length} fatura(s)</span>
        </div>

        {loading ? (
          <div className="p-16 text-center"><Loader2 size={32} className="animate-spin mx-auto text-red-400 mb-2" /><p className="text-sm text-gray-400 font-bold">Carregando faturas...</p></div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center"><FileText size={40} className="mx-auto text-gray-200 mb-3" /><p className="text-sm text-gray-400 font-bold">Nenhuma fatura encontrada</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase cursor-pointer select-none" onClick={() => toggleSort('status')}>
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase cursor-pointer select-none" onClick={() => toggleSort('number')}>
                    <span className="flex items-center gap-1">NF <SortIcon field="number" /></span>
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase cursor-pointer select-none" onClick={() => toggleSort('client')}>
                    <span className="flex items-center gap-1">Cliente <SortIcon field="client" /></span>
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-gray-400 uppercase cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                    <span className="flex items-center gap-1 justify-end">Valor <SortIcon field="amount" /></span>
                  </th>
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase cursor-pointer select-none" onClick={() => toggleSort('date')}>
                    <span className="flex items-center gap-1 justify-center">Emissão <SortIcon field="date" /></span>
                  </th>
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Vencimento</th>
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Emissora</th>
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Asaas</th>
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Docs</th>
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, idx) => {
                  const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG['EMITIDA'];
                  const StatusIcon = cfg.icon;
                  const isOverdue = inv.status === 'VENCIDA';
                  return (
                    <tr key={inv.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isOverdue ? 'bg-red-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} data-testid={`invoice-row-${inv.id}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                          <StatusIcon size={10} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-900 text-xs">{inv.number}</td>
                      <td className="px-4 py-3 font-bold text-gray-800 text-xs uppercase">{inv.client}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-gray-900">{fmtBRL(inv.amount)}</td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">{fmtDate(inv.date)}</td>
                      <td className="px-4 py-3 text-center text-xs">
                        {inv.boleto_due_date ? (
                          <span className={isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}>{fmtDate(inv.boleto_due_date)}</span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">{inv.issuer_company || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {inv.asaas_payment_id ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                            <CreditCard size={9} /> {inv.asaas_status || 'PENDING'}
                          </span>
                        ) : <span className="text-[10px] text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {inv.nf_image_url && (
                            <button onClick={() => setShowImageModal(inv.nf_image_url!)} className="text-blue-500 hover:text-blue-700" title="Ver NF"><ImageIcon size={14} /></button>
                          )}
                          {inv.boleto_image_url && (
                            <button onClick={() => setShowImageModal(inv.boleto_image_url!)} className="text-orange-500 hover:text-orange-700" title="Ver Boleto"><Receipt size={14} /></button>
                          )}
                          {!inv.nf_image_url && !inv.boleto_image_url && <span className="text-gray-300 text-[10px]">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openDetail(inv)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-1.5 rounded-lg" title="Detalhes" data-testid={`btn-detail-${inv.id}`}><Eye size={13} /></button>
                          {inv.asaas_payment_id && (
                            <button onClick={() => handleSyncStatus(inv)} disabled={syncingId === inv.id} className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-1.5 rounded-lg" title="Sincronizar status" data-testid={`btn-sync-${inv.id}`}>
                              {syncingId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                            </button>
                          )}
                          {inv.status !== 'CANCELADA' && inv.status !== 'PAGA' && (
                            <button onClick={() => handleCancelInvoice(inv)} disabled={cancellingId === inv.id} className="bg-red-50 hover:bg-red-100 text-red-500 p-1.5 rounded-lg" title="Cancelar" data-testid={`btn-cancel-${inv.id}`}>
                              {cancellingId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDetail && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in">
            <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-red-900 to-red-800">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-red-300" />
                <h3 className="font-black text-white uppercase text-xs tracking-widest">Detalhes da Fatura — NF {selectedInvoice.number}</h3>
              </div>
              <button onClick={() => setShowDetail(false)} data-testid="btn-close-detail"><X size={20} className="text-red-300 hover:text-white" /></button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
              {(() => {
                const inv = selectedInvoice;
                const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG['EMITIDA'];
                const StatusIcon = cfg.icon;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                        <StatusIcon size={14} /> {cfg.label}
                      </span>
                      <span className="text-2xl font-black text-gray-900">{fmtBRL(inv.amount)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div><p className="text-[9px] font-black text-gray-400 uppercase">Cliente</p><p className="text-sm font-bold text-gray-900 uppercase">{inv.client}</p></div>
                        <div><p className="text-[9px] font-black text-gray-400 uppercase">Nº Nota Fiscal</p><p className="text-sm font-mono font-bold text-gray-900">{inv.number}</p></div>
                        <div><p className="text-[9px] font-black text-gray-400 uppercase">Data Emissão</p><p className="text-sm font-bold text-gray-700">{fmtDate(inv.date)}</p></div>
                      </div>
                      <div className="space-y-3">
                        <div><p className="text-[9px] font-black text-gray-400 uppercase">Empresa Emissora</p><p className="text-sm font-bold text-gray-900 uppercase">{inv.issuer_company || '-'}</p></div>
                        <div><p className="text-[9px] font-black text-gray-400 uppercase">Fornecedor / Prestador</p><p className="text-sm font-bold text-gray-700 uppercase">{inv.provider || '-'}</p></div>
                        <div><p className="text-[9px] font-black text-gray-400 uppercase">Vencimento Boleto</p><p className={`text-sm font-bold ${inv.status === 'VENCIDA' ? 'text-red-600' : 'text-gray-700'}`}>{inv.boleto_due_date ? fmtDate(inv.boleto_due_date) : '-'}</p></div>
                      </div>
                    </div>

                    {inv.notes && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Observações</p>
                        <p className="text-xs text-gray-600">{inv.notes}</p>
                      </div>
                    )}

                    {inv.asaas_payment_id && (
                      <div className="border border-green-200 rounded-xl p-4 bg-green-50/50 space-y-3">
                        <p className="text-[9px] font-black text-green-700 uppercase tracking-widest flex items-center gap-1.5"><CreditCard size={10} /> Dados da Cobrança Asaas</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div><span className="text-gray-400 font-bold">ID:</span> <span className="font-mono text-gray-700">{inv.asaas_payment_id}</span></div>
                          <div><span className="text-gray-400 font-bold">Status:</span> <span className="font-bold text-green-700">{inv.asaas_status || '-'}</span></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inv.asaas_invoice_url && (
                            <a href={inv.asaas_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100">
                              <ExternalLink size={10} /> Fatura Online
                            </a>
                          )}
                          {inv.asaas_bankslip_url && (
                            <a href={inv.asaas_bankslip_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 hover:bg-orange-100">
                              <Download size={10} /> Boleto PDF
                            </a>
                          )}
                        </div>
                        {inv.asaas_barcode && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1"><Barcode size={9} /> Linha Digitável</span>
                              <button onClick={() => copyToClipboard(inv.asaas_barcode!, 'barcode')} className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                {copiedField === 'barcode' ? <><CheckCircle2 size={9} /> Copiado!</> : <><Copy size={9} /> Copiar</>}
                              </button>
                            </div>
                            <p className="text-xs font-mono text-gray-700 break-all leading-relaxed">{inv.asaas_barcode}</p>
                          </div>
                        )}
                        {inv.asaas_pix_payload && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1"><QrCode size={9} /> PIX Copia e Cola</span>
                              <button onClick={() => copyToClipboard(inv.asaas_pix_payload!, 'pix')} className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                {copiedField === 'pix' ? <><CheckCircle2 size={9} /> Copiado!</> : <><Copy size={9} /> Copiar</>}
                              </button>
                            </div>
                            <p className="text-[10px] font-mono text-gray-600 break-all leading-relaxed max-h-16 overflow-y-auto">{inv.asaas_pix_payload}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {inv.nf_image_url && inv.nf_image_url.includes('asaas.com') ? (
                        <a href={inv.nf_image_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-100" data-testid="link-nf-pdf">
                          <FileText size={12} /> NF PDF
                        </a>
                      ) : inv.nf_image_url ? (
                        <button onClick={() => setShowImageModal(inv.nf_image_url!)} className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-100">
                          <ImageIcon size={12} /> Ver Nota Fiscal
                        </button>
                      ) : null}
                      {inv.boleto_image_url && (
                        <button onClick={() => setShowImageModal(inv.boleto_image_url!)} className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-200 hover:bg-orange-100">
                          <Receipt size={12} /> Ver Boleto
                        </button>
                      )}
                      {inv.asaas_payment_id && inv.status !== 'PAGA' && inv.status !== 'CANCELADA' && (
                        <button onClick={() => handleSyncStatus(inv)} disabled={syncingId === inv.id} className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-100">
                          {syncingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sincronizar Status
                        </button>
                      )}
                      {inv.status !== 'CANCELADA' && inv.status !== 'PAGA' && (
                        <button onClick={() => handleCancelInvoice(inv)} disabled={cancellingId === inv.id} className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 hover:bg-red-100 ml-auto">
                          {cancellingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} Cancelar Fatura
                        </button>
                      )}
                    </div>

                    <div className="border-t pt-3 text-[10px] text-gray-400 flex justify-between">
                      <span>Criado por: {inv.created_by || '-'}</span>
                      <span>Em: {formatDateTimeBR(inv.created_at)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showImageModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowImageModal(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowImageModal(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg z-10"><X size={18} className="text-gray-600" /></button>
            <img src={showImageModal} alt="Documento" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialInvoiceControl;
