import React, { useState } from 'react';
import { MailWarning, Loader2, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';

export type RequestOsAnalysisPayload = {
  missionId: string;
  client?: string | null;
  provider?: string | null;
  revenueBefore?: number;
  costBefore?: number;
  resultBefore?: number;
  source: 'audit' | 'losses' | 'missing_table';
};

interface Props {
  open: boolean;
  onClose: () => void;
  payload: RequestOsAnalysisPayload | null;
  onSent?: () => void;
}

const RequestOsAnalysisModal: React.FC<Props> = ({ open, onClose, payload, onSent }) => {
  const { showNotification } = useNotification();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  if (!open || !payload) return null;

  const submit = async () => {
    const observation = note.trim();
    if (!observation) {
      showNotification('Observação obrigatória', 'Descreva o que Bárbara e Giovanna devem analisar.', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await authFetch('/api/os-analysis?op=request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: payload.missionId,
          note: observation,
          source: payload.source,
          client: payload.client,
          provider: payload.provider,
          revenueBefore: payload.revenueBefore ?? 0,
          costBefore: payload.costBefore ?? 0,
          resultBefore: payload.resultBefore ?? 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar');
      showNotification(
        'Análise solicitada',
        data.emailSent
          ? 'E-mail enviado para Bárbara e Giovanna com o link da auditoria.'
          : 'Pedido registrado. Verifique o envio do e-mail.',
        'success',
      );
      setNote('');
      onSent?.();
      onClose();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Não foi possível pedir análise', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" data-testid="modal-request-os-analysis">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <MailWarning size={18} className="text-amber-300" />
            <div>
              <h3 className="font-black text-sm uppercase tracking-wide">Pedir análise da OS</h3>
              <p className="text-[11px] text-slate-300">#{payload.missionId} → Bárbara e Giovanna</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">
            O e-mail dirá: <strong>“Thiago pediu para analisar essa OS”</strong>, com a sua observação e um link direto para a Auditoria de Faturamento.
          </p>
          <label className="block text-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Observação</span>
            <textarea
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 min-h-[120px] text-sm"
              placeholder="Ex.: valores estranhos de pedágio / tabela parece incorreta / margem 3,7%…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="input-os-analysis-note"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-bold">
              Cancelar
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-black disabled:opacity-60"
              data-testid="button-send-os-analysis"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <MailWarning size={16} />}
              Enviar para análise
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestOsAnalysisModal;
