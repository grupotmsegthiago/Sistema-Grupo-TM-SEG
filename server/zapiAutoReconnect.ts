// ── Reconexão automática Z-API (restore-session + restart) ───────────────────
import { createSupabaseAdminClient } from "./supabaseConfig";
import { getDefaultWhatsappInstance, instanceConfigured } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiFetchWith } from "./whatsapp/zapiHttp";
import { fetchZapiExtensionToken } from "./whatsapp/zapiExtensionToken";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";

const COOLDOWN_MS = 30 * 60 * 1000;
const LAST_ATTEMPT_KEY = "zapi_watchdog_last_restart_at";

export type AutoReconnectSource = "watchdog" | "webhook" | "api" | "cron";

export type AutoReconnectResult = {
  attempted: boolean;
  ok: boolean;
  phase: "skipped" | "already_connected" | "restore_session" | "restart" | "failed";
  message: string;
  connectedAfter?: boolean;
  details?: Record<string, unknown>;
};

/** Ativo por padrão; desative com WHATSAPP_AUTO_RECONNECT=false na Vercel. */
export function isWhatsappAutoReconnectEnabled(): boolean {
  const raw = String(process.env.WHATSAPP_AUTO_RECONNECT ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

export function getAutoReconnectPolicyMessage(): string {
  if (isWhatsappAutoReconnectEnabled()) {
    return "Reconexão automática ativa (padrão): após queda confirmada, tenta restore-session e restart (cooldown 30 min). Desative com WHATSAPP_AUTO_RECONNECT=false.";
  }
  return "Reconexão automática desativada (WHATSAPP_AUTO_RECONNECT=false). Use o botão Reconectar via API.";
}

async function loadLastAttemptMs(): Promise<number | null> {
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", LAST_ATTEMPT_KEY).maybeSingle();
    const v = data?.value;
    const ms = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : null;
    return ms != null && Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

async function saveLastAttemptMs(): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const iso = new Date().toISOString();
  try {
    await sb.from("system_settings").upsert([{
      key: LAST_ATTEMPT_KEY,
      value: iso,
      updated_by: "Z-API Auto-Reconnect",
      updated_at: iso,
    }], { onConflict: "key" });
  } catch (e: any) {
    console.warn("[Z-API Auto-Reconnect] Falha ao salvar cooldown:", e?.message || e);
  }
}

async function readLiveStatus(creds: NonNullable<ReturnType<typeof credsFromInstance>>) {
  const { ok, data } = await zapiFetchWith(creds, "status", { method: "GET" });
  const connected = data?.connected === true && data?.smartphoneConnected !== false;
  return {
    apiOk: ok || !!data,
    connected,
    smartphoneConnected: typeof data?.smartphoneConnected === "boolean" ? data.smartphoneConnected : null,
    error: data?.error ? String(data.error) : null,
    raw: data,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Tenta reconectar a instância Z-API sem QR (restore-session → restart).
 * Não resolve: celular offline, sessão extensão expirada ou logout manual.
 */
export async function attemptZapiAutoReconnect(
  source: AutoReconnectSource,
  options: { force?: boolean; skipEnabledCheck?: boolean } = {},
): Promise<AutoReconnectResult> {
  const { force = false, skipEnabledCheck = false } = options;

  if (!skipEnabledCheck && !force && !isWhatsappAutoReconnectEnabled()) {
    return {
      attempted: false,
      ok: false,
      phase: "skipped",
      message: "Auto-reconnect desativado (WHATSAPP_AUTO_RECONNECT≠true).",
    };
  }

  const row = await getDefaultWhatsappInstance();
  if (!row || row.provider !== "zapi" || !instanceConfigured(row)) {
    return { attempted: false, ok: false, phase: "skipped", message: "Instância Z-API não configurada." };
  }

  const creds = credsFromInstance(row);
  if (!creds) {
    return { attempted: false, ok: false, phase: "skipped", message: "Credenciais Z-API incompletas." };
  }

  if (!force) {
    const last = await loadLastAttemptMs();
    if (last != null && Date.now() - last < COOLDOWN_MS) {
      const waitMin = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60_000);
      return {
        attempted: false,
        ok: false,
        phase: "skipped",
        message: `Cooldown ativo — aguarde ~${waitMin} min antes de nova tentativa.`,
      };
    }
  }

  let status = await readLiveStatus(creds);
  if (status.connected) {
    return {
      attempted: false,
      ok: true,
      phase: "already_connected",
      message: "Já conectado.",
      connectedAfter: true,
    };
  }

  if (status.smartphoneConnected === false) {
    const ext = await fetchZapiExtensionToken(creds).catch(() => ({ token: null as string | null }));
    const needsExtension = !!ext.token;
    const msg = needsExtension
      ? "Celular offline e sessão Web expirada — reconecte pelo Z-API Conector (extensão) com o aparelho ligado e WhatsApp aberto."
      : "Celular do número oficial offline — ligue o aparelho, abra o WhatsApp e tente novamente.";
    logWhatsappSessionEvent({
      eventType: "restart_attempted",
      connected: false,
      smartphoneConnected: false,
      details: { source, skipped: true, reason: needsExtension ? "extension_reauth_offline" : "smartphone_offline" },
    });
    return { attempted: false, ok: false, phase: "skipped", message: msg, details: { needsExtension } };
  }

  await saveLastAttemptMs();

  const restore = await zapiFetchWith(creds, "restore-session", { method: "GET" });
  await sleep(2500);
  status = await readLiveStatus(creds);

  if (status.connected) {
    logWhatsappSessionEvent({
      eventType: "restart_attempted",
      connected: true,
      details: { source, step: "restore-session", restoreOk: restore.ok },
    });
    return {
      attempted: true,
      ok: true,
      phase: "restore_session",
      message: "Sessão restaurada com sucesso.",
      connectedAfter: true,
      details: { restore: restore.data },
    };
  }

  const restart = await zapiFetchWith(creds, "restart", { method: "POST" });
  if (!restart.ok) {
    await zapiFetchWith(creds, "restart", { method: "GET" });
  }
  await sleep(4000);
  status = await readLiveStatus(creds);

  logWhatsappSessionEvent({
    eventType: "restart_attempted",
    connected: status.connected,
    smartphoneConnected: status.smartphoneConnected,
    details: {
      source,
      restoreOk: restore.ok,
      restartOk: restart.ok,
      statusError: status.error,
    },
  });

  if (status.connected) {
    return {
      attempted: true,
      ok: true,
      phase: "restart",
      message: "Instância reiniciada e conectada.",
      connectedAfter: true,
      details: { restore: restore.data, restart: restart.data },
    };
  }

  const ext = await fetchZapiExtensionToken(creds).catch(() => ({ token: null as string | null }));
  const hint = ext.token
    ? "API não reconectou — use o código da extensão Z-API Conector (Configurações → WhatsApp)."
    : "API não reconectou — confira o celular dedicado e use Iniciar conexão no painel.";

  return {
    attempted: true,
    ok: false,
    phase: "failed",
    message: hint,
    connectedAfter: false,
    details: { restore: restore.data, restart: restart.data, status: status.raw, extensionAvailable: !!ext.token },
  };
}
