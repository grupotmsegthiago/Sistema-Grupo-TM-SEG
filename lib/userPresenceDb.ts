import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { PresenceUserState } from './timeclock/presence';
import { normalizePresenceUserId } from './timeclock/presence';

/** Mesmo limiar do broadcast: sem heartbeat há 2 min = offline. */
export const PRESENCE_DB_STALE_MS = 120_000;
export const PRESENCE_DB_POLL_MS = 30_000;

type PresenceDbListener = (users: PresenceUserState[]) => void;

interface UserPresenceRow {
  user_id: string;
  name: string;
  role: string;
  contract_type: string | null;
  is_clt: boolean;
  on_duty: boolean;
  on_duty_label: string;
  online_at: string;
  last_seen: string;
  last_activity_at: string | null;
  minutes_on_duty: number | null;
  activity_status: 'active' | 'idle' | null;
  idle_minutes: number | null;
  punch_marks: PresenceUserState['punchMarks'] | null;
}

function rowToPresenceUserState(row: UserPresenceRow): PresenceUserState {
  return {
    userId: normalizePresenceUserId(row.user_id),
    name: row.name || 'Usuário',
    role: row.role || 'Online',
    contractType: row.contract_type || undefined,
    isClt: row.is_clt === true,
    onDuty: row.on_duty === true,
    onDutyLabel: row.on_duty_label || 'Online',
    onlineAt: row.online_at || row.last_seen || new Date(0).toISOString(),
    lastActivityAt: row.last_activity_at || undefined,
    minutesOnDuty:
      typeof row.minutes_on_duty === 'number' && Number.isFinite(row.minutes_on_duty)
        ? row.minutes_on_duty
        : undefined,
    activityStatus:
      row.activity_status === 'active' || row.activity_status === 'idle'
        ? row.activity_status
        : undefined,
    idleMinutes:
      typeof row.idle_minutes === 'number' && Number.isFinite(row.idle_minutes)
        ? row.idle_minutes
        : undefined,
    punchMarks: Array.isArray(row.punch_marks) ? row.punch_marks : undefined,
  };
}

function payloadToRow(payload: PresenceUserState): UserPresenceRow {
  const now = new Date().toISOString();
  return {
    user_id: normalizePresenceUserId(payload.userId),
    name: payload.name || 'Usuário',
    role: payload.role || 'Online',
    contract_type: payload.contractType || null,
    is_clt: payload.isClt === true,
    on_duty: payload.onDuty === true,
    on_duty_label: payload.onDutyLabel || 'Online',
    online_at: payload.onlineAt || now,
    last_seen: now,
    last_activity_at: payload.lastActivityAt || null,
    minutes_on_duty:
      typeof payload.minutesOnDuty === 'number' && Number.isFinite(payload.minutesOnDuty)
        ? payload.minutesOnDuty
        : null,
    activity_status: payload.activityStatus || null,
    idle_minutes:
      typeof payload.idleMinutes === 'number' && Number.isFinite(payload.idleMinutes)
        ? payload.idleMinutes
        : null,
    punch_marks: payload.punchMarks?.length ? payload.punchMarks : null,
  };
}

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || '').toLowerCase();
  return (
    msg.includes('user_presence') &&
    (msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('schema cache') ||
      msg.includes('42p01'))
  );
}

/** Grava/atualiza heartbeat do usuário logado no banco. */
export async function upsertUserPresenceDb(payload: PresenceUserState): Promise<void> {
  const userId = normalizePresenceUserId(payload.userId);
  if (!userId) return;

  const row = payloadToRow(payload);
  const { error } = await supabase.from('user_presence').upsert(
    { ...row, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  if (error && !isMissingTableError(error)) {
    console.warn('[TMSEG_PRESENCE_DB] upsert falhou:', error.message);
  }
}

/** Remove presença ao sair (logout / fechar aba). */
export async function removeUserPresenceDb(userId: unknown): Promise<void> {
  const id = normalizePresenceUserId(userId);
  if (!id) return;

  const { error } = await supabase.from('user_presence').delete().eq('user_id', id);
  if (error && !isMissingTableError(error)) {
    console.warn('[TMSEG_PRESENCE_DB] delete falhou:', error.message);
  }
}

/** Lista usuários com heartbeat recente (fonte confiável para o quadro). */
export async function fetchOnlineUsersFromDb(
  staleMs = PRESENCE_DB_STALE_MS,
): Promise<PresenceUserState[]> {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data, error } = await supabase
    .from('user_presence')
    .select('*')
    .gte('last_seen', cutoff)
    .order('name', { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return [];
    console.warn('[TMSEG_PRESENCE_DB] fetch falhou:', error.message);
    return [];
  }

  return (data as UserPresenceRow[] | null || []).map(rowToPresenceUserState);
}

interface DbSubscriptionState {
  listeners: Set<PresenceDbListener>;
  channel: RealtimeChannel | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  lastUsers: PresenceUserState[];
}

let dbState: DbSubscriptionState | null = null;

function emitDbUsers(current: DbSubscriptionState, users: PresenceUserState[]): void {
  current.lastUsers = users;
  for (const listener of current.listeners) {
    try {
      listener(users);
    } catch (err) {
      console.warn('[TMSEG_PRESENCE_DB] listener falhou', err);
    }
  }
}

async function refreshDbUsers(current: DbSubscriptionState): Promise<void> {
  const users = await fetchOnlineUsersFromDb();
  emitDbUsers(current, users);
}

function ensureDbState(): DbSubscriptionState {
  if (dbState) return dbState;

  const current: DbSubscriptionState = {
    listeners: new Set(),
    channel: null,
    pollTimer: null,
    lastUsers: [],
  };

  current.channel = supabase
    .channel('tmseg-user-presence-db')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_presence' },
      () => {
        void refreshDbUsers(current);
      },
    )
    .subscribe();

  current.pollTimer = setInterval(() => {
    void refreshDbUsers(current);
  }, PRESENCE_DB_POLL_MS);

  void refreshDbUsers(current);
  dbState = current;
  return current;
}

function teardownDbStateIfIdle(): void {
  if (!dbState || dbState.listeners.size > 0) return;
  const current = dbState;
  dbState = null;
  if (current.pollTimer) clearInterval(current.pollTimer);
  if (current.channel) {
    try {
      void supabase.removeChannel(current.channel);
    } catch {
      // ignora
    }
  }
}

/** Assina presença online via banco (polling + postgres_changes). */
export function subscribeUserPresenceDb(listener: PresenceDbListener): () => void {
  const current = ensureDbState();
  current.listeners.add(listener);
  listener(current.lastUsers);
  return () => {
    current.listeners.delete(listener);
    teardownDbStateIfIdle();
  };
}

/** Mescla broadcast (rápido) com banco (confiável); banco prevalece em conflito. */
export function mergePresenceSources(
  dbUsers: PresenceUserState[],
  broadcastUsers: PresenceUserState[],
): PresenceUserState[] {
  const merged = new Map<string, PresenceUserState>();

  for (const user of broadcastUsers) {
    const id = normalizePresenceUserId(user.userId);
    if (id) merged.set(id, user);
  }

  for (const user of dbUsers) {
    const id = normalizePresenceUserId(user.userId);
    if (id) merged.set(id, user);
  }

  return Array.from(merged.values()).sort((a, b) =>
    (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR'),
  );
}
