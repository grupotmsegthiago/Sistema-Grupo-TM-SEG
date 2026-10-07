import React, { useEffect, useRef, useState } from 'react';
import { Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MISSION_LIVE_WINDOW_EVENT } from '../lib/missionLiveBroadcast';
import {
  HORA_MS,
  TABELA_DHL_VIATURA,
  TEXTO_ALERTA_VIATURA_DISPONIVEL,
  detalheAlertaViaturaDisponivel,
  deveAvisarOperadores,
  fornecedorEntraNoComunicadoDhl,
  podeVerPainelDhl,
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

type Aviso = {
  missionId: string;
  posicao: string;
  regiao: string;
};

const AVISOS_VISTOS = 'tmseg:dhl-viaturas-avisadas';

function readUser(): SessionUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem('userData') || '{}');
    if (!raw?.name && !raw?.role) return null;
    return raw;
  } catch {
    return null;
  }
}

function idsJaAvisados(): Set<string> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(AVISOS_VISTOS) || '[]');
    return new Set(Array.isArray(raw) ? raw.map((id) => String(id)) : []);
  } catch {
    return new Set();
  }
}

function gravarAvisados(ids: Set<string>) {
  try {
    sessionStorage.setItem(AVISOS_VISTOS, JSON.stringify([...ids].slice(-80)));
  } catch {
    /* aba sem storage segue só com a memória da tela */
  }
}

function tocarAviso() {
  try {
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => { void ctx.close(); };
  } catch {
    /* autoplay bloqueado: o cartão ainda aparece */
  }
}

/** Aviso para a operação inteira quando uma viatura entra na regra da DHL. */
const DhlViaturaNovaAlerta: React.FC = () => {
  const [user] = useState<SessionUser | null>(() => readUser());
  const [fila, setFila] = useState<Aviso[]>([]);
  const podeVer = podeVerPainelDhl(user);
  const vistos = useRef<Set<string>>(new Set());
  const ultimoSom = useRef(0);

  useEffect(() => {
    if (!podeVer) return;
    let ativo = true;
    vistos.current = idsJaAvisados();

    const enfileirar = (aviso: Aviso) => {
      if (!ativo) return;
      const id = String(aviso.missionId || '').trim();
      if (!id || vistos.current.has(id)) return;
      vistos.current.add(id);
      gravarAvisados(vistos.current);
      setFila((atual) => [...atual, { missionId: id, posicao: aviso.posicao || '', regiao: aviso.regiao || '' }]);
      const agora = Date.now();
      if (agora - ultimoSom.current < 2000) return;
      ultimoSom.current = agora;
      tocarAviso();
    };

    const onLive = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.event !== 'dhl_viatura') return;
      const payload = detail.payload || {};
      if (payload.status !== 'pendente' || !payload.missionId) return;
      enfileirar({
        missionId: String(payload.missionId),
        posicao: String(payload.posicao || ''),
        regiao: String(payload.regiao || ''),
      });
    };
    window.addEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);

    const channel = supabase
      .channel('dhl-viatura-nova')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABELA_DHL_VIATURA }, (payload) => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const finalizada = String(row.finalizada_em || '');
        if (!fornecedorEntraNoComunicadoDhl(String(row.provider_name || ''))) return;
        if (!row.mission_id || !deveAvisarOperadores(String(row.status || ''), finalizada, new Date(), String(row.provider_name || ''))) return;
        enfileirar({
          missionId: String(row.mission_id),
          posicao: String(row.posicao || ''),
          regiao: String(row.regiao || ''),
        });
      })
      .subscribe();

    const corte = new Date(Date.now() - HORA_MS).toISOString();
    void supabase
      .from(TABELA_DHL_VIATURA)
      .select('mission_id, posicao, regiao, status, finalizada_em, provider_name')
      .eq('status', 'pendente')
      .gte('finalizada_em', corte)
      .order('finalizada_em', { ascending: true })
      .limit(20)
      .then(({ data, error }) => {
        if (!ativo || error || !data) return;
        const agora = new Date();
        for (const row of data as Array<Record<string, unknown>>) {
          const finalizada = String(row.finalizada_em || '');
          if (!deveAvisarOperadores(String(row.status || ''), finalizada, agora, String(row.provider_name || ''))) continue;
          enfileirar({
            missionId: String(row.mission_id || ''),
            posicao: String(row.posicao || ''),
            regiao: String(row.regiao || ''),
          });
        }
      });

    return () => {
      ativo = false;
      window.removeEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
      void supabase.removeChannel(channel);
    };
  }, [podeVer]);

  const atual = fila[0];
  if (!atual) return null;
  const lugar = detalheAlertaViaturaDisponivel(atual.posicao, atual.regiao);
  const restantes = fila.length - 1;

  return (
    <div className="fixed inset-0 z-[235] flex items-center justify-center bg-black/60 p-4" data-testid="alerta-dhl-viatura-disponivel">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-4 border-[#D40511] bg-white shadow-2xl">
        <div className="flex items-start gap-2 bg-[#FFCC00] px-4 py-3 text-[#D40511]">
          <Truck size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-black uppercase">{TEXTO_ALERTA_VIATURA_DISPONIVEL}</p>
        </div>
        <div className="space-y-3 p-4">
          {lugar ? <p className="text-sm font-semibold text-gray-800">{lugar}</p> : null}
          <p className="text-xs text-gray-600">Clique em Comunicar a DHL no painel. O aviso vale para todos os operadores.</p>
          {restantes > 0 ? (
            <p className="text-xs font-bold text-[#D40511]">
              {restantes === 1 ? 'Mais 1 viatura na fila.' : `Mais ${restantes} viaturas na fila.`}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setFila((itens) => itens.slice(1))}
            className="w-full rounded-lg bg-[#D40511] py-2 text-xs font-black uppercase text-white"
            data-testid="button-fechar-alerta-dhl-viatura"
          >
            Entendi, vou comunicar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DhlViaturaNovaAlerta;
