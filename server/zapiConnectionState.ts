// ── Geração de sessão Z-API (connection_generation) ─────────────────────────
// Incrementa a cada reconexão confirmada pelo vigia. Permite correlacionar
// envios com "sessão 15 → queda → sessão 16 → bloqueio".

import { createSupabaseAdminClient } from "./supabaseConfig";

const SETTINGS_KEY = "zapi_connection_state";

export type ConnectionState = {
  generation: number;
  lastReconnectedAt: string | null;
  lastDisconnectedAt: string | null;
};

let state: ConnectionState = {
  generation: 1,
  lastReconnectedAt: null,
  lastDisconnectedAt: null,
};
let loaded = false;

function getSb() {
  return createSupabaseAdminClient();
}

export async function ensureConnectionStateLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const sb = getSb();
  if (!sb) return;
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    const raw: any = data?.value;
    if (raw && typeof raw === "object") {
      const gen = Number(raw.generation);
      if (Number.isFinite(gen) && gen >= 1) state.generation = gen;
      if (typeof raw.lastReconnectedAt === "string") state.lastReconnectedAt = raw.lastReconnectedAt;
      if (typeof raw.lastDisconnectedAt === "string") state.lastDisconnectedAt = raw.lastDisconnectedAt;
    }
  } catch { /* segue com defaults */ }
}

async function persistState(): Promise<void> {
  const sb = getSb();
  if (!sb) return;
  try {
    await sb.from("system_settings").upsert([{
      key: SETTINGS_KEY,
      value: { ...state },
      updated_by: "Z-API Telemetria",
      updated_at: new Date().toISOString(),
    }], { onConflict: "key" });
  } catch (e: any) {
    console.warn("[Z-API Sessão] Falha ao persistir generation:", e?.message || e);
  }
}

/** Geração atual (memória; chame ensureConnectionStateLoaded no startup). */
export function getConnectionGeneration(): number {
  return state.generation;
}

export function getLastReconnectedAt(): string | null {
  return state.lastReconnectedAt;
}

/** ms desde a última reconexão, ou null se desconhecido. */
export function getMsSinceReconnect(): number | null {
  if (!state.lastReconnectedAt) return null;
  const t = new Date(state.lastReconnectedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now() - t);
}

/** Queda confirmada — registra timestamp, mantém generation. */
export async function markSessionDisconnected(): Promise<number> {
  await ensureConnectionStateLoaded();
  state.lastDisconnectedAt = new Date().toISOString();
  void persistState();
  return state.generation;
}

/** Reconexão confirmada — incrementa generation e registra timestamp. */
export async function markSessionReconnected(): Promise<number> {
  await ensureConnectionStateLoaded();
  state.generation += 1;
  state.lastReconnectedAt = new Date().toISOString();
  await persistState();
  console.log(`[Z-API Sessão] Nova connection_generation=${state.generation} (reconectado).`);
  return state.generation;
}

export function getConnectionStateSnapshot(): ConnectionState {
  return { ...state };
}
