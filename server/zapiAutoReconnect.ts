// ── Reconexão automática Z-API (restore-session + restart + wa_old mobile) ───
import { createSupabaseAdminClient } from "./supabaseConfig";
import {
  ensureDefaultInstanceMobileType,
  getDefaultWhatsappInstance,
  instanceConfigured,
  type WhatsappInstanceRecord,
} from "./whatsapp/instanceStore";
import { credsFromInstance, officialPhoneParts, zapiFetchWith } from "./whatsapp/zapiHttp";
import { fetchZapiExtensionToken } from "./whatsapp/zapiExtensionToken";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { loadZapiWatchdogState } from "./zapiWatchdogState";
import type { ZapiCredentials } from "./whatsapp/zapiHttp";

const COOLDOWN_MS = 30 * 60 * 1000;
const INCIDENT_RETRY_MS = 5 * 60 * 1000;
const LAST_ATTEMPT_KEY = "zapi_watchdog_last_restart_at";
const WA_OLD_POLL_MS = 5000;
const WA_OLD_POLL_ATTEMPTS = 9;

export type AutoReconnectSource = "watchdog" | "webhook" | "api" | "cron";

export type AutoReconnectPhase =
  | "skipped"
  | "already_connected"
  | "restore_session"
  | "restart"
  | "wa_old"
  | "failed";

export type AutoReconnectResult = {
  attempted: boolean;
  ok: boolean;
  phase: AutoReconnectPhase;
  message: string;
  connectedAfter?: boolean;
  details?: Record<string, unknown>;
};

/** Ativo por padrão; desative com WHATSAPP_AUTO_RECONNECT=false na Vercel. */
export function isWhatsappAutoReconnectEnabled(): boolean {
  const raw = String(process.env.WHATSAPP_AUTO_RECONNECT ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

/** Pop-up wa_old no celular (mobile); ativo por padrão. */
export function isWaOldReconnectEnabled(): boolean {
  const raw = String(process.env.ZAPI_WA_OLD_RECONNECT ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

export function shouldUseMobileWaOld(row: WhatsappInstanceRecord): boolean {
  if (!isWaOldReconnectEnabled()) return false;
  const envMobile = (process.env.ZAPI_INSTANCE_TYPE ?? "mobile").toLowerCase() !== "web";
  return row.instance_type === "mobile" || envMobile;
}

export function getAutoReconnectPolicyMessage(): string {
  if (!isWhatsappAutoReconnectEnabled()) {
    return "Reconexão automática desativada (WHATSAPP_AUTO_RECONNECT=false). Use Reconectar via API.";
  }
  const waOld = isWaOldReconnectEnabled()
    ? " + pop-up wa_old no WhatsApp Business (celular/eSIM)"
    : "";
  return `Reconexão automática ativa: vigia 1 min; restore-session → restart → wa_old${waOld}; retry a cada 5 min offline.`;
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

async function readLiveStatus(creds: ZapiCredentials) {
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

function mobileCreds(creds: ZapiCredentials): ZapiCredentials {
  return { ...creds, type: "mobile" };
}

/** Solicita pop-up wa_old no WhatsApp do celular e aguarda conexão. */
async function attemptMobileWaOldReconnect(
  row: WhatsappInstanceRecord,
  creds: ZapiCredentials,
  source: AutoReconnectSource,
): Promise<AutoReconnectResult> {
  const mc = mobileCreds(creds);
  const { ddi, phone } = officialPhoneParts(row);

  const reg = await zapiFetchWith(mc, "mobile/registration-available", {
    method: "POST",
    body: JSON.stringify({ ddi, phone }),
  });

  if (!reg.ok || reg.data?.available === false) {
    const needMobile = String(reg.data?.error || reg.text || "").includes("mobile instance");
    const msg = needMobile
      ? "Instância Z-API ainda é WEB — no painel Z-API converta para MOBILE (ou crie instância mobile) para wa_old automático."
      : reg.data?.blocked
        ? "Número bloqueado no WhatsApp — verifique no aparelho."
        : (reg.data?.error || reg.text || "Registro mobile indisponível para wa_old.");
    return {
      attempted: true,
      ok: false,
      phase: "wa_old",
      message: msg,
      details: { registration: reg.data },
    };
  }

  const req = await zapiFetchWith(mc, "mobile/request-registration-code", {
    method: "POST",
    body: JSON.stringify({ ddi, phone, method: "wa_old" }),
  });

  const requestCodeUnavailable = req.data?.error === "NOT_FOUND"
    || String(req.data?.message || "").includes("Unable to find matching target resource method");

  if (requestCodeUnavailable) {
    return {
      attempted: true,
      ok: false,
      phase: "wa_old",
      message:
        "Endpoint mobile/request-registration-code indisponível — confira tipo MOBILE e Client-Token no painel Z-API. Não use código de 8 letras (WEB) nesta instância.",
      details: { requestCode: req.data, fallback: "wait_retry_mobile" },
    };
  }

  if (!req.ok || req.data?.success === false) {
    const captcha = req.data?.captcha;
    if (req.data?.blocked === true || Number(req.data?.smsWaitSeconds) === -1) {
      // Cooldown longo: martelar wa_old/SMS piora o blocked do WhatsApp. Não gerar phone-code (WEB).
      await saveLastAttemptMs();
      return {
        attempted: true,
        ok: false,
        phase: "wa_old",
        message:
          "WhatsApp bloqueou registro MOBILE agora (blocked). Pare de repetir: deixe o Business aberto, aguarde e tente UMA vez Pop-up/SMS/Ligação. Quando o código chegar, confirme no painel.",
        connectedAfter: false,
        details: { requestCode: req.data, fallback: "wait_retry_mobile", blocked: true },
      };
    }
    const msg = captcha
      ? "WhatsApp pediu captcha — reconexão automática pausada; use o painel Configurações."
      : (req.data?.error || req.text || "Falha ao enviar pop-up wa_old ao celular.");
    return {
      attempted: true,
      ok: false,
      phase: "wa_old",
      message: String(msg),
      details: { requestCode: req.data, captcha: !!captcha, fallback: "wait_retry_mobile" },
    };
  }

  logWhatsappSessionEvent({
    eventType: "restart_attempted",
    connected: false,
    details: { source, step: "wa_old_request", requestCode: req.data },
  });

  for (let i = 0; i < WA_OLD_POLL_ATTEMPTS; i++) {
    await sleep(WA_OLD_POLL_MS);
    const st = await readLiveStatus(creds);
    if (st.connected) {
      return {
        attempted: true,
        ok: true,
        phase: "wa_old",
        message: "Conectado após confirmação no WhatsApp Business (wa_old).",
        connectedAfter: true,
        details: { requestCode: req.data, pollAttempt: i + 1 },
      };
    }
    const transfer = await zapiFetchWith(mc, "mobile/device-transfer-confirmed", { method: "GET" });
    if (transfer.ok && transfer.data?.success) {
      await sleep(2500);
      const st2 = await readLiveStatus(creds);
      if (st2.connected) {
        return {
          attempted: true,
          ok: true,
          phase: "wa_old",
          message: "Conectado após transferência confirmada no celular.",
          connectedAfter: true,
          details: { transfer: transfer.data },
        };
      }
    }
  }

  return {
    attempted: true,
    ok: false,
    phase: "wa_old",
    message: "Pop-up enviado ao WhatsApp Business — confirme no celular (toque em Conectar / Vincular). O vigia reenvia a cada 5 min.",
    connectedAfter: false,
    details: { requestCode: req.data },
  };
}

/**
 * Tenta reconectar: restore-session → restart → wa_old (mobile).
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
      message: "Auto-reconnect desativado (WHATSAPP_AUTO_RECONNECT=false).",
    };
  }

  await ensureDefaultInstanceMobileType();

  const row = await getDefaultWhatsappInstance();
  if (!row || row.provider !== "zapi" || !instanceConfigured(row)) {
    return { attempted: false, ok: false, phase: "skipped", message: "Instância Z-API não configurada." };
  }

  const creds = credsFromInstance(row);
  if (!creds) {
    return { attempted: false, ok: false, phase: "skipped", message: "Credenciais Z-API incompletas." };
  }

  const useWaOld = shouldUseMobileWaOld(row);

  if (!force) {
    const last = await loadLastAttemptMs();
    const incidentOpen = (await loadZapiWatchdogState()).incidentOpen;
    const cooldown = incidentOpen ? INCIDENT_RETRY_MS : COOLDOWN_MS;
    if (last != null && Date.now() - last < cooldown) {
      const waitMin = Math.ceil((cooldown - (Date.now() - last)) / 60_000);
      return {
        attempted: false,
        ok: false,
        phase: "skipped",
        message: `Cooldown ativo — próxima tentativa em ~${waitMin} min.`,
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

  if (!useWaOld && status.smartphoneConnected === false) {
    const ext = await fetchZapiExtensionToken(creds).catch(() => ({ token: null as string | null }));
    const msg = ext.token
      ? "Celular offline e sessão Web expirada — use extensão Z-API Conector ou ative wa_old mobile."
      : "Celular offline — ligue o aparelho e abra o WhatsApp Business.";
    return { attempted: false, ok: false, phase: "skipped", message: msg, details: { needsExtension: !!ext.token } };
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

  let restart = await zapiFetchWith(creds, "restart", { method: "GET" });
  if (!restart.ok) {
    restart = await zapiFetchWith(creds, "restart", { method: "POST" });
  }
  await sleep(4000);
  status = await readLiveStatus(creds);

  if (status.connected) {
    logWhatsappSessionEvent({
      eventType: "restart_attempted",
      connected: true,
      details: { source, step: "restart", restartOk: restart.ok },
    });
    return {
      attempted: true,
      ok: true,
      phase: "restart",
      message: "Instância reiniciada e conectada.",
      connectedAfter: true,
      details: { restart: restart.data },
    };
  }

  if (useWaOld) {
    const waOld = await attemptMobileWaOldReconnect(row, creds, source);
    if (waOld.ok || waOld.phase === "wa_old") {
      return waOld;
    }
  }

  const ext = await fetchZapiExtensionToken(creds).catch(() => ({ token: null as string | null }));
  const hint = useWaOld
    ? "Restore/restart/wa_old não conectaram — confirme o pop-up no WhatsApp Business do eSIM."
    : ext.token
      ? "Use código extensão Z-API Conector (Configurações → WhatsApp)."
      : "Confira o celular dedicado e use Iniciar conexão no painel.";

  logWhatsappSessionEvent({
    eventType: "restart_attempted",
    connected: false,
    smartphoneConnected: status.smartphoneConnected,
    details: { source, restoreOk: restore.ok, restartOk: restart.ok, extensionAvailable: !!ext.token },
  });

  return {
    attempted: true,
    ok: false,
    phase: "failed",
    message: hint,
    connectedAfter: false,
    details: { restore: restore.data, restart: restart.data, status: status.raw },
  };
}
