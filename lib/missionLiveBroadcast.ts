import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, MISSION_UPDATES_BROADCAST_CHANNEL } from './supabase';

/** Um único canal para o sistema inteiro. As telas escutam o evento da janela. */
export const MISSION_LIVE_WINDOW_EVENT = 'tmseg:mission-live';

let liveChannel: RealtimeChannel | null = null;
let liveBound = false;

export function getMissionLiveChannel(): RealtimeChannel {
  if (!liveChannel) {
    liveChannel = supabase.channel(MISSION_UPDATES_BROADCAST_CHANNEL, {
      config: { broadcast: { self: false } },
    });
  }
  return liveChannel;
}

/** Liga o aviso uma vez. Fica ativo em qualquer tela. */
export function bindMissionLiveChannel(): RealtimeChannel {
  const channel = getMissionLiveChannel();
  if (liveBound) return channel;
  liveBound = true;
  const forward = (event: string) => ({ payload }: { payload?: Record<string, unknown> }) => {
    window.dispatchEvent(new CustomEvent(MISSION_LIVE_WINDOW_EVENT, { detail: { event, payload } }));
  };
  channel.on('broadcast', { event: 'mission_updated' }, forward('mission_updated'));
  channel.on('broadcast', { event: 'handover_note' }, forward('handover_note'));
  channel.on('broadcast', { event: 'controle_diario_note' }, forward('controle_diario_note'));
  channel.on('broadcast', { event: 'occurrence' }, forward('occurrence'));
  channel.on('broadcast', { event: 'dhl_viatura' }, forward('dhl_viatura'));
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] Avisos de OS, observação e passagem ativos');
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setTimeout(() => { void channel.subscribe(); }, 3000);
    }
  });
  return channel;
}

function waitUntilJoined(channel: RealtimeChannel): Promise<void> {
  if (channel.state === 'joined') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 2500);
    if (channel.state === 'joining') {
      const poll = setInterval(() => {
        if (channel.state !== 'joining') {
          clearInterval(poll);
          clearTimeout(timer);
          resolve();
        }
      }, 50);
      return;
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Avisa as outras sessões abertas, sem esperar o banco republicar a linha. */
export async function publishMissionLive(event: string, payload: Record<string, unknown>) {
  try {
    const channel = getMissionLiveChannel();
    await waitUntilJoined(channel);
    await channel.send({ type: 'broadcast', event, payload });
  } catch (err) {
    console.warn('[Realtime] não avisou as outras telas:', event, err);
  }
}
