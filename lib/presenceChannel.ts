import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  TMSEG_PRESENCE_CHANNEL,
  parsePresenceState,
  type PresenceUserState,
} from './timeclock/presence';

type PresenceListener = (users: PresenceUserState[]) => void;

interface PresenceChannelState {
  channel: RealtimeChannel;
  key: string;
  users: PresenceUserState[];
  listeners: Set<PresenceListener>;
  ready: boolean;
  lastPayload: PresenceUserState | null;
}

let state: PresenceChannelState | null = null;
let refCount = 0;

function generatePresenceKey(): string {
  try {
    const raw = localStorage.getItem('userData');
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string };
      if (parsed?.id) return parsed.id;
    }
  } catch {
    // ignora – cai no fallback
  }
  return `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function notify(current: PresenceChannelState): void {
  for (const listener of current.listeners) {
    try {
      listener(current.users);
    } catch (err) {
      console.warn('[presence] listener falhou', err);
    }
  }
}

function syncFromChannel(current: PresenceChannelState): void {
  try {
    const raw = current.channel.presenceState() as Record<string, unknown>;
    current.users = parsePresenceState(raw as any);
    notify(current);
  } catch (err) {
    console.warn('[presence] sync falhou', err);
  }
}

function ensureState(): PresenceChannelState {
  if (state) return state;

  const key = generatePresenceKey();
  const channel = supabase.channel(TMSEG_PRESENCE_CHANNEL, {
    config: { presence: { key } },
  });

  const current: PresenceChannelState = {
    channel,
    key,
    users: [],
    listeners: new Set(),
    ready: false,
    lastPayload: null,
  };

  channel.on('presence', { event: 'sync' }, () => syncFromChannel(current));
  channel.on('presence', { event: 'join' }, () => syncFromChannel(current));
  channel.on('presence', { event: 'leave' }, () => syncFromChannel(current));

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      current.ready = true;
      if (current.lastPayload) {
        try {
          await channel.track(current.lastPayload);
        } catch (err) {
          console.warn('[presence] track inicial falhou', err);
        }
      }
      syncFromChannel(current);
    }
  });

  state = current;
  return current;
}

function teardownIfIdle(): void {
  if (!state) return;
  if (refCount > 0) return;
  if (state.listeners.size > 0) return;
  const current = state;
  state = null;
  try {
    void current.channel.untrack();
  } catch {
    // ignora
  }
  try {
    void supabase.removeChannel(current.channel);
  } catch {
    // ignora
  }
}

/** Assina alterações da lista de presença. Retorna função de unsubscribe. */
export function subscribePresence(listener: PresenceListener): () => void {
  const current = ensureState();
  current.listeners.add(listener);
  try {
    listener(current.users);
  } catch (err) {
    console.warn('[presence] listener inicial falhou', err);
  }
  return () => {
    current.listeners.delete(listener);
    teardownIfIdle();
  };
}

/** Registra a presença do usuário atual. Retorna função para parar de rastrear. */
export function trackPresence(payload: PresenceUserState): () => void {
  const current = ensureState();
  refCount += 1;
  current.lastPayload = payload;
  if (current.ready) {
    void current.channel.track(payload).catch((err) => {
      console.warn('[presence] track falhou', err);
    });
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && state) {
      try {
        void state.channel.untrack();
      } catch {
        // ignora
      }
    }
    teardownIfIdle();
  };
}

/** Atualiza o payload atual (heartbeat). */
export function updatePresencePayload(payload: PresenceUserState): void {
  const current = state;
  if (!current) return;
  current.lastPayload = payload;
  if (current.ready) {
    void current.channel.track(payload).catch((err) => {
      console.warn('[presence] update falhou', err);
    });
  }
}
