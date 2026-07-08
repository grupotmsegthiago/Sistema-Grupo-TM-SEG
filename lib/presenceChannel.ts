import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { PresenceUserState } from './timeclock/presence';

/**
 * Sistema de presença baseado em Broadcast do Supabase Realtime.
 *
 * Por que Broadcast em vez de Presence?
 * - Presence depende do serviço de Presence estar habilitado no projeto
 *   Supabase e às vezes exige RLS/authorization específica.
 * - Broadcast é a primitiva mais robusta do Realtime: funciona sem
 *   configuração extra e todos os projetos Supabase têm por padrão.
 *
 * Como funciona:
 * - Cada cliente envia um "heartbeat" broadcast a cada BROADCAST_INTERVAL_MS
 *   com seu payload de presença.
 * - Cada cliente recebe heartbeats dos outros e mantém um Map { userId -> {...} }.
 * - Um cleanup periódico remove clientes que não deram heartbeat há STALE_MS.
 */

const PRESENCE_CHANNEL = 'tmseg-user-presence-v2';
const BROADCAST_EVENT_HELLO = 'hello';
const BROADCAST_EVENT_BYE = 'bye';
const BROADCAST_INTERVAL_MS = 15_000;
const STALE_MS = 60_000; // se não recebeu ping há 60s, considera offline
const CLEANUP_INTERVAL_MS = 20_000;

const DEBUG = typeof window !== 'undefined';
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[TMSEG_PRESENCE]', ...args);
};

type PresenceListener = (users: PresenceUserState[]) => void;

interface PresenceRecord extends PresenceUserState {
  lastSeen: number;
}

interface PresenceState {
  channel: RealtimeChannel;
  ready: boolean;
  listeners: Set<PresenceListener>;
  users: Map<string, PresenceRecord>;
  lastPayload: PresenceUserState | null;
  broadcastTimer: ReturnType<typeof setInterval> | null;
  cleanupTimer: ReturnType<typeof setInterval> | null;
  trackers: number;
}

let state: PresenceState | null = null;
const refreshTarget = new EventTarget();

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────

/** Solicita ao tracker atual que refaça o broadcast imediatamente. */
export function requestPresenceRefresh(): void {
  refreshTarget.dispatchEvent(new Event('refresh'));
}

/** Inscreve callback para reagir a pedidos de refresh externos (uso interno). */
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

/** Assina alterações da lista de presença. Retorna função para dessubscrever. */
export function subscribePresence(listener: PresenceListener): () => void {
  const current = ensureState();
  current.listeners.add(listener);
  log('novo listener. total =', current.listeners.size);
  emit(current, listener);
  return () => {
    current.listeners.delete(listener);
    teardownIfIdle();
  };
}

/** Registra a presença do usuário atual. Retorna função para parar. */
export function trackPresence(payload: PresenceUserState): () => void {
  const current = ensureState();
  current.trackers += 1;
  current.lastPayload = payload;
  log('trackPresence chamado. name=', payload.name, 'ready=', current.ready);
  // Guarda o próprio usuário no map local imediatamente, sem esperar o servidor.
  upsertLocal(current, payload);
  if (current.ready) void sendHello(current);
  ensureBroadcastTimer(current);
  return () => {
    current.trackers = Math.max(0, current.trackers - 1);
    if (current.trackers === 0) {
      void sendBye(current);
      if (current.lastPayload) {
        current.users.delete(current.lastPayload.userId);
      }
      current.lastPayload = null;
      broadcastToListeners(current);
    }
    teardownIfIdle();
  };
}

/** Atualiza o payload atual (heartbeat manual, ex.: após bater ponto). */
export function updatePresencePayload(payload: PresenceUserState): void {
  const current = state;
  if (!current) {
    log('updatePresencePayload sem state — abrindo canal');
    trackPresence(payload);
    return;
  }
  current.lastPayload = payload;
  upsertLocal(current, payload);
  if (current.ready) void sendHello(current);
}

// ─────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────

function emit(current: PresenceState, only?: PresenceListener): void {
  const list = Array.from(current.users.values()).map(({ lastSeen: _ls, ...user }) => user);
  list.sort((a, b) => (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR'));
  if (only) {
    try {
      only(list);
    } catch (err) {
      console.warn('[TMSEG_PRESENCE] listener falhou', err);
    }
    return;
  }
  for (const l of current.listeners) {
    try {
      l(list);
    } catch (err) {
      console.warn('[TMSEG_PRESENCE] listener falhou', err);
    }
  }
}

function broadcastToListeners(current: PresenceState): void {
  emit(current);
}

function upsertLocal(current: PresenceState, payload: PresenceUserState): void {
  current.users.set(payload.userId, {
    ...payload,
    lastSeen: Date.now(),
  });
  broadcastToListeners(current);
}

async function sendHello(current: PresenceState): Promise<void> {
  if (!current.lastPayload) return;
  try {
    const result = await current.channel.send({
      type: 'broadcast',
      event: BROADCAST_EVENT_HELLO,
      payload: current.lastPayload,
    });
    log('hello enviado. name=', current.lastPayload.name, 'result=', result);
  } catch (err) {
    console.warn('[TMSEG_PRESENCE] send hello falhou', err);
  }
}

async function sendBye(current: PresenceState): Promise<void> {
  const payload = current.lastPayload;
  if (!payload) return;
  try {
    await current.channel.send({
      type: 'broadcast',
      event: BROADCAST_EVENT_BYE,
      payload: { userId: payload.userId },
    });
    log('bye enviado. userId=', payload.userId);
  } catch {
    // ignora
  }
}

function ensureBroadcastTimer(current: PresenceState): void {
  if (current.broadcastTimer) return;
  current.broadcastTimer = setInterval(() => {
    if (current.ready) {
      void sendHello(current);
      // renova nosso próprio lastSeen (para não expirarmos a nós mesmos)
      if (current.lastPayload) upsertLocal(current, current.lastPayload);
    }
  }, BROADCAST_INTERVAL_MS);
}

function ensureCleanupTimer(current: PresenceState): void {
  if (current.cleanupTimer) return;
  current.cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - STALE_MS;
    let changed = false;
    for (const [id, rec] of current.users) {
      // Nunca expira o próprio usuário (ele é atualizado pelo próprio broadcast).
      const isMe = current.lastPayload?.userId === id;
      if (!isMe && rec.lastSeen < cutoff) {
        current.users.delete(id);
        changed = true;
      }
    }
    if (changed) broadcastToListeners(current);
  }, CLEANUP_INTERVAL_MS);
}

function ensureState(): PresenceState {
  if (state) return state;
  log('criando canal broadcast de presença');

  const current: PresenceState = {
    channel: null as unknown as RealtimeChannel,
    ready: false,
    listeners: new Set(),
    users: new Map(),
    lastPayload: null,
    broadcastTimer: null,
    cleanupTimer: null,
    trackers: 0,
  };

  const channel = supabase
    .channel(PRESENCE_CHANNEL, { config: { broadcast: { self: true } } })
    .on('broadcast', { event: BROADCAST_EVENT_HELLO }, ({ payload }) => {
      const p = payload as PresenceUserState | undefined;
      if (!p?.userId) return;
      log('hello recebido de', p.name, `[${p.userId}]`);
      upsertLocal(current, p);
    })
    .on('broadcast', { event: BROADCAST_EVENT_BYE }, ({ payload }) => {
      const p = payload as { userId?: string } | undefined;
      if (!p?.userId) return;
      log('bye recebido de', p.userId);
      current.users.delete(p.userId);
      broadcastToListeners(current);
    })
    .subscribe((status, err) => {
      log('subscribe status =', status, err ? `err=${String(err)}` : '');
      if (status === 'SUBSCRIBED') {
        current.ready = true;
        if (current.lastPayload) void sendHello(current);
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        current.ready = false;
      }
    });

  current.channel = channel;
  ensureCleanupTimer(current);
  state = current;
  return current;
}

function teardownIfIdle(): void {
  if (!state) return;
  if (state.trackers > 0 || state.listeners.size > 0) return;
  log('teardown do canal (sem listeners nem trackers)');
  const current = state;
  state = null;
  if (current.broadcastTimer) clearInterval(current.broadcastTimer);
  if (current.cleanupTimer) clearInterval(current.cleanupTimer);
  try {
    void supabase.removeChannel(current.channel);
  } catch {
    // ignora
  }
}
