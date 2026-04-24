import { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { formatDateTimeBR } from '../lib/dateUtils';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import {
  FileText, Search, Filter, RefreshCw, ExternalLink, Copy, CheckCircle2,
  AlertCircle, Clock, XCircle, DollarSign, Receipt, Eye, Loader2,
  Calendar, Building2, Hash, ArrowUpDown, ChevronDown, ChevronUp,
  Ban, CreditCard, QrCode, Barcode, Download, X, ImageIcon, Trash2,
  Mail, Send
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
  nf_status?: string;
  nf_number?: string;
  nf_retry_at?: string;
  nf_last_error?: string;
  nf_retry_count?: number;
  nf_retry_paused?: boolean;
  nf_history?: NfHistoryEntry[];
  nf_provider?: string;
  plugnotas_invoice_id?: string;
  plugnotas_protocol?: string;
}

interface NfHistoryEntry {
  ts: string;
  action: string;
  status?: string | null;
  message?: string | null;
}

const HISTORY_ACTION_LABEL: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  'authorized': { label: 'Autorizada', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  'scheduled': { label: 'Agendada', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Clock },
  'cancel-and-reschedule': { label: 'Cancelada e reagendada', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', icon: RefreshCw },
  'cancel-and-reschedule-failed': { label: 'Falha ao reagendar', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle },
  'cancel-blocked': { label: 'Cancelamento bloqueado', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Ban },
  'schedule-failed': { label: 'Falha ao agendar', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle },
  'paused-validation': { label: 'Pausada (validação)', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: AlertCircle },
  'stuck-alert': { label: 'TRAVADA — alerta', color: 'text-white', bg: 'bg-red-600', border: 'border-red-700', icon: AlertCircle },
  'lookup-error': { label: 'Falha de consulta', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', icon: AlertCircle },
  'provider-failover': { label: 'Failover Asaas → PlugNotas', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: RefreshCw },
};

interface ProviderPreferences {
  [companyKey: string]: 'ASAAS' | 'PLUGNOTAS';
}

interface PlugNotasCompany { key: string; name: string; cnpj: string; }

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
  const [retryingNfId, setRetryingNfId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [showRetroModal, setShowRetroModal] = useState(false);
  const [retroForm, setRetroForm] = useState({ client: '', number: '', amount: '', date: '', dueDate: '', notes: '', issuer_company: 'TM GESTÃO' });
  const [savingRetro, setSavingRetro] = useState(false);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [issuerSummary, setIssuerSummary] = useState<Array<{ company: string; total: number; authorized: number; synchronized: number; scheduled: number; error: number; stuck: number; canceled: number; other: number; asaas?: number; plugnotas?: number }>>([]);
  const [issuerFilter, setIssuerFilter] = useState<string | null>(null);
  const [issuerStateFilter, setIssuerStateFilter] = useState<'total' | 'authorized' | 'scheduled' | 'stuck' | null>(null);
  const [providerPrefs, setProviderPrefs] = useState<ProviderPreferences>({});
  const [plugnotasCompanies, setPlugnotasCompanies] = useState<PlugNotasCompany[]>([]);
  const [plugnotasConfigured, setPlugnotasConfigured] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [reissuePlugnotasId, setReissuePlugnotasId] = useState<string | null>(null);
  const [providerByPipeline, setProviderByPipeline] = useState<Record<string, { total: number; authorized: number; error: number; stuck: number; processing: number }>>({});

  const fetchIssuerSummary = useCallback(async () => {
    try {
      const res = await authFetch('/api/nf/summary');
      const data = await res.json();
      if (data?.success && Array.isArray(data.summary)) {
        setIssuerSummary(data.summary);
      }
      if (data?.byProvider) setProviderByPipeline(data.byProvider);
    } catch (e) {
      console.error('[InvoiceControl] Summary fetch error', e);
    }
  }, []);

  const fetchProviderPreferences = useCallback(async () => {
    try {
      const res = await authFetch('/api/nf/provider-preferences');
      const data = await res.json();
      if (data?.success) {
        setProviderPrefs(data.preferences || {});
        setPlugnotasCompanies(Array.isArray(data.companies) ? data.companies : []);
        setPlugnotasConfigured(!!data.plugnotasConfigured);
      }
    } catch (e) {
      console.error('[InvoiceControl] Provider prefs fetch error', e);
    }
  }, []);

  const handleSaveProviderPrefs = async (newPrefs: ProviderPreferences) => {
    setSavingPrefs(true);
    try {
      const res = await authFetch('/api/nf/provider-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: newPrefs }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao salvar preferências');
      setProviderPrefs(newPrefs);
    } catch (e: any) {
      alert('Erro ao salvar preferências: ' + e.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleReissueViaPlugNotas = async (inv: Invoice) => {
    if (!plugnotasConfigured) {
      alert('PlugNotas ainda não está configurado — defina o token nas configurações do projeto antes de fazer failover.');
      return;
    }
    if (!confirm(
      `Reemitir esta NF via PlugNotas?\n\n` +
      `• Cliente: ${inv.client}\n` +
      `• NF: ${inv.number}\n` +
      `• Valor: ${fmtBRL(inv.amount)}\n` +
      `• Emissora: ${inv.issuer_company || '—'}\n\n` +
      `O sistema vai tentar CANCELAR a NF Asaas atual (se existir) e emitir uma nova pelo PlugNotas. ` +
      `Use isso quando o Asaas estiver travado e você precisar liberar a NF agora.`
    )) return;
    setReissuePlugnotasId(inv.id);
    try {
      const res = await authFetch(`/api/nf/reissue-plugnotas/${inv.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao reemitir');
      const lines = [
        '✅ NF enviada ao PlugNotas!',
        `Status: ${data.status || 'PROCESSING'}`,
        `ID: ${data.plugnotasId || data.idIntegracao}`,
      ];
      if (data.asaasCancelled) lines.push('• NF Asaas anterior foi cancelada.');
      else if (data.asaasCancelError) lines.push(`• Atenção: não foi possível cancelar NF Asaas (${data.asaasCancelError}). Verifique no painel Asaas.`);
      alert(lines.join('\n'));
      await fetchInvoices();
      await fetchIssuerSummary();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setReissuePlugnotasId(null);
    }
  };

  const handleBulkRetryNfs = async () => {
    if (!confirm('Reemitir TODAS as NFs pendentes agora?\n\nIsso vai:\n• Tentar autorizar NFs em ERRO\n• Cancelar e reagendar NFs travadas em SYNCHRONIZED há > 6h\n• Marcar como TRAVADA e pausar as que estão em SYNCHRONIZED há > 24h')) return;
    setBulkRetrying(true);
    try {
      const res = await authFetch('/api/nf/retry-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao executar ciclo.');
      const parts = [
        `${data.processed || 0} fatura(s) processada(s)`,
        `✓ ${data.ok || 0} OK`,
        `⏸ ${data.paused || 0} pausada(s)`,
        `🚨 ${data.stuck || 0} travada(s)`,
        `✗ ${data.errors || 0} erro(s)`,
      ];
      alert('Ciclo de reemissão concluído!\n\n' + parts.join('\n'));
      await fetchInvoices();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setBulkRetrying(false);
    }
  };

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

  useEffect(() => { fetchInvoices(); fetchIssuerSummary(); fetchProviderPreferences(); }, [fetchInvoices, fetchIssuerSummary, fetchProviderPreferences]);

  useRealtimeRefresh('financial_invoices', () => { fetchInvoices(); fetchIssuerSummary(); });

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
      const parts: string[] = [`Pagamento: ${result.statusBr || result.status}`];
      if (result.nfStatus) {
        const nfLabel = result.nfStatus === 'AUTHORIZED' ? 'Autorizada'
          : result.nfStatus === 'SCHEDULED' ? 'Agendada'
          : result.nfStatus === 'PROCESSING' ? 'Processando'
          : result.nfStatus === 'CANCELED' ? 'Cancelada'
          : result.nfStatus;
        parts.push(`NF: ${nfLabel}${result.nfNumber ? ` (Nº ${result.nfNumber})` : ''}`);
      }
      if (result.nfPdfUrl) parts.push('NF PDF atualizado');
      parts.push(`Boleto: ${result.hasBoleto ? 'Disponível ✓' : 'Pendente ✗'}`);
      parts.push(`NF Fiscal: ${result.hasNf ? 'Disponível ✓' : 'Pendente ✗'}`);
      if (result.emailReady) parts.push('\n📧 Email pronto para envio!');
      alert(`Sincronizado!\n${parts.join('\n')}`);
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

  const handleRetryNf = async (inv: Invoice) => {
    if (!inv.asaas_payment_id) return;
    if (!confirm(`Reemitir Nota Fiscal da fatura ${inv.number}?`)) return;
    setRetryingNfId(inv.id);
    try {
      const res = await authFetch(`/api/nf/retry/${inv.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`NF reagendada com sucesso. Status atual: ${data.status || 'pendente — aguarde o ciclo de retry'}.`);
      } else if (data.paused) {
        alert(`NF pausada por erro permanente: ${data.error || 'verifique a descrição do serviço cadastrada para o cliente'}.`);
      } else {
        alert(`Não foi possível reemitir agora: ${data.error || data.status || 'erro desconhecido'}.`);
      }
      await fetchInvoices();
    } catch (e: any) {
      alert('Erro ao reemitir NF: ' + e.message);
    } finally {
      setRetryingNfId(null);
    }
  };

  const handleSendEmail = async (inv: Invoice) => {
    const clientEmail = prompt('E-mail do cliente para envio da cobrança:');
    if (!clientEmail || !clientEmail.includes('@')) {
      if (clientEmail !== null) alert('E-mail inválido.');
      return;
    }
    if (!confirm(`Enviar email de cobrança para:\n${clientEmail}\n\nFatura: NF ${inv.number}\nValor: ${fmtBRL(inv.amount)}\nCliente: ${inv.client}`)) return;
    setSendingEmailId(inv.id);
    try {
      const res = await authFetch('/api/asaas/send-billing-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: inv.asaas_payment_id,
          clientName: inv.client,
          clientEmail,
          value: inv.amount,
          dueDate: inv.boleto_due_date || inv.date,
          invoiceNumber: inv.number,
          issuerCompany: inv.issuer_company || '',
          description: `Cobrança ref. NF ${inv.number}`,
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const details: string[] = ['Email enviado com sucesso!'];
      if (result.boletoIncluded) details.push('✓ Boleto incluído');
      if (result.nfIncluded) details.push('✓ Nota Fiscal incluída');
      if (result.pixIncluded) details.push('✓ PIX incluído');
      alert(details.join('\n'));
    } catch (e: any) {
      alert('Erro ao enviar email: ' + e.message);
    } finally {
      setSendingEmailId(null);
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
    if (issuerFilter) {
      list = list.filter(i => (i.issuer_company || '(sem emissora)') === issuerFilter);
    }
    if (issuerStateFilter) {
      const now = Date.now();
      list = list.filter(i => {
        if (!i.asaas_payment_id) return false;
        const ns = (i.nf_status || '').toUpperCase();
        if (issuerStateFilter === 'total') return true;
        if (issuerStateFilter === 'authorized') return ns === 'AUTHORIZED';
        if (issuerStateFilter === 'scheduled') return ns === 'SCHEDULED';
        if (issuerStateFilter === 'stuck') {
          if (ns === 'STUCK') return true;
          if (ns === 'SYNCHRONIZED') {
            const ref = i.nf_retry_at || i.created_at;
            const ageH = ref ? (now - new Date(ref).getTime()) / 3600_000 : 0;
            return ageH >= 24;
          }
          return false;
        }
        return true;
      });
    }
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
  }, [invoices, statusFilter, searchTerm, sortField, sortDir, issuerFilter, issuerStateFilter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={10} className="text-gray-300" />;
    return sortDir === 'asc' ? <ChevronUp size={10} className="text-red-600" /> : <ChevronDown size={10} className="text-red-600" />;
  };

  const openDetail = (inv: Invoice) => { setSelectedInvoice(inv); setShowDetail(true); };

  const handleSaveRetro = async () => {
    if (!retroForm.client.trim() || !retroForm.amount || !retroForm.date) {
      alert('Preencha: Cliente, Valor e Data de Emissão.');
      return;
    }
    setSavingRetro(true);
    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const nfNumber = retroForm.number.trim() || `RETRO-${Date.now()}`;
      const invoicePayload = {
        client: retroForm.client.trim(),
        number: nfNumber,
        amount: parseFloat(retroForm.amount.replace(/\./g, '').replace(',', '.')) || 0,
        date: retroForm.date,
        boleto_due_date: retroForm.dueDate || retroForm.date,
        status: 'EMITIDA',
        notes: `[RETROATIVO - Sem NF] ${retroForm.notes || ''}`.trim(),
        created_by: userData?.name || 'Sistema',
        issuer_company: retroForm.issuer_company || 'TM GESTÃO',
      };
      const { error } = await supabase.from('financial_invoices').insert(invoicePayload).select();
      if (error) throw error;

      const txPayload = {
        description: `Fatura retroativa: ${retroForm.client.trim()} — ${nfNumber}`,
        amount: invoicePayload.amount,
        type: 'INCOME' as const,
        status: 'PENDING' as const,
        due_date: retroForm.dueDate || retroForm.date,
        entity_name: retroForm.client.trim(),
        entity_type: 'client' as const,
        payment_method: 'boleto',
        category_name: 'Faturamento',
        created_by: userData?.name || 'Sistema',
      };
      await supabase.from('financial_transactions').insert(txPayload);

      setShowRetroModal(false);
      setRetroForm({ client: '', number: '', amount: '', date: '', dueDate: '', notes: '', issuer_company: 'TM GESTÃO' });
      await fetchInvoices();
      alert('Fatura retroativa lançada com sucesso!');
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSavingRetro(false);
    }
  };

  return (
    <div className="p-4 max-w-[1600px] mx-auto" data-testid="financial-invoice-control">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <FileText size={22} className="text-red-600" /> Controle de Faturas / NF
          </h1>
          <p className="text-xs text-gray-400 font-semibold mt-1">Notas Fiscais, Boletos, Cobranças Asaas — Integrado ao Contas a Receber</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBulkRetryNfs} disabled={bulkRetrying} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm disabled:opacity-60" data-testid="btn-bulk-retry-nfs" title="Executa o ciclo do worker imediatamente — cancela e reagenda NFs travadas">
            {bulkRetrying ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Reemitir TODAS NFs pendentes
          </button>
          <button onClick={() => setShowRetroModal(true)} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm" data-testid="btn-retro-invoice">
            <Calendar size={14} /> Lançar Retroativo
          </button>
          <button onClick={() => { fetchInvoices(); fetchIssuerSummary(); }} disabled={loading} className="flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm" data-testid="btn-refresh-invoices">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {issuerSummary.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6" data-testid="issuer-health-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-red-600" />
              <span className="text-[11px] font-black text-gray-700 uppercase tracking-wide">Saúde das emissoras de NF</span>
            </div>
            {(issuerFilter || issuerStateFilter) && (
              <button
                onClick={() => { setIssuerFilter(null); setIssuerStateFilter(null); }}
                className="text-[10px] font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-1"
                data-testid="btn-clear-issuer-filter"
              >
                <X size={10} /> Limpar emissora{issuerFilter ? `: ${issuerFilter}` : ''}{issuerStateFilter ? ` / ${issuerStateFilter}` : ''}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {issuerSummary.map(s => {
              const stuckTotal = (s.stuck || 0);
              const isActive = issuerFilter === s.company;
              const toggle = (state: 'total' | 'authorized' | 'scheduled' | 'stuck') => {
                if (issuerFilter === s.company && issuerStateFilter === state) {
                  setIssuerFilter(null); setIssuerStateFilter(null);
                } else {
                  setIssuerFilter(s.company); setIssuerStateFilter(state);
                }
              };
              const cell = (label: string, value: number, state: 'total' | 'authorized' | 'scheduled' | 'stuck', cls: string, blink = false) => (
                <button
                  onClick={() => toggle(state)}
                  className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 border transition-all ${cls} ${isActive && issuerStateFilter === state ? 'ring-2 ring-offset-1 ring-gray-700' : ''} ${blink && value > 0 ? 'animate-pulse' : ''}`}
                  data-testid={`issuer-cell-${s.company}-${state}`}
                  title={`${s.company} — ${label}`}
                >
                  <span className="text-[8px] font-black uppercase opacity-80">{label}</span>
                  <span className="text-base font-black leading-tight">{value}</span>
                </button>
              );
              return (
                <div
                  key={s.company}
                  className={`rounded-xl p-3 border-2 transition-all ${isActive ? 'border-red-400 bg-red-50/30' : stuckTotal > 0 ? 'border-red-200 bg-red-50/20' : 'border-gray-100 bg-white'}`}
                  data-testid={`issuer-card-${s.company}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-black text-gray-800 uppercase tracking-wide truncate" title={s.company}>{s.company}</div>
                    {stuckTotal > 0 && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-white bg-red-600 px-2 py-0.5 rounded-full animate-pulse">
                        <AlertCircle size={9} /> ATENÇÃO
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {cell('Total', s.total, 'total', 'text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100')}
                    {cell('Autoriz.', s.authorized, 'authorized', 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100')}
                    {cell('Em fila', s.scheduled, 'scheduled', 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100')}
                    {cell('Travadas', stuckTotal, 'stuck', 'text-white bg-red-600 border-red-700 hover:bg-red-700', true)}
                  </div>
                  {(s.asaas !== undefined || s.plugnotas !== undefined) && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200" title="Faturas emitidas via Asaas">
                        ASAAS · {s.asaas || 0}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200" title="Faturas emitidas via PlugNotas">
                        PLUGNOTAS · {s.plugnotas || 0}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card de preferências de emissora (Asaas vs PlugNotas) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6" data-testid="provider-prefs-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Send size={14} className="text-cyan-600" />
            <span className="text-[11px] font-black text-gray-700 uppercase tracking-wide">Emissora padrão de NF por empresa</span>
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${plugnotasConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${plugnotasConfigured ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            PlugNotas {plugnotasConfigured ? 'configurado' : 'não configurado'}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 mb-3">
          O <b>Asaas</b> continua emitindo o boleto e (por padrão) a NF. Marque uma empresa como <b>PlugNotas</b> apenas para emitir a NF por lá em <i>novas</i> faturas. Para reemitir uma fatura específica, use o botão "Reemitir via PlugNotas" na linha da fatura.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(plugnotasCompanies.length > 0 ? plugnotasCompanies : [{ key: 'TM GESTAO', name: 'TM GESTÃO', cnpj: '60485843000157' }, { key: 'TM SECURITY', name: 'TM SECURITY', cnpj: '60508931000127' }, { key: 'TM SEGURANCA', name: 'TM SEGURANÇA', cnpj: '28804378000167' }]).map(c => {
            const current = providerPrefs[c.key] || 'ASAAS';
            return (
              <div key={c.key} className="border border-gray-100 rounded-lg p-3" data-testid={`pref-row-${c.key}`}>
                <div className="text-[11px] font-black text-gray-800 uppercase">{c.name}</div>
                <div className="text-[9px] font-mono text-gray-400 mb-2">{c.cnpj}</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSaveProviderPrefs({ ...providerPrefs, [c.key]: 'ASAAS' })}
                    disabled={savingPrefs}
                    className={`flex-1 text-[10px] font-black px-2 py-1.5 rounded-md border transition-all ${current === 'ASAAS' ? 'bg-violet-600 text-white border-violet-700' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                    data-testid={`pref-asaas-${c.key}`}
                  >ASAAS</button>
                  <button
                    onClick={() => handleSaveProviderPrefs({ ...providerPrefs, [c.key]: 'PLUGNOTAS' })}
                    disabled={savingPrefs || !plugnotasConfigured}
                    className={`flex-1 text-[10px] font-black px-2 py-1.5 rounded-md border transition-all ${current === 'PLUGNOTAS' ? 'bg-cyan-600 text-white border-cyan-700' : 'bg-white text-cyan-700 border-cyan-200 hover:bg-cyan-50'} ${!plugnotasConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={!plugnotasConfigured ? 'Configure o token PlugNotas primeiro' : ''}
                    data-testid={`pref-plugnotas-${c.key}`}
                  >PLUGNOTAS</button>
                </div>
              </div>
            );
          })}
        </div>
        {(providerByPipeline.ASAAS?.total || providerByPipeline.PLUGNOTAS?.total) ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-violet-50 border border-violet-100 rounded-md p-2 text-[10px]">
              <span className="font-black text-violet-700 uppercase">Asaas:</span>
              <span className="ml-1 text-violet-600 font-mono">
                {providerByPipeline.ASAAS?.total || 0} totais ·{' '}
                {providerByPipeline.ASAAS?.authorized || 0} autorizadas ·{' '}
                {providerByPipeline.ASAAS?.processing || 0} fila ·{' '}
                <b className={providerByPipeline.ASAAS?.stuck ? 'text-red-600' : ''}>{providerByPipeline.ASAAS?.stuck || 0} travadas</b> ·{' '}
                {providerByPipeline.ASAAS?.error || 0} erros
              </span>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-md p-2 text-[10px]">
              <span className="font-black text-cyan-700 uppercase">PlugNotas:</span>
              <span className="ml-1 text-cyan-600 font-mono">
                {providerByPipeline.PLUGNOTAS?.total || 0} totais ·{' '}
                {providerByPipeline.PLUGNOTAS?.authorized || 0} autorizadas ·{' '}
                {providerByPipeline.PLUGNOTAS?.processing || 0} fila ·{' '}
                <b className={providerByPipeline.PLUGNOTAS?.stuck ? 'text-red-600' : ''}>{providerByPipeline.PLUGNOTAS?.stuck || 0} travadas</b> ·{' '}
                {providerByPipeline.PLUGNOTAS?.error || 0} erros
              </span>
            </div>
          </div>
        ) : null}
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
                  <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Status NF</th>
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
                      <td className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{inv.issuer_company || '-'}</span>
                          {(inv.nf_provider || (inv.plugnotas_invoice_id ? 'PLUGNOTAS' : (inv.asaas_payment_id ? 'ASAAS' : null))) && (
                            <span className={`inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-full border ${(inv.nf_provider || (inv.plugnotas_invoice_id ? 'PLUGNOTAS' : 'ASAAS')) === 'PLUGNOTAS' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`} data-testid={`provider-chip-${inv.id}`}>
                              {(inv.nf_provider || (inv.plugnotas_invoice_id ? 'PLUGNOTAS' : 'ASAAS'))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(inv.asaas_payment_id || inv.plugnotas_invoice_id) ? (() => {
                          const ns = inv.nf_status?.toUpperCase();
                          const ref = inv.nf_retry_at || inv.created_at;
                          const ageH = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 3600_000) : null;
                          const isStuckSync = ns === 'SYNCHRONIZED' && ageH !== null && ageH >= 24;
                          const effectiveStatus = isStuckSync ? 'STUCK' : ns;
                          const nfLabel = effectiveStatus === 'AUTHORIZED' ? 'Autorizada'
                            : effectiveStatus === 'SCHEDULED' ? 'Agendada'
                            : effectiveStatus === 'SYNCHRONIZED' ? 'Em fila Prefeitura'
                            : effectiveStatus === 'STUCK' ? 'TRAVADA — verificar Asaas'
                            : effectiveStatus === 'PROCESSING' ? 'Processando'
                            : effectiveStatus === 'CANCELED' ? 'Cancelada'
                            : effectiveStatus === 'ERROR' ? 'Erro'
                            : effectiveStatus === 'WAITING_CUSTOMER_ACCEPTANCE' ? 'Aguardando'
                            : effectiveStatus || 'Pendente';
                          const nfColor = effectiveStatus === 'AUTHORIZED' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : effectiveStatus === 'SCHEDULED' ? 'text-blue-600 bg-blue-50 border-blue-200'
                            : effectiveStatus === 'SYNCHRONIZED' ? 'text-indigo-600 bg-indigo-50 border-indigo-200'
                            : effectiveStatus === 'STUCK' ? 'text-white bg-red-600 border-red-700 animate-pulse'
                            : effectiveStatus === 'PROCESSING' ? 'text-amber-600 bg-amber-50 border-amber-200'
                            : effectiveStatus === 'CANCELED' || effectiveStatus === 'ERROR' ? 'text-red-600 bg-red-50 border-red-200'
                            : 'text-gray-500 bg-gray-50 border-gray-200';
                          const NfIcon = effectiveStatus === 'AUTHORIZED' ? CheckCircle2
                            : effectiveStatus === 'STUCK' ? AlertCircle
                            : effectiveStatus === 'CANCELED' || effectiveStatus === 'ERROR' ? XCircle
                            : effectiveStatus === 'PROCESSING' || effectiveStatus === 'SCHEDULED' || effectiveStatus === 'SYNCHRONIZED' ? Clock
                            : AlertCircle;
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${nfColor}`} title={inv.nf_last_error || ''}>
                                <NfIcon size={9} /> {nfLabel}
                              </span>
                              {inv.nf_number && <span className="text-[8px] text-gray-400 font-mono">Nº {inv.nf_number}</span>}
                              {(effectiveStatus === 'SYNCHRONIZED' || effectiveStatus === 'STUCK') && ageH !== null && ageH >= 1 && (
                                <span className={`text-[8px] font-bold ${isStuckSync ? 'text-red-600' : 'text-indigo-500'}`}>há {ageH}h</span>
                              )}
                            </div>
                          );
                        })() : <span className="text-[10px] text-gray-300">—</span>}
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
                          {inv.asaas_payment_id && (inv.nf_status?.toUpperCase() === 'ERROR' || (!inv.nf_image_url && inv.nf_status?.toUpperCase() !== 'AUTHORIZED')) && (
                            <button
                              onClick={() => handleRetryNf(inv)}
                              disabled={retryingNfId === inv.id}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-700 p-1.5 rounded-lg"
                              title="Reemitir NF (Asaas)"
                              data-testid={`btn-retry-nf-${inv.id}`}
                            >
                              {retryingNfId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                            </button>
                          )}
                          {inv.status !== 'CANCELADA' && inv.nf_status?.toUpperCase() !== 'AUTHORIZED' && plugnotasConfigured && (
                            <button
                              onClick={() => handleReissueViaPlugNotas(inv)}
                              disabled={reissuePlugnotasId === inv.id}
                              className="bg-cyan-50 hover:bg-cyan-100 text-cyan-700 p-1.5 rounded-lg"
                              title="Reemitir via PlugNotas (failover)"
                              data-testid={`btn-reissue-plugnotas-${inv.id}`}
                            >
                              {reissuePlugnotasId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
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
                          <div>
                            <span className="text-gray-400 font-bold">Boleto:</span>{' '}
                            <span className={`font-bold ${inv.asaas_bankslip_url ? 'text-green-600' : 'text-amber-500'}`}>
                              {inv.asaas_bankslip_url ? 'Disponível' : 'Pendente'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 font-bold">NF Fiscal:</span>{' '}
                            <span className={`font-bold ${inv.nf_image_url ? 'text-green-600' : 'text-amber-500'}`}>
                              {inv.nf_image_url ? (inv.nf_status === 'AUTHORIZED' ? 'Autorizada' : inv.nf_status || 'Disponível') : 'Pendente'}
                            </span>
                          </div>
                        </div>
                        {inv.asaas_bankslip_url && inv.nf_image_url && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-lg">
                            <CheckCircle2 size={10} /> Boleto e NF prontos para envio por email
                          </div>
                        )}
                        {(!inv.asaas_bankslip_url || !inv.nf_image_url) && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                            <Clock size={10} /> Aguardando {!inv.asaas_bankslip_url ? 'boleto' : ''}{!inv.asaas_bankslip_url && !inv.nf_image_url ? ' e ' : ''}{!inv.nf_image_url ? 'NF fiscal' : ''} — sincronize o status
                          </div>
                        )}
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
                      {inv.nf_image_url && (inv.nf_image_url.startsWith('http://') || inv.nf_image_url.startsWith('https://')) ? (
                        <a href={inv.nf_image_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-100" data-testid="link-nf-pdf">
                          <FileText size={12} /> Ver Nota Fiscal
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
                      {inv.asaas_payment_id && inv.status !== 'CANCELADA' && inv.status !== 'PAGA' && (
                        <button
                          onClick={() => handleSendEmail(inv)}
                          disabled={sendingEmailId === inv.id || !inv.asaas_bankslip_url || !inv.nf_image_url}
                          className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg border ${
                            inv.asaas_bankslip_url && inv.nf_image_url
                              ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                              : 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed'
                          }`}
                          title={!inv.asaas_bankslip_url ? 'Boleto não disponível — sincronize primeiro' : !inv.nf_image_url ? 'NF não disponível — sincronize primeiro' : 'Enviar email com boleto + NF ao cliente'}
                          data-testid={`btn-send-email-${inv.id}`}
                        >
                          {sendingEmailId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                          Enviar Email
                        </button>
                      )}
                      {inv.status !== 'CANCELADA' && inv.nf_status?.toUpperCase() !== 'AUTHORIZED' && plugnotasConfigured && (
                        <button
                          onClick={() => handleReissueViaPlugNotas(inv)}
                          disabled={reissuePlugnotasId === inv.id}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-700 bg-cyan-50 px-3 py-2 rounded-lg border border-cyan-200 hover:bg-cyan-100"
                          title="Failover: cancela NF Asaas (se houver) e emite no PlugNotas"
                          data-testid={`btn-reissue-plugnotas-detail-${inv.id}`}
                        >
                          {reissuePlugnotasId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reemitir via PlugNotas
                        </button>
                      )}
                      {inv.status !== 'CANCELADA' && inv.status !== 'PAGA' && (
                        <button onClick={() => handleCancelInvoice(inv)} disabled={cancellingId === inv.id} className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 hover:bg-red-100 ml-auto">
                          {cancellingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} Cancelar Fatura
                        </button>
                      )}
                    </div>

                    {(inv.nf_provider === 'PLUGNOTAS' || inv.plugnotas_invoice_id) && (
                      <div className="border border-cyan-200 bg-cyan-50/40 rounded-xl p-4 space-y-2">
                        <p className="text-[9px] font-black text-cyan-700 uppercase tracking-widest flex items-center gap-1.5">
                          <Send size={10} /> Emissora atual: PlugNotas
                        </p>
                        {inv.plugnotas_invoice_id && (
                          <div className="text-[10px] flex items-center gap-2">
                            <span className="font-black text-gray-500 uppercase">ID PlugNotas:</span>
                            <span className="font-mono text-gray-700">{inv.plugnotas_invoice_id}</span>
                          </div>
                        )}
                        {inv.plugnotas_protocol && (
                          <div className="text-[10px] flex items-center gap-2">
                            <span className="font-black text-gray-500 uppercase">Protocolo Prefeitura:</span>
                            <span className="font-mono text-gray-700">{inv.plugnotas_protocol}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {inv.asaas_payment_id && (
                      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[9px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <Clock size={10} /> Histórico de Reemissões da NF
                          </p>
                          <span className="text-[9px] font-bold text-gray-400">
                            {inv.nf_history?.length || 0} evento(s)
                            {typeof inv.nf_retry_count === 'number' && ` · ${inv.nf_retry_count} tentativa(s) reais`}
                          </span>
                        </div>
                        {inv.nf_history && inv.nf_history.length > 0 ? (
                          <ol className="relative border-l-2 border-gray-200 ml-2 space-y-3" data-testid="nf-history-timeline">
                            {[...inv.nf_history].slice().reverse().map((h, idx) => {
                              const cfg = HISTORY_ACTION_LABEL[h.action] || { label: h.action, color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', icon: Clock };
                              const HIcon = cfg.icon;
                              return (
                                <li key={`${h.ts}-${idx}`} className="ml-4" data-testid={`nf-history-item-${idx}`}>
                                  <span className={`absolute -left-[7px] flex items-center justify-center w-3 h-3 rounded-full border-2 ${cfg.bg} ${cfg.border}`} />
                                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                                      <HIcon size={9} /> {cfg.label}
                                    </span>
                                    {h.status && (
                                      <span className="text-[9px] font-mono text-gray-400">{h.status}</span>
                                    )}
                                    <span className="text-[9px] text-gray-400 ml-auto font-mono">{formatDateTimeBR(h.ts)}</span>
                                  </div>
                                  {h.message && <p className="text-[10px] text-gray-600 leading-snug">{h.message}</p>}
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <p className="text-[10px] text-gray-400 italic">
                            Nenhum evento registrado ainda.{typeof inv.nf_retry_count === 'number' && inv.nf_retry_count > 0
                              ? ' (Eventos anteriores à atualização do sistema não ficam no histórico — futuras tentativas serão registradas aqui.)'
                              : ''}
                          </p>
                        )}
                      </div>
                    )}

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

      {showRetroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowRetroModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase flex items-center gap-2"><Calendar size={16} className="text-blue-600"/> Lançar Fatura Retroativa</h3>
                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Sem emissão de NF — registro manual de cobrança</p>
              </div>
              <button onClick={() => setShowRetroModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Cliente *</label>
                <input type="text" value={retroForm.client} onChange={e => setRetroForm(f => ({ ...f, client: e.target.value }))} placeholder="Nome do cliente" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" data-testid="retro-client"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Nº NF / Referência</label>
                  <input type="text" value={retroForm.number} onChange={e => setRetroForm(f => ({ ...f, number: e.target.value }))} placeholder="Ex: NF-001 ou REF-2026" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" data-testid="retro-number"/>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Valor (R$) *</label>
                  <input type="text" value={retroForm.amount} onChange={e => setRetroForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 outline-none" data-testid="retro-amount"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Data de Emissão *</label>
                  <input type="date" value={retroForm.date} onChange={e => setRetroForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" data-testid="retro-date"/>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Vencimento</label>
                  <input type="date" value={retroForm.dueDate} onChange={e => setRetroForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" data-testid="retro-due-date"/>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Empresa Emissora</label>
                <select value={retroForm.issuer_company} onChange={e => setRetroForm(f => ({ ...f, issuer_company: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" data-testid="retro-issuer">
                  <option value="TM GESTÃO">TM GESTÃO</option>
                  <option value="TM SECURITY">TM SECURITY</option>
                  <option value="TM SEGURANÇA">TM SEGURANÇA</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Observações</label>
                <textarea value={retroForm.notes} onChange={e => setRetroForm(f => ({ ...f, notes: e.target.value }))} placeholder="Informações adicionais sobre esta fatura..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none resize-none" data-testid="retro-notes"/>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-amber-700 flex items-center gap-1.5"><AlertCircle size={12}/> Este lançamento NÃO emite Nota Fiscal. Será registrado como fatura em aberto no controle financeiro e no contas a receber.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowRetroModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg" data-testid="retro-cancel">Cancelar</button>
              <button onClick={handleSaveRetro} disabled={savingRetro} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50" data-testid="retro-save">
                {savingRetro ? <Loader2 size={14} className="animate-spin"/> : <Receipt size={14}/>} {savingRetro ? 'Salvando...' : 'Lançar Fatura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialInvoiceControl;
