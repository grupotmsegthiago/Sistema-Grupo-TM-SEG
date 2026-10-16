import React, { useEffect, useState } from 'react';
import { MailWarning, Loader2, X, Users } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';
import { supabase } from '../lib/supabase';
import type { OsAnalysisRecipient } from '../lib/osAnalysisTypes';
import { OS_ANALYSIS_BROADCAST_CHANNEL } from '../lib/osAnalysisTypes';

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

type InternalUser = { id: string; name: string; email: string };

function isDefaultRecipient(name: string): boolean {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return n.includes('barbara') || n.includes('giovanna');
}

const RequestOsAnalysisModal: React.FC<Props> = ({ open, onClose, payload, onSent }) => {
  const { showNotification } = useNotification();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingUsers(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('system_users')
          .select('id, name, email')
          .eq('user_type', 'internal')
          .eq('status', 'Ativo')
          .order('name');
        if (error) throw error;
        if (cancelled) return;
        const list = (data || [])
          .map((u: any) => ({
            id: String(u.id),
            name: String(u.name || ''),
            email: String(u.email || '').trim().toLowerCase(),
          }))
          .filter((u) => u.id && u.name);
        setUsers(list);
        const defaults = new Set(list.filter((u) => isDefaultRecipient(u.name)).map((u) => u.id));
        setSelectedIds(defaults.size ? defaults : new Set());
      } catch (e: any) {
        if (!cancelled) {
          showNotification('Erro', e?.message || 'Falha ao carregar usuários', 'error');
        }
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, showNotification]);

  if (!open || !payload) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const observation = note.trim();
    if (!observation) {
      showNotification('Observação obrigatória', 'Descreva o que precisa ser analisado.', 'error');
      return;
    }
    const recipients: OsAnalysisRecipient[] = users
      .filter((u) => selectedIds.has(u.id))
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));
    if (recipients.length === 0) {
      showNotification('Destinatários', 'Selecione ao menos uma pessoa para e-mail e notificação.', 'error');
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
          recipients,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar');
      try {
        void supabase.channel(OS_ANALYSIS_BROADCAST_CHANNEL, {
          config: { broadcast: { self: true } },
        }).send({ type: 'broadcast', event: 'inbox_changed', payload: { missionId: payload.missionId } });
      } catch {
        // ignore
      }
      showNotification(
        'Análise solicitada',
        data.emailSent
          ? `E-mail e recado enviados para ${recipients.map((r) => r.name).join(', ')}.`
          : `Recado registrado para ${recipients.map((r) => r.name).join(', ')}.`,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <MailWarning size={18} className="text-amber-300" />
            <div>
              <h3 className="font-black text-sm uppercase tracking-wide">Pedir análise da OS</h3>
              <p className="text-[11px] text-slate-300">#{payload.missionId} — escolha quem recebe</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-sm text-slate-600">
            Os selecionados recebem <strong>e-mail</strong> e o bloqueio no sistema: <strong>“Um recado da Diretoria”</strong>.
          </p>

          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">
              <Users size={12} /> Destinatários (e-mail + notificação)
            </div>
            {loadingUsers ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                <Loader2 size={16} className="animate-spin" /> Carregando usuários…
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y" data-testid="list-os-analysis-recipients">
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggle(u.id)}
                      data-testid={`checkbox-recipient-${u.id}`}
                    />
                    <span className="font-semibold text-slate-800">{u.name}</span>
                    <span className="text-xs text-slate-400 truncate">{u.email || 'sem e-mail'}</span>
                  </label>
                ))}
                {users.length === 0 && (
                  <p className="px-3 py-3 text-sm text-slate-500">Nenhum usuário interno ativo.</p>
                )}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">O que precisa ser feito</span>
            <textarea
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 min-h-[120px] text-sm"
              placeholder="Ex.: revisar pedágio / tabela parece incorreta / margem estranha…"
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
              disabled={sending || loadingUsers}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-black disabled:opacity-60"
              data-testid="button-send-os-analysis"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <MailWarning size={16} />}
              Enviar recado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestOsAnalysisModal;
