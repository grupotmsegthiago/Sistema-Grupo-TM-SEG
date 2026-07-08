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
  hasTracked: boolean;
}

let state: PresenceChannelState | null = null;
let refCount = 0;
const refreshTarget = new EventTarget();

const DEBUG = typeof window !== 'undefined';
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[TMSEG_PRESENCE]', ...args);
};

/** Pede ao tracker atual para refazer o track imediatamente (usado após bater ponto etc.). */
export function requestPresenceRefresh(): void {
  refreshTarget.dispatchEvent(new Event('refresh'));
}

/** Inscreve um callback para reagir a pedidos de refresh (usado internamente pelo tracker). */
export function onPresenceRefreshRequested(cb: () => void): () => void {
  const handler = () => {
    try {
      cb();
    } catch (err) {
      console.warn('[TMSEG_PRESENCE] refresh handler falhou', err);
    }
  };
  refreshTarget.addEventListener('refresh', handler);
  return () => refreshTarget.removeEventListener('refresh', handler);
}

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
      console.warn('[TMSEG_PRESENCE] listener falhou', err);
    }
  }
}

function syncFromChannel(current: PresenceChannelState, origem: string): void {
  try {
    const raw = current.channel.presenceState() as Record<string, unknown>;
    const users = parsePresenceState(raw as any);
    current.users = users;
    log(`sync (${origem}) → ${users.length} usuário(s):`, users.map((u) => `${u.name} [${u.userId}]`));
    notify(current);
  } catch (err) {
    console.warn('[TMSEG_PRESENCE] sync falhou', err);
  }
}

async function performTrack(current: PresenceChannelState, origem: string): Promise<void> {
  if (!current.ready) {
    log(`track ignorado (${origem}) — canal ainda não pronto`);
    return;
  }
  if (!current.lastPayload) {
    log(`track ignorado (${origem}) — sem payload`);
    return;
  }
  try {
    const result = await current.channel.track(current.lastPayload);
    current.hasTracked = true;
    log(`track ok (${origem}) →`, current.lastPayload.name, 'result=', result);
    setTimeout(() => syncFromChannel(current, `after-track-${origem}`), 300);
  } catch (err) {
    console.warn(`[TMSEG_PRESENCE] track falhou (${origem})`, err);
  }
}

function ensureState(): PresenceChannelState {
  if (state) return state;

  const key = generatePresenceKey();
  log('criando canal de presença, key=', key);
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
    hasTracked: false,
  };

  channel.on('presence', { event: 'sync' }, () => syncFromChannel(current, 'evt-sync'));
  channel.on('presence', { event: 'join' }, () => syncFromChannel(current, 'evt-join'));
  channel.on('presence', { event: 'leave' }, () => syncFromChannel(current, 'evt-leave'));

  channel.subscribe((status) => {
    log('subscribe status =', status);
    if (status === 'SUBSCRIBED') {
      current.ready = true;
      void performTrack(current, 'on-subscribed');
      syncFromChannel(current, 'on-subscribed');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      current.ready = false;
    }
  });

  state = current;
  return current;
}

function teardownIfIdle(): void {
  if (!state) return;
  if (refCount > 0) return;
  if (state.listeners.size > 0) return;
  log('teardown do canal (sem listeners nem trackers)');
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
  log('novo listener. total =', current.listeners.size, '| users atuais =', current.users.length);
  try {
    listener(current.users);
  } catch (err) {
    console.warn('[TMSEG_PRESENCE] listener inicial falhou', err);
  }
  return () => {
    current.listeners.delete(listener);
    log('listener removido. total =', current.listeners.size);
    teardownIfIdle();
  };
}

/** Registra a presença do usuário atual. Retorna função para parar de rastrear. */
export function trackPresence(payload: PresenceUserState): () => void {
  const current = ensureState();
  refCount += 1;
  current.lastPayload = payload;
  log('trackPresence chamado. ready=', current.ready, 'name=', payload.name);
  void performTrack(current, 'trackPresence');
  return () => {
    refCount = Math.max(0, refCount - 1);
    log('trackPresence untrack. refCount=', refCount);
    if (refCount === 0 && state) {
      try {
        void state.channel.untrack();
        state.hasTracked = false;
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
  if (!current) {
    log('updatePresencePayload sem state — abrindo canal para rastrear novamente');
    trackPresence(payload);
    return;
  }
  current.lastPayload = payload;
  log('updatePresencePayload. ready=', current.ready);
  void performTrack(current, 'updatePresencePayload');
}
