import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MailOpen, MessageSquareWarning, ExternalLink, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { supabase } from '../lib/supabase';
import type { OsAnalysisRequest } from '../lib/osAnalysisTypes';
import { OS_ANALYSIS_BROADCAST_CHANNEL } from '../lib/osAnalysisTypes';
import { buildOsAuditDeepLink } from '../lib/osAnalysisAccess';

type LocalUser = { id?: string; name?: string };

function readUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem('userData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function broadcastInboxChanged() {
  void supabase.channel(OS_ANALYSIS_BROADCAST_CHANNEL, {
    config: { broadcast: { self: true } },
  }).send({
    type: 'broadcast',
    event: 'inbox_changed',
    payload: { at: Date.now() },
  });
}

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Bloqueia destinatários do “Pedir Análise” com “Um recado da Diretoria”.
 * 1) Abrir mensagem → vê o que fazer
 * 2) Assumir → libera os demais; responsável fica com faixa até responder a OS
 */
const OsAnalysisDiretoriaModal: React.FC<{ onOpenMission?: (missionId: string) => void }> = ({
  onOpenMission,
}) => {
  const user = useMemo(() => readUser(), []);
  const userId = String(user?.id || '');
  const [items, setItems] = useState<OsAnalysisRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await authFetch('/api/os-analysis?op=inbox');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[os-analysis-inbox]', data.error || res.status);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      console.warn('[os-analysis-inbox]', e?.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  useRealtimeRefresh(['system_settings'], () => {
    void load();
  });

  useEffect(() => {
    const ch = supabase.channel(OS_ANALYSIS_BROADCAST_CHANNEL, {
      config: { broadcast: { self: true } },
    });
    ch.on('broadcast', { event: 'inbox_changed' }, () => {
      void load();
    });
    void ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener('refreshMissions', onRefresh);
    return () => window.removeEventListener('refreshMissions', onRefresh);
  }, [load]);

  const active = items[0] || null;
  const activeId = active?.id || '';

  useEffect(() => {
    setRevealed(false);
    setMessage(null);
    setBannerDismissed(false);
  }, [activeId]);

  const isClaimer = !!(active && String(active.claimed_by_id || '') === userId);

  const goToMission = (missionId: string) => {
    setBannerDismissed(true);
    if (onOpenMission) {
      onOpenMission(missionId);
      return;
    }
    window.location.href = buildOsAuditDeepLink(missionId);
  };

  const claim = async (req: OsAnalysisRequest) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch(`/api/os-analysis?op=claim&id=${encodeURIComponent(req.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setMessage(data.reason || 'Outra pessoa já assumiu — você foi liberado.');
        await load();
        return;
      }
      if (!res.ok) throw new Error(data.error || data.reason || 'Falha ao assumir');
      broadcastInboxChanged();
      await load();
      goToMission(req.mission_id);
    } catch (e: any) {
      setMessage(e?.message || 'Não foi possível assumir o recado');
    } finally {
      setBusy(false);
    }
  };

  if (!userId || loading) return null;
  if (!active) return null;
  if (bannerDismissed) return null;

  if (isClaimer) {
    return (
      <div
        className="fixed top-0 inset-x-0 z-[80] bg-slate-900 text-white shadow-xl border-b-4 border-amber-400"
        data-testid="banner-os-analysis-diretoria"
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <MessageSquareWarning className="text-amber-300 shrink-0 mt-0.5" size={22} />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-300">Um recado da Diretoria</p>
              <p className="text-sm font-bold truncate">
                OS {active.mission_id} — corrija ou responda com motivo para liberar.
              </p>
              <p className="text-xs text-slate-300 line-clamp-3 mt-0.5 whitespace-pre-wrap">{active.request_note}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => goToMission(active.mission_id)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 text-sm font-black"
              data-testid="button-os-analysis-go-mission"
            >
              Abrir Auditoria <ExternalLink size={14} />
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="p-2 rounded-xl hover:bg-white/10 text-white"
              aria-label="Fechar recado"
              title="Fechar recado para ver a auditoria da OS"
              data-testid="button-os-analysis-close-banner"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
      data-testid="modal-os-analysis-diretoria"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-4 border-amber-400">
        <div className="bg-slate-900 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-400/20 text-amber-300">
              <MessageSquareWarning size={28} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">Notificação do sistema</p>
              <h2 className="text-2xl font-black tracking-tight">Um recado da Diretoria</h2>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!revealed ? (
            <>
              <p className="text-slate-600 text-sm leading-relaxed">
                Há um recado da Diretoria aguardando você. Abra a mensagem para ver o que precisa ser feito.
                O sistema permanece bloqueado.
              </p>
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm"
                data-testid="button-open-diretoria-message"
              >
                <MailOpen size={18} /> Abrir mensagem
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2" data-testid="text-diretoria-message-body">
                <p className="text-[10px] font-black uppercase text-amber-700 tracking-widest">O que precisa ser feito</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{active.request_note}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 border p-3">
                  <p className="text-slate-400 font-bold uppercase text-[9px]">OS</p>
                  <p className="font-mono font-black text-slate-900">{active.mission_id}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border p-3">
                  <p className="text-slate-400 font-bold uppercase text-[9px]">Pedido por</p>
                  <p className="font-bold text-slate-900">{active.requested_by}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border p-3 col-span-2">
                  <p className="text-slate-400 font-bold uppercase text-[9px]">Resultado atual</p>
                  <p className="font-bold text-slate-900">{fmt(Number(active.result_before))}</p>
                  <p className="text-slate-500 mt-0.5 truncate">
                    {active.client_name || '—'} · {active.provider_name || '—'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Ao assumir, os demais destinatários são liberados. Você só fica livre após corrigir ou responder esta OS na Auditoria (com motivo).
              </p>
              {message && <p className="text-sm text-red-600 font-semibold">{message}</p>}
              <button
                type="button"
                disabled={busy}
                onClick={() => void claim(active)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-black text-sm disabled:opacity-60"
                data-testid="button-claim-diretoria-message"
              >
                {busy ? <Loader2 className="animate-spin" size={18} /> : <MailOpen size={18} />}
                Assumir e analisar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OsAnalysisDiretoriaModal;
