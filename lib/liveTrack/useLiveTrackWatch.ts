import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '../authFetch';
import { parseJsonResponse } from '../parseJsonResponse';
import { LIVE_TRACK_WATCH_MS, isLiveTrackStale } from './pure';

export type LiveTrackWatchBody = {
  enabled?: boolean;
  hasTrack?: boolean;
  reason?: string;
  osNumber?: string;
  missionStatus?: string;
  url?: string;
  whatsappText?: string;
  trail?: Array<{ lat: number; lng: number; recorded_at: string }>;
  track?: {
    id: string;
    status: string;
    consent_at?: string | null;
    opened_at?: string | null;
    open_count?: number;
    sharing_started_at?: string | null;
    last_seen_at?: string | null;
    last_lat?: number | null;
    last_lng?: number | null;
    last_accuracy?: number | null;
    last_speed?: number | null;
    last_heading?: number | null;
    ended_at?: string | null;
    ended_reason?: string | null;
  };
};

export function liveTrackOperatorLabel(data: LiveTrackWatchBody | null): {
  text: string;
  tone: 'idle' | 'wait' | 'live' | 'stale' | 'ended';
} {
  if (!data?.hasTrack || !data.track) return { text: 'Sem link gerado', tone: 'idle' };
  const st = data.track.status;
  if (st === 'ended') return { text: 'Rastreio encerrado', tone: 'ended' };
  if (st === 'pending') return { text: 'Aguardando o agente abrir o link', tone: 'wait' };
  if (st === 'consented') return { text: 'Agente aceitou — aguardando GPS', tone: 'wait' };
  if (st === 'paused' && !isLiveTrackStale(data.track.last_seen_at)) {
    return { text: 'Ao vivo (segundo plano)', tone: 'live' };
  }
  if (st === 'paused') return { text: 'Sinal perdido — peça para não fechar o navegador', tone: 'stale' };
  if (st === 'sharing' && isLiveTrackStale(data.track.last_seen_at)) {
    return { text: 'Sinal perdido — peça para não fechar o navegador', tone: 'stale' };
  }
  if (st === 'sharing') return { text: 'Ao vivo — segundo plano ativo', tone: 'live' };
  return { text: st, tone: 'wait' };
}

export function useLiveTrackWatch(missionId: string | null | undefined, enabled: boolean, trail = false) {
  const [data, setData] = useState<LiveTrackWatchBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!missionId || !enabled) return;
    try {
      const qs = new URLSearchParams({ op: 'watch', missionId, ...(trail ? { trail: '1' } : {}) });
      const r = await authFetch(`/api/live-track?${qs.toString()}`);
      const j = await parseJsonResponse(r);
      if (!mounted.current) return;
      if (!r.ok) {
        setError(j?.error || 'Falha ao ler rastreio');
        return;
      }
      setError(null);
      setData(j);
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || 'Falha de rede no rastreio');
    }
  }, [missionId, enabled, trail]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled || !missionId) return;
    void load();
    const id = window.setInterval(() => { void load(); }, LIVE_TRACK_WATCH_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [enabled, missionId, load]);

  return { data, error, reload: load };
}
