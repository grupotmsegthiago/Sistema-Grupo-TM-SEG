import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { supabase, WHATSAPP_BOT_BROADCAST_CHANNEL } from '../lib/supabase';

type LockPhase = 'claimed' | 'generating' | 'code_ready' | 'done';

type ReconnectLock = {
  holderId: string;
  holderName: string;
  acquiredAt: string;
  expiresAt: string;
  phase: LockPhase;
  phoneLinkCode?: string | null;
  reconnectMessage?: string | null;
};

type BotStatus = {
  configured: boolean;
  online: boolean;
  label: string | null;
  lastError: string | null;
  incidentOpen: boolean;
  lock: ReconnectLock | null;
};

type LocalUser = { id?: string; name?: string; role?: string };

function readUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem('userData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function broadcastBotStatus(payload: Partial<BotStatus>) {
  void supabase.channel(WHATSAPP_BOT_BROADCAST_CHANNEL, {
    config: { broadcast: { self: true } },
  }).send({
    type: 'broadcast',
    event: 'bot_status',
    payload,
  });
}

const WhatsAppOfflineModal: React.FC = () => {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const user = useMemo(() => readUser(), []);
  const userId = String(user?.id || '');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/whatsapp/bot-status');
      if (!res.ok) return;
      const data: BotStatus = await res.json();
      setStatus(data);
      if (data.online) setMessage(null);
    } catch {
      /* silencioso */
    }
  }, []);

  useRealtimeRefresh(['whatsapp_instances', 'system_settings'], () => { void fetchStatus(); });

  useEffect(() => {
    void fetchStatus();
    const poll = setInterval(() => { void fetchStatus(); }, 30_000);

    const channel = supabase
      .channel(WHATSAPP_BOT_BROADCAST_CHANNEL)
      .on('broadcast', { event: 'bot_status' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        setStatus((prev) => ({ ...(prev || { configured: true, online: false, label: null, lastError: null, incidentOpen: true, lock: null }), ...payload as BotStatus }));
      })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [fetchStatus]);

  const lock = status?.lock || null;
  const isHolder = !!lock && lock.holderId === userId;
  const showModal = !!status?.configured && !status.online;

  useEffect(() => {
    if (!showModal || !isHolder) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    heartbeatRef.current = setInterval(() => {
      void authFetch('/api/whatsapp/bot-status/heartbeat', { method: 'POST' });
    }, 30_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [showModal, isHolder]);

  const claimAndGenerate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const claimRes = await authFetch('/api/whatsapp/bot-status/claim', { method: 'POST' });
      const claimData = await claimRes.json();
      if (claimData.lock) {
        setStatus((s) => (s ? { ...s, lock: claimData.lock } : s));
        broadcastBotStatus({ lock: claimData.lock });
      }
      if (!claimRes.ok) {
        setMessage(claimData.reason || claimData.error || 'Outro usuário já assumiu a reconexão.');
        return;
      }

      const genRes = await authFetch('/api/whatsapp/bot-status/generate-code', { method: 'POST' });
      const genData = await genRes.json();
      if (genData.lock) {
        setStatus((s) => (s ? { ...s, lock: genData.lock, online: genData.connected === true } : s));
        broadcastBotStatus({ lock: genData.lock, online: genData.connected === true });
      }
      if (genData.connected) {
        setMessage('Bot reconectado com sucesso!');
        return;
      }
      if (genData.phoneLinkCode) {
        setMessage('Código gerado — informe no WhatsApp Business do eSIM.');
        return;
      }
      setMessage(genData.message || genData.error || 'Não foi possível gerar o código.');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Erro ao reconectar');
    } finally {
      setBusy(false);
    }
  };

  const generateCode = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/whatsapp/bot-status/generate-code', { method: 'POST' });
      const data = await res.json();
      if (data.lock) {
        setStatus((s) => (s ? { ...s, lock: data.lock, online: data.connected === true } : s));
        broadcastBotStatus({ lock: data.lock, online: data.connected === true });
      }
      if (data.connected) {
        setMessage('Bot reconectado com sucesso!');
        return;
      }
      if (data.phoneLinkCode) {
        setMessage('Código gerado — informe no WhatsApp Business do eSIM.');
        return;
      }
      setMessage(data.message || data.error || 'Não foi possível gerar o código.');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Erro ao gerar código');
    } finally {
      setBusy(false);
    }
  };

  if (!showModal) return null;

  const phoneCode = lock?.phoneLinkCode || null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="whatsapp-offline-title"
      data-testid="whatsapp-offline-modal"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border-2 border-red-200 overflow-hidden">
        <div className="bg-red-700 text-white px-6 py-4 flex items-center gap-3">
          <WifiOff size={28} />
          <div>
            <h2 id="whatsapp-offline-title" className="text-lg font-black uppercase tracking-wide">
              Bot WhatsApp OFFLINE
            </h2>
            <p className="text-xs opacity-90 font-medium normal-case">
              {status?.label || 'Monitoramento 24h'} — envios interrompidos
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-sm text-gray-800">
          <p className="leading-relaxed">
            O robô de WhatsApp caiu. <strong>Apenas um usuário</strong> deve gerar o código de vinculação.
            Assim que alguém assumir, os demais ficam em modo leitura até reconectar.
          </p>

          {status?.lastError && (
            <p className="text-xs bg-red-50 border border-red-100 text-red-800 p-3 rounded-lg">
              {status.lastError}
            </p>
          )}

          {lock && !isHolder && (
            <div className="bg-amber-50 border border-amber-200 text-amber-950 p-4 rounded-lg">
              <p className="font-bold">{lock.holderName} está reconectando</p>
              <p className="text-xs mt-1 opacity-80">
                Desde {new Date(lock.acquiredAt).toLocaleTimeString('pt-BR')} — aguarde a confirmação no celular.
              </p>
              {lock.phase === 'code_ready' && lock.phoneLinkCode && (
                <p className="mt-2 text-xs">
                  Código em uso: <span className="font-mono font-bold">{lock.phoneLinkCode}</span>
                </p>
              )}
            </div>
          )}

          {isHolder && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase text-green-800">Você assumiu a reconexão</p>
              {phoneCode ? (
                <div className="text-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase text-gray-500 mb-2">Código de vinculação</p>
                  <p className="text-3xl font-mono font-black tracking-widest text-gray-900">{phoneCode}</p>
                  <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                    No WhatsApp Business do eSIM (11 92683-9456):<br />
                    <strong>Aparelhos conectados → Conectar → Vincular com número de telefone</strong>
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generateCode()}
                  className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-4 rounded-xl disabled:opacity-50"
                >
                  {busy ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}
                  {busy ? 'Gerando código…' : 'Gerar código de reconexão'}
                </button>
              )}
              {!phoneCode && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generateCode()}
                  className="w-full text-xs font-bold text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1"
                >
                  <RefreshCw size={14} /> Atualizar / gerar novo código
                </button>
              )}
            </div>
          )}

          {!lock && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void claimAndGenerate()}
              className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-4 rounded-xl disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}
              Assumir reconexão e gerar código
            </button>
          )}

          {message && (
            <p className="text-xs bg-blue-50 border border-blue-100 text-blue-900 p-3 rounded-lg">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppOfflineModal;
