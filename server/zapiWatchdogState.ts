// ── Estado persistido do vigia Z-API (serverless/Vercel não mantém memória) ───
import { createSupabaseAdminClient } from "./supabaseConfig";
import { clearZapiReconnectLock } from "./zapiReconnectLock";

const SETTINGS_KEY = "zapi_watchdog_state";

export type ZapiWatchdogState = {
  downStreak: number;
  incidentOpen: boolean;
  incidentStartedAt: string | null;
  dropTimestamps: number[];
  wrongNumberAlerted: boolean;
  lastAlertAtMs: number | null;
};

const DEFAULT_STATE: ZapiWatchdogState = {
  downStreak: 0,
  incidentOpen: false,
  incidentStartedAt: null,
  dropTimestamps: [],
  wrongNumberAlerted: false,
  lastAlertAtMs: null,
};

function normalize(raw: unknown): ZapiWatchdogState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const drops = Array.isArray(o.dropTimestamps)
    ? o.dropTimestamps.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  return {
    downStreak: Math.max(0, Number(o.downStreak) || 0),
    incidentOpen: o.incidentOpen === true,
    incidentStartedAt: typeof o.incidentStartedAt === "string" ? o.incidentStartedAt : null,
    dropTimestamps: drops,
    wrongNumberAlerted: o.wrongNumberAlerted === true,
    lastAlertAtMs: Number.isFinite(Number(o.lastAlertAtMs)) ? Number(o.lastAlertAtMs) : null,
  };
}

export async function loadZapiWatchdogState(): Promise<ZapiWatchdogState> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { ...DEFAULT_STATE };
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    return normalize(data?.value);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveZapiWatchdogState(state: ZapiWatchdogState): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const dropTimestamps = state.dropTimestamps.filter((t) => t >= cutoff);
  const payload = { ...state, dropTimestamps };
  try {
    await sb.from("system_settings").upsert([{
      key: SETTINGS_KEY,
      value: payload,
      updated_by: "Z-API Vigia",
      updated_at: new Date().toISOString(),
    }], { onConflict: "key" });
  } catch (e: any) {
    console.warn("[Z-API Vigia] Falha ao persistir estado:", e?.message || e);
  }
}

/** Abre incidente e retorna se deve disparar alertas (evita duplicata webhook + vigia). */
export async function openZapiIncident(source: string): Promise<{
  shouldAlert: boolean;
  state: ZapiWatchdogState;
  dropsLast24h: number;
}> {
  const state = await loadZapiWatchdogState();
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  state.dropTimestamps = state.dropTimestamps.filter((t) => t >= cutoff);

  const alreadyOpen = state.incidentOpen;
  const recentAlert = state.lastAlertAtMs != null && now - state.lastAlertAtMs < 15 * 60 * 1000;

  if (!alreadyOpen) {
    state.incidentOpen = true;
    state.incidentStartedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    state.dropTimestamps.push(now);
  }

  const shouldAlert = !recentAlert;
  if (shouldAlert) state.lastAlertAtMs = now;

  await saveZapiWatchdogState(state);

  return {
    shouldAlert,
    state,
    dropsLast24h: state.dropTimestamps.length,
  };
}

export async function closeZapiIncident(): Promise<ZapiWatchdogState> {
  const state = await loadZapiWatchdogState();
  state.downStreak = 0;
  state.incidentOpen = false;
  state.incidentStartedAt = null;
  await saveZapiWatchdogState(state);
  await clearZapiReconnectLock();
  return state;
}

export async function incrementDownStreak(): Promise<ZapiWatchdogState> {
  const state = await loadZapiWatchdogState();
  state.downStreak += 1;
  await saveZapiWatchdogState(state);
  return state;
}

export async function resetDownStreak(): Promise<ZapiWatchdogState> {
  const state = await loadZapiWatchdogState();
  state.downStreak = 0;
  await saveZapiWatchdogState(state);
  return state;
}

export async function setWrongNumberAlerted(flag: boolean): Promise<void> {
  const state = await loadZapiWatchdogState();
  state.wrongNumberAlerted = flag;
  await saveZapiWatchdogState(state);
}

export async function isWrongNumberAlerted(): Promise<boolean> {
  const state = await loadZapiWatchdogState();
  return state.wrongNumberAlerted;
}

export function incidentSourceLabel(source: string): string {
  return source === "zapi_webhook" ? "webhook Z-API" : "vigia automático";
}
