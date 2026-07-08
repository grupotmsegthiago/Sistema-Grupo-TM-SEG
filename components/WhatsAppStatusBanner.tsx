import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const MONITOR_ROLES = new Set(['diretoria', 'administrador', 'ceo', 'operacional', 'admin']);

type ConnPayload = {
  lastConnected?: boolean | null;
  status?: { connected?: boolean; smartphoneConnected?: boolean };
  lastError?: string | null;
};

const WhatsAppStatusBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) { setVisible(false); return; }
      const user = JSON.parse(raw);
      const role = String(user?.role || '').toLowerCase();
      if (!MONITOR_ROLES.has(role)) { setVisible(false); return; }

      const res = await authFetch('/api/whatsapp/connection/status');
      if (!res.ok) return;
      const data: ConnPayload = await res.json();
      const ok = data.status?.connected === true && data.status?.smartphoneConnected !== false;
      setConnected(ok);
      setVisible(!ok);
      if (!ok) {
        const parts: string[] = [];
        if (data.status?.smartphoneConnected === false) parts.push('celular offline');
        if (data.lastError) parts.push(data.lastError);
        setDetail(parts.length ? parts.join(' · ') : 'Reconecte pela extensão Z-API (Configurações → WhatsApp)');
      } else {
        setDetail(null);
      }
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void check();
    const id = setInterval(() => { void check(); }, 60_000);
    return () => clearInterval(id);
  }, [check]);

  if (!visible) return null;

  return (
    <div
      className="bg-red-700 text-white px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide z-40 shadow-md"
      role="alert"
      data-testid="whatsapp-status-banner"
    >
      <WifiOff size={16} className="shrink-0" />
      <span>WhatsApp Bot OFFLINE — envios a grupos interrompidos</span>
      {detail && <span className="normal-case font-medium opacity-90">({detail})</span>}
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: 'system-settings' })); }}
        className="underline ml-2 lowercase font-bold"
      >
        reconectar agora
      </a>
      {connected === false && <AlertTriangle size={14} className="opacity-80" />}
      <Wifi size={0} className="hidden" aria-hidden />
    </div>
  );
};

export default WhatsAppStatusBanner;
