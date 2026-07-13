import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { sanitizeWhatsappError } from '../lib/whatsappDisplayUtils';
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
  modalDismissed?: boolean;
  modalDismissedBy?: string | null;
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

function broadcastModalDismissed() {
  void supabase.channel(WHATSAPP_BOT_BROADCAST_CHANNEL, {
    config: { broadcast: { self: true } },
  }).send({
    type: 'broadcast',
    event: 'modal_dismissed',
    payload: { modalDismissed: true },
  });
}

function isReconnectAdmin(user: LocalUser | null): boolean {
  const role = String(user?.role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ['diretoria', 'administrador', 'ceo', 'admin'].includes(role);
}

const ESIM_PHONE = '+55 (11) 92683-9456';
const CODE_URGENT_MSG = 'Mande URGENTE para o Thiago — só ele reconecta no eSIM agora.';
const MOBILE_HINT =
  'Instância MOBILE: Configurações → WhatsApp → Pop-up / Ligação (request-registration-code). Código 8 letras é WEB e costuma falhar no Business.';

function buildCopyText(code: string, label?: string | null): string {
  return [
    '🚨 URGENTE — Reconexão Bot WhatsApp TM SEG',
    '',
    `Bot: ${label || 'Monitoramento 24h'}`,
    `Código (só se o painel tiver gerado): ${code}`,
    '',
    CODE_URGENT_MSG,
    '',
    MOBILE_HINT,
    '',
    `Preferencial: no sistema, Configurações → WhatsApp → pop-up wa_old no eSIM ${ESIM_PHONE}.`,
    'Alternativa (web): no WhatsApp Business → Aparelhos conectados → Vincular com número.',
    '',
    '⚠️ Códigos expiram em poucos minutos.',
  ].join('\n');
}

const WhatsAppOfflineModal: React.FC = () => {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const user = useMemo(() => readUser(), []);
  const userId = String(user?.id || '');
  const reconnectAdmin = isReconnectAdmin(user);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/whatsapp/bot-status');
      if (!res.ok) return;
      const data: BotStatus = await res.json();
      setStatus(data);
      if (data.online) {
        setMessage(null);
        setCopied(false);
      }
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
        setStatus((prev) => ({ ...(prev || { configured: true, online: false, label: null, lastError: null, incidentOpen: true, lock: null, modalDismissed: false }), ...payload as BotStatus }));
      })
      .on('broadcast', { event: 'modal_dismissed' }, () => {
        setStatus((prev) => (prev ? { ...prev, modalDismissed: true } : prev));
      })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [fetchStatus]);

  const lock = status?.lock || null;
  const isHolder = !!lock && lock.holderId === userId;
  const showModal = !!status?.configured && !status.online && !status.modalDismissed;

  const dismissModalGlobally = useCallback(() => {
    setStatus((prev) => (prev ? { ...prev, modalDismissed: true } : prev));
    broadcastModalDismissed();
    void authFetch('/api/whatsapp/bot-status/dismiss-modal', { method: 'POST' });
  }, []);

  const copyCodeToClipboard = async (code: string) => {
    const text = buildCopyText(code, status?.label);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      dismissModalGlobally();
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        dismissModalGlobally();
      } catch {
        setMessage('Não foi possível copiar automaticamente — selecione o código manualmente.');
      }
    }
  };

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

  const claimAndGenerate = async (forceTakeover = false) => {
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      const claimRes = await authFetch('/api/whatsapp/bot-status/claim', {
        method: 'POST',
        body: JSON.stringify({ force: forceTakeover }),
      });
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
        setStatus((s) => (s ? {
          ...s,
          lock: genData.lock,
          online: genData.connected === true,
          modalDismissed: genData.phoneLinkCode ? false : s.modalDismissed,
        } : s));
        broadcastBotStatus({
          lock: genData.lock,
          online: genData.connected === true,
          ...(genData.phoneLinkCode ? { modalDismissed: false } : {}),
        });
      }
      if (genData.connected) {
        setMessage('Bot reconectado com sucesso!');
        return;
      }
      if (genData.phoneLinkCode) {
        setMessage(`Código gerado. ${CODE_URGENT_MSG}`);
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
    setCopied(false);
    try {
      const res = await authFetch('/api/whatsapp/bot-status/generate-code', { method: 'POST' });
      const data = await res.json();
      if (data.lock) {
        setStatus((s) => (s ? {
          ...s,
          lock: data.lock,
          online: data.connected === true,
          modalDismissed: data.phoneLinkCode ? false : s.modalDismissed,
        } : s));
        broadcastBotStatus({
          lock: data.lock,
          online: data.connected === true,
          ...(data.phoneLinkCode ? { modalDismissed: false } : {}),
        });
      }
      if (data.connected) {
        setMessage('Bot reconectado com sucesso!');
        return;
      }
      if (data.phoneLinkCode) {
        setMessage(`Código gerado. ${CODE_URGENT_MSG}`);
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
  const displayLabel = status?.label || 'Monitoramento 24h';
  const displayError = sanitizeWhatsappError(status?.lastError);

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
              {displayLabel} — envios interrompidos
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-sm text-gray-800">
          <p className="leading-relaxed">
            O robô de WhatsApp caiu. <strong>Apenas um usuário</strong> deve assumir a reconexão.
            Assim que alguém assumir, os demais ficam em modo leitura até reconectar.
          </p>

          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-950 p-3 rounded-lg leading-relaxed">
            {MOBILE_HINT}
          </p>

          {reconnectAdmin && (
            <p className="text-xs bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-lg">
              <strong>Diretoria:</strong> priorize <strong>Configurações → WhatsApp → Enviar pop-up / Ligação</strong> com o Business aberto no eSIM {ESIM_PHONE}. QR ou app.z-api.io como fallback.
            </p>
          )}

          {displayError && (
            <p className="text-xs bg-red-50 border border-red-100 text-red-800 p-3 rounded-lg">
              {displayError}
            </p>
          )}

          {lock && !isHolder && (
            <div className="bg-amber-50 border border-amber-200 text-amber-950 p-4 rounded-lg space-y-3">
              <p className="font-bold">{lock.holderName} está reconectando</p>
              <p className="text-xs opacity-80">
                Desde {new Date(lock.acquiredAt).toLocaleTimeString('pt-BR')} — aguarde ou assuma se o código expirou.
              </p>
              {lock.phase === 'code_ready' && lock.phoneLinkCode && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs">
                    Código em uso: <span className="font-mono font-bold">{lock.phoneLinkCode}</span>
                  </p>
                  <span className="block text-xs font-bold text-amber-900">{CODE_URGENT_MSG}</span>
                  <button
                    type="button"
                    onClick={() => void copyCodeToClipboard(lock.phoneLinkCode!)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-lg"
                  >
                    <Copy size={14} /> Copiar código e instruções
                  </button>
                </div>
              )}
              {reconnectAdmin && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void claimAndGenerate(true)}
                  className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white text-sm font-bold py-3 px-4 rounded-xl disabled:opacity-50"
                >
                  {busy ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}
                  Assumir e gerar NOVO código
                </button>
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
                  <p className="mt-3 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {CODE_URGENT_MSG}
                  </p>
                  <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                    No WhatsApp Business do eSIM {ESIM_PHONE}:<br />
                    <strong>Aparelhos conectados → Conectar → Vincular com número de telefone</strong>
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void copyCodeToClipboard(phoneCode)}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl"
                      data-testid="button-copy-whatsapp-code"
                    >
                      {copied ? <Check size={18} /> : <Copy size={18} />}
                      {copied ? 'Copiado!' : 'Copiar código e instruções'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateCode()}
                      className="w-full flex items-center justify-center gap-2 border-2 border-red-300 text-red-800 hover:bg-red-50 font-bold py-2.5 px-4 rounded-xl disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                      Gerar NOVO código (se expirou)
                    </button>
                  </div>
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
              onClick={() => void claimAndGenerate(false)}
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
