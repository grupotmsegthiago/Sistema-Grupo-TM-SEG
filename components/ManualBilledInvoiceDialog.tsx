import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildManualBilledInvoicePayloads } from '../lib/financial/manualBilledInvoice';

type ClientOption = { id: string; name: string };

function todayBR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function loggedUserName(): string {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(user.name || user.email || '').trim();
  } catch {
    return '';
  }
}

function safeExtension(file: File): string {
  return (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
}

const ManualBilledInvoiceDialog: React.FC<{
  onClose: () => void;
  onSaved: () => void;
}> = ({ onClose, onSaved }) => {
  const today = useMemo(() => todayBR(), []);
  const createdBy = useMemo(() => loggedUserName(), []);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [issuerCompany, setIssuerCompany] = useState('TM GESTÃO');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void supabase
      .from('clients')
      .select('id, name, trading_name')
      .order('name')
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError) {
          setError('Não foi possível carregar os clientes.');
          return;
        }
        setClients((data || []).map((row: any) => ({
          id: String(row.id),
          name: String(row.trading_name || row.name || '').trim(),
        })).filter((row: ClientOption) => row.name));
      });
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setError('');
    const selectedClient = clients.find((client) => client.id === clientId);
    if (!selectedClient) {
      setError('Selecione o cliente.');
      return;
    }
    if (!file) {
      setError('Anexe a nota fiscal já faturada.');
      return;
    }
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Anexe a NF em PDF, PNG, JPG ou WEBP.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('A nota fiscal deve ter no máximo 20 MB.');
      return;
    }

    setSaving(true);
    const invoiceId = crypto.randomUUID();
    const ext = safeExtension(file);
    const storagePath = `financial-invoices/manual/${invoiceId}/nf.${ext}`;
    let uploaded = false;
    let invoiceInserted = false;
    try {
      const nfNumber = number.trim();
      if (!nfNumber) throw new Error('Informe o número da NF');
      const { data: duplicate, error: duplicateError } = await supabase
        .from('financial_invoices')
        .select('id')
        .ilike('number', nfNumber)
        .eq('issuer_company', issuerCompany)
        .limit(1);
      if (duplicateError) throw duplicateError;
      if ((duplicate || []).length > 0) {
        throw new Error('Esta NF já está cadastrada para a empresa emissora.');
      }

      const upload = await supabase.storage.from('mission-evidence').upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upload.error) throw upload.error;
      uploaded = true;
      const { data: publicData } = supabase.storage.from('mission-evidence').getPublicUrl(storagePath);
      if (!publicData?.publicUrl) throw new Error('Não foi possível obter o link da nota fiscal.');

      const payloads = buildManualBilledInvoicePayloads({
        invoiceId,
        clientId,
        clientName: selectedClient.name,
        number: nfNumber,
        description,
        amountText: amount,
        issueDate,
        dueDate,
        issuerCompany,
        nfUrl: publicData.publicUrl,
        createdBy,
      });

      const invoiceInsert = await supabase.from('financial_invoices').insert(payloads.invoice);
      if (invoiceInsert.error) throw invoiceInsert.error;
      invoiceInserted = true;

      const txInsert = await supabase.from('financial_transactions').insert(payloads.receivable);
      if (txInsert.error) throw txInsert.error;

      onSaved();
    } catch (saveError: any) {
      if (invoiceInserted) {
        await supabase.from('financial_invoices').delete().eq('id', invoiceId);
      }
      if (uploaded) {
        await supabase.storage.from('mission-evidence').remove([storagePath]);
      }
      setError(saveError?.message || 'Não foi possível incluir o faturamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" data-testid="manual-billed-invoice-dialog">
        <div className="flex items-center justify-between border-b bg-indigo-800 px-5 py-4 text-white">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <FilePlus2 size={18} /> Incluir Faturamento
            </h3>
            <p className="mt-1 text-[10px] font-semibold text-indigo-100">Cadastre uma NF que já foi emitida, sem gerar outra no Asaas.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" data-testid="manual-billed-close"><X size={18} /></button>
        </div>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Cliente *</label>
            <select value={clientId} onChange={(event) => setClientId(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="manual-billed-client">
              <option value="">Selecione...</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Número da NF *</label>
              <input value={number} onChange={(event) => setNumber(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Ex.: 12345" data-testid="manual-billed-number" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Valor faturado *</label>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono" placeholder="0,00" data-testid="manual-billed-amount" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Descrição *</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={500} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Serviço, período ou referência do faturamento" data-testid="manual-billed-description" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Data de emissão *</label>
              <input type="date" max={today} value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="manual-billed-issue-date" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Vencimento *</label>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="manual-billed-due-date" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Empresa emissora *</label>
              <select value={issuerCompany} onChange={(event) => setIssuerCompany(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="manual-billed-issuer">
                <option value="TM GESTÃO">TM GESTÃO</option>
                <option value="TM SECURITY">TM SECURITY</option>
                <option value="TM SEGURANÇA">TM SEGURANÇA</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-gray-500">Nota fiscal faturada *</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 px-4 py-5 text-sm font-bold text-indigo-700 hover:bg-indigo-100">
              <Upload size={18} /> {file ? file.name : 'Selecionar PDF ou imagem da NF'}
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} data-testid="manual-billed-file" />
            </label>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-800">
            A inclusão grava a NF no Controle de Faturas e cria o título correspondente em Contas a Receber. Nenhuma nova NF será emitida.
          </div>
          {error && <p className="text-xs font-bold text-red-600" data-testid="manual-billed-error">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-indigo-700 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-50" data-testid="manual-billed-save">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
            {saving ? 'Incluindo...' : 'Incluir faturamento'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualBilledInvoiceDialog;
