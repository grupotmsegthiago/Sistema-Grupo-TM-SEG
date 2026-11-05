import React, { useMemo, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import {
  DEFAULT_PROSPECT_SUBJECT,
  montarAssuntoApresentacao,
  montarCorpoApresentacao,
} from '../lib/partnerProspects/emailTemplate';
import type { PartnerProspect } from '../lib/partnerProspects/types';
import { useNotification } from '../lib/NotificationContext';

interface Props {
  prospect: PartnerProspect;
  senderName?: string;
  onClose: () => void;
  onSent: () => void;
}

function listaEmails(p: PartnerProspect): string[] {
  const set = new Set<string>();
  for (const e of p.emails || []) {
    const v = String(e || '').trim().toLowerCase();
    if (v.includes('@')) set.add(v);
  }
  if (p.email && p.email.includes('@')) set.add(p.email.trim().toLowerCase());
  return [...set];
}

const PartnerProspectEmailModal: React.FC<Props> = ({ prospect, senderName, onClose, onSent }) => {
  const { showNotification } = useNotification();
  const disponiveis = useMemo(() => listaEmails(prospect), [prospect]);
  const [selected, setSelected] = useState<string[]>(() => (disponiveis[0] ? [disponiveis[0]] : []));
  const [extraTo, setExtraTo] = useState('');

  const defaults = useMemo(() => {
    const vars = {
      companyName: prospect.company_name,
      tradeName: prospect.trade_name,
      city: prospect.city,
      stateUf: prospect.state_uf,
      contactName: prospect.contact_name,
      senderName: senderName || undefined,
      fromEmail: 'adm@grupotmseg.com.br',
      partnershipLink: 'https://sistema.grupotmseg.com.br',
    };
    return {
      subject: montarAssuntoApresentacao(vars),
      html: montarCorpoApresentacao(vars).html,
      text: montarCorpoApresentacao(vars).text,
      fromEmail: vars.fromEmail,
    };
  }, [prospect, senderName]);

  const [subject, setSubject] = useState(defaults.subject || DEFAULT_PROSPECT_SUBJECT);
  const [sending, setSending] = useState(false);

  const toggleEmail = (e: string) => {
    setSelected((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const handleSend = async () => {
    const dest = [
      ...selected,
      ...extraTo
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.includes('@')),
    ];
    const uniq = [...new Set(dest)];
    if (!uniq.length) {
      showNotification('Atenção', 'Selecione ou informe ao menos um e-mail.', 'warning');
      return;
    }
    setSending(true);
    try {
      let okCount = 0;
      let lastErr = '';
      for (const to of uniq) {
        const res = await authFetch('/api/partner-prospects/send-email', {
          method: 'POST',
          body: JSON.stringify({
            prospectId: prospect.id,
            to,
            subject: subject.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          lastErr = data?.error || `Falha ao enviar para ${to}`;
          continue;
        }
        okCount++;
      }
      if (!okCount) throw new Error(lastErr || 'Falha ao enviar e-mail');
      showNotification(
        'Sucesso',
        okCount === 1 ? 'Apresentação enviada.' : `Apresentação enviada para ${okCount} destinatários.`,
        'success',
      );
      onSent();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha no envio', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-800">
              Pré-visualização do e-mail
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{prospect.company_name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="font-black uppercase text-gray-400 text-[10px]">Remetente</div>
              <div className="font-semibold text-gray-800 mt-0.5">{defaults.fromEmail}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="font-black uppercase text-gray-400 text-[10px]">Empresa</div>
              <div className="font-semibold text-gray-800 mt-0.5 truncate">
                {prospect.trade_name || prospect.company_name}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
              Destinatários capturados
            </label>
            {disponiveis.length ? (
              <div className="flex flex-col gap-1.5">
                {disponiveis.map((e) => (
                  <label key={e} className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(e)}
                      onChange={() => toggleEmail(e)}
                      className="rounded border-gray-300"
                    />
                    <span className="font-mono text-xs">{e}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-700">Nenhum e-mail capturado — informe manualmente abaixo.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase">Outros e-mails (opcional)</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              value={extraTo}
              onChange={(e) => setExtraTo(e.target.value)}
              placeholder="email@empresa.com.br, outro@empresa.com.br"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase">Assunto</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase">Corpo (como será enviado)</label>
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto mt-1">
              {defaults.text}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSend()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-60"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Disparar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PartnerProspectEmailModal;
