import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MISSION_LIVE_WINDOW_EVENT } from '../lib/missionLiveBroadcast';
import {
  DHL_COPIA_ALERTA_EVENT,
  TABELA_DHL_VIATURA,
  copiaBloqueadaPara,
  podeVerPainelDhl,
  textoAlertaJaCopiado,
  type AvisoCopiaDhl,
} from '../lib/dhlViaturaDisponivel';

type SessionUser = {
  name?: string;
  role?: string;
  profileName?: string;
  permissions?: string[];
  providerId?: string | null;
  clientId?: string | null;
  userType?: string | null;
};

function readUser(): SessionUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem('userData') || '{}');
    if (!raw?.name && !raw?.role) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Alerta global: outro operador já copiou o texto da DHL. Vale em qualquer tela. */
const DhlCopiaAoVivo: React.FC = () => {
  const [user] = useState<SessionUser | null>(() => readUser());
  const [aviso, setAviso] = useState<AvisoCopiaDhl | null>(null);
  const podeVer = podeVerPainelDhl(user);

  useEffect(() => {
    if (!podeVer) return;
    const visto = new Map<string, number>();
    const mostrar = (proximo: AvisoCopiaDhl) => {
      if (!copiaBloqueadaPara(proximo.copiadoPor, user?.name)) return;
      const chave = `${proximo.missionId}:${proximo.copiadoPor}`;
      const agora = Date.now();
      if (proximo.origem === 'ao-vivo' && (visto.get(chave) || 0) > agora - 8000) return;
      visto.set(chave, agora);
      setAviso(proximo);
    };
    const onLive = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.event !== 'dhl_viatura') return;
      const payload = detail.payload || {};
      if (payload.status !== 'copiado' || !payload.missionId) return;
      mostrar({
        missionId: String(payload.missionId),
        copiadoPor: String(payload.copiadoPor || 'Outro operador'),
        posicao: String(payload.posicao || ''),
        regiao: String(payload.regiao || ''),
        origem: 'ao-vivo',
      });
    };
    const onClique = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as AvisoCopiaDhl | undefined;
      if (!detail?.missionId) return;
      mostrar({ ...detail, origem: 'clique' });
    };
    window.addEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
    window.addEventListener(DHL_COPIA_ALERTA_EVENT, onClique);

    const channel = supabase
      .channel('dhl-viatura-disponivel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABELA_DHL_VIATURA }, (payload) => {
        const row = (payload.new || {}) as Record<string, unknown>;
        if (String(row.status || '') !== 'copiado' || !row.mission_id) return;
        window.dispatchEvent(new CustomEvent(MISSION_LIVE_WINDOW_EVENT, {
          detail: {
            event: 'dhl_viatura',
            payload: {
              missionId: String(row.mission_id),
              status: 'copiado',
              copiadoPor: String(row.copiado_por || ''),
              posicao: String(row.posicao || ''),
              regiao: String(row.regiao || ''),
            },
          },
        }));
      })
      .subscribe();

    return () => {
      window.removeEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
      window.removeEventListener(DHL_COPIA_ALERTA_EVENT, onClique);
      void supabase.removeChannel(channel);
    };
  }, [podeVer, user?.name]);

  if (!aviso) return null;
  const texto = textoAlertaJaCopiado(aviso.copiadoPor, aviso.missionId, aviso.posicao);

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4" data-testid="alerta-dhl-ja-copiado">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-4 border-amber-500 bg-white shadow-2xl">
        <div className="flex items-start gap-2 bg-amber-500 px-4 py-3 text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-black uppercase">{aviso.copiadoPor} já copiou a mensagem</p>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm font-semibold text-gray-800">{texto}</p>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="w-full rounded-lg bg-gray-900 py-2 text-xs font-black uppercase text-white"
            data-testid="button-fechar-alerta-dhl-copia"
          >
            Entendi, não vou enviar de novo
          </button>
        </div>
      </div>
    </div>
  );
};

export default DhlCopiaAoVivo;
