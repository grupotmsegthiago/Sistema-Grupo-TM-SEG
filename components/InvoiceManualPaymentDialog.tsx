import React, { useMemo, useState } from 'react';
import { Banknote, Loader2, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';

type InvoiceRef = {
  id: string;
  number: string;
  client: string;
  amount: number;
};

function loggedUserName(): string {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(user.name || user.email || '').trim();
  } catch {
    return '';
  }
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

async function uploadStatement(invoiceId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `invoice-manual-payment/${invoiceId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('mission-evidence').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Falha ao enviar a evidência do extrato');
  const { data } = supabase.storage.from('mission-evidence').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Não foi possível obter o link da evidência');
  return data.publicUrl;
}

const InvoiceManualPaymentDialog: React.FC<{
  invoice: InvoiceRef;
  onClose: () => void;
  onSaved: () => void;
}> = ({ invoice, onClose, onSaved }) => {
  const registrar = useMemo(() => loggedUserName(), []);
  const [paymentDate, setPaymentDate] = useState(brazilToday());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pickFile = (next: File | null) => {
    setFile(next);
    setError('');
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next && next.type.startsWith('image/') ? URL.createObjectURL(next) : null);
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          event.preventDefault();
          pickFile(new File([blob], `extrato-${Date.now()}.png`, { type: blob.type || 'image/png' }));
        }
        return;
      }
    }
  };

  const save = async () => {
    if (!file) {
      setError('Anexe a evidência do extrato.');
      return;
    }
    if (!paymentDate) {
      setError('Informe a data do pagamento.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const evidenceUrl = await uploadStatement(invoice.id, file);
      const res = await authFetch('/api/nf/manual-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          paymentDate,
          evidenceUrl,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar a baixa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onPaste={onPaste}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" data-testid="manual-pay-dialog">
        <div className="p-4 border-b flex justify-between items-center bg-emerald-800">
          <div className="flex items-center gap-2 text-white">
            <Banknote size={18} />
            <h3 className="font-black uppercase text-xs tracking-widest">Baixa manual do pagamento</h3>
          </div>
          <button type="button" onClick={onClose} className="text-emerald-100 hover:text-white" data-testid="manual-pay-close">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase">Fatura</p>
              <p className="font-mono font-bold text-gray-900">{invoice.number}</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase">Valor</p>
              <p className="font-mono font-black text-gray-900">
                {invoice.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[9px] font-black text-gray-400 uppercase">Cliente</p>
              <p className="font-bold text-gray-800 uppercase">{invoice.client}</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Data do pagamento *</label>
            <input
              type="date"
              value={paymentDate}
              max={brazilToday()}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600"
              data-testid="manual-pay-date"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Evidência do extrato *</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => pickFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
              data-testid="manual-pay-file"
            />
            <p className="text-[10px] text-gray-500 mt-1">Arquivo ou print colado com Ctrl+V.</p>
            {preview && <img src={preview} alt="Prévia do extrato" className="mt-2 max-h-40 rounded-lg border" />}
            {file && !preview && <p className="text-xs font-bold text-gray-700 mt-2">{file.name}</p>}
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Observação</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 resize-none"
              data-testid="manual-pay-note"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
            <p><span className="font-black">Quem registra:</span> {registrar || 'usuário logado'}</p>
            <p className="mt-1 text-gray-500">A data e a hora do registro são gravadas no momento da confirmação. O valor da fatura permanece o mesmo.</p>
          </div>

          {error && <p className="text-xs font-bold text-red-600" data-testid="manual-pay-error">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            data-testid="manual-pay-save"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
            {saving ? 'Salvando...' : 'Confirmar baixa'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceManualPaymentDialog;
