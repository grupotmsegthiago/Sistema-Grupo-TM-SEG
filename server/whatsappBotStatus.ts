// ── Status público do bot WhatsApp (sem credenciais) ─────────────────────────
import { getDefaultWhatsappInstance, instanceConfigured } from "./whatsapp/instanceStore";
import { credsFromInstance, officialPhoneParts, zapiFetchWith } from "./whatsapp/zapiHttp";
import { loadZapiWatchdogState } from "./zapiWatchdogState";
import { isLockActive, loadZapiReconnectLock, type ZapiReconnectLock } from "./zapiReconnectLock";
import { isZapiSessionConnected } from "../lib/whatsappMobileDiagnosis.js";

export type WhatsappBotStatusSnapshot = {
  configured: boolean;
  online: boolean;
  label: string | null;
  lastError: string | null;
  incidentOpen: boolean;
  lock: ZapiReconnectLock | null;
};

export async function getWhatsappBotStatusSnapshot(options: { live?: boolean } = {}): Promise<WhatsappBotStatusSnapshot> {
  const live = options.live === true;
  const watchdog = await loadZapiWatchdogState();
  const lock = await loadZapiReconnectLock();

  const row = await getDefaultWhatsappInstance();
  if (!row || !instanceConfigured(row)) {
    return {
      configured: false,
      online: false,
      label: null,
      lastError: null,
      incidentOpen: watchdog.incidentOpen,
      lock: isLockActive(lock) ? lock : null,
    };
  }

  let online = row.last_connected === true;
  let lastError = row.last_error;

  if (live) {
    const creds = credsFromInstance(row);
    if (creds) {
      try {
        const { ok, data } = await zapiFetchWith(creds, "status", { method: "GET" });
        if (ok && data) {
          online = isZapiSessionConnected(data, creds.type);
          if (!online && data.error) lastError = String(data.error);
        }
      } catch {
        /* usa cache do banco */
      }
    }
  }

  return {
    configured: true,
    online,
    label: row.label,
    lastError,
    incidentOpen: watchdog.incidentOpen || !online,
    lock: isLockActive(lock) ? lock : null,
  };
}

/** Gera código phone-code direto (fallback quando wa_old indisponível). */
export async function fetchWhatsappPhoneLinkCode(): Promise<string | null> {
  const row = await getDefaultWhatsappInstance();
  if (!row || !instanceConfigured(row)) return null;
  const creds = credsFromInstance(row);
  if (!creds) return null;
  const { ddi, phone } = officialPhoneParts(row);
  const full = phone.startsWith(ddi) ? phone : `${ddi}${phone}`;
  const { ok, data } = await zapiFetchWith(creds, `phone-code/${full}`, { method: "GET" });
  if (!ok || !data) return null;
  return String(data.code || data.value || "").trim() || null;
}
