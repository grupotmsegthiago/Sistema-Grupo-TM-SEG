// ── Lock distribuído: um usuário gera código de reconexão por vez ─────────────
import { createSupabaseAdminClient } from "./supabaseConfig";

const LOCK_KEY = "zapi_reconnect_lock";
export const ZAPI_RECONNECT_LOCK_TTL_MS = 10 * 60 * 1000;

export type ZapiReconnectLockPhase = "claimed" | "generating" | "code_ready" | "done";

export type ZapiReconnectLock = {
  holderId: string;
  holderName: string;
  acquiredAt: string;
  expiresAt: string;
  phase: ZapiReconnectLockPhase;
  phoneLinkCode?: string | null;
  reconnectMessage?: string | null;
};

function normalize(raw: unknown): ZapiReconnectLock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const holderId = String(o.holderId || "").trim();
  const holderName = String(o.holderName || "").trim();
  const expiresAt = String(o.expiresAt || "");
  if (!holderId || !holderName || !expiresAt) return null;
  const phase = String(o.phase || "claimed") as ZapiReconnectLockPhase;
  return {
    holderId,
    holderName,
    acquiredAt: String(o.acquiredAt || new Date().toISOString()),
    expiresAt,
    phase: ["claimed", "generating", "code_ready", "done"].includes(phase) ? phase : "claimed",
    phoneLinkCode: o.phoneLinkCode != null ? String(o.phoneLinkCode) : null,
    reconnectMessage: o.reconnectMessage != null ? String(o.reconnectMessage) : null,
  };
}

export function isLockActive(lock: ZapiReconnectLock | null, now = Date.now()): lock is ZapiReconnectLock {
  if (!lock) return false;
  const exp = Date.parse(lock.expiresAt);
  return Number.isFinite(exp) && exp > now;
}

export async function loadZapiReconnectLock(): Promise<ZapiReconnectLock | null> {
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", LOCK_KEY).maybeSingle();
    const lock = normalize(data?.value);
    if (!isLockActive(lock)) {
      if (lock) await clearZapiReconnectLock();
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

async function persistLock(lock: ZapiReconnectLock | null): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const now = new Date().toISOString();
  if (!lock) {
    await sb.from("system_settings").delete().eq("key", LOCK_KEY);
    return;
  }
  await sb.from("system_settings").upsert([{
    key: LOCK_KEY,
    value: lock,
    updated_by: "Z-API Reconnect Lock",
    updated_at: now,
  }], { onConflict: "key" });
}

export async function clearZapiReconnectLock(): Promise<void> {
  await persistLock(null);
}

export async function claimZapiReconnectLock(
  holderId: string,
  holderName: string,
): Promise<{ ok: boolean; lock: ZapiReconnectLock | null; reason?: string }> {
  const id = String(holderId || "").trim();
  const name = String(holderName || "").trim() || "Usuário";
  if (!id) return { ok: false, lock: null, reason: "Usuário inválido" };

  const current = await loadZapiReconnectLock();
  const now = Date.now();
  if (isLockActive(current) && current.holderId !== id) {
    return {
      ok: false,
      lock: current,
      reason: `${current.holderName} já está reconectando o bot.`,
    };
  }

  const lock: ZapiReconnectLock = {
    holderId: id,
    holderName: name,
    acquiredAt: current?.holderId === id ? current.acquiredAt : new Date().toISOString(),
    expiresAt: new Date(now + ZAPI_RECONNECT_LOCK_TTL_MS).toISOString(),
    phase: current?.holderId === id ? (current.phase || "claimed") : "claimed",
    phoneLinkCode: current?.holderId === id ? current.phoneLinkCode : null,
    reconnectMessage: current?.holderId === id ? current.reconnectMessage : null,
  };
  await persistLock(lock);
  return { ok: true, lock };
}

export async function heartbeatZapiReconnectLock(holderId: string): Promise<ZapiReconnectLock | null> {
  const id = String(holderId || "").trim();
  const current = await loadZapiReconnectLock();
  if (!isLockActive(current) || current.holderId !== id) return current;
  const lock: ZapiReconnectLock = {
    ...current,
    expiresAt: new Date(Date.now() + ZAPI_RECONNECT_LOCK_TTL_MS).toISOString(),
  };
  await persistLock(lock);
  return lock;
}

export async function updateZapiReconnectLock(
  holderId: string,
  patch: Partial<Pick<ZapiReconnectLock, "phase" | "phoneLinkCode" | "reconnectMessage">>,
): Promise<ZapiReconnectLock | null> {
  const id = String(holderId || "").trim();
  const current = await loadZapiReconnectLock();
  if (!isLockActive(current) || current.holderId !== id) return current;
  const lock: ZapiReconnectLock = {
    ...current,
    ...patch,
    expiresAt: new Date(Date.now() + ZAPI_RECONNECT_LOCK_TTL_MS).toISOString(),
  };
  await persistLock(lock);
  return lock;
}

export async function releaseZapiReconnectLock(holderId: string, force = false): Promise<void> {
  const id = String(holderId || "").trim();
  const current = await loadZapiReconnectLock();
  if (!current) return;
  if (!force && current.holderId !== id) return;
  await clearZapiReconnectLock();
}
