// ── Webhook Z-API: eventos de conexão (DisconnectedCallback / ConnectedCallback) ─
import { sendSystemAlertEmail, sendWhatsappDisconnectAlertEmail } from "./emailService";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { markSessionDisconnected, markSessionReconnected } from "./zapiConnectionState";
import { getDefaultWhatsappInstance } from "./whatsapp/instanceStore";
import { credsFromInstance } from "./whatsapp/zapiHttp";
import { fetchZapiExtensionToken } from "./whatsapp/zapiExtensionToken";

const ALERT_RECIPIENTS = ["thiago@grupotmseg.com.br", "operacional@grupotmseg.com.br"];

const nowSP = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

function isDisconnectEvent(body: any): boolean {
  const type = String(body?.type || body?.event || body?.callbackType || "").toLowerCase();
  const status = String(body?.status || "").toLowerCase();
  if (type.includes("disconnect")) return true;
  if (body?.connected === false) return true;
  if (status === "disconnected" || status === "offline") return true;
  return false;
}

function isConnectEvent(body: any): boolean {
  const type = String(body?.type || body?.event || body?.callbackType || "").toLowerCase();
  const status = String(body?.status || "").toLowerCase();
  if (type.includes("connect") && !type.includes("disconnect")) return true;
  if (body?.connected === true) return true;
  if (status === "connected" || status === "online") return true;
  return false;
}

/** Processa payload do webhook de conexão Z-API. */
export async function handleZapiConnectionWebhook(body: any): Promise<{ handled: string }> {
  const events: any[] = Array.isArray(body) ? body : [body];
  let handled = "ignored";

  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;

    if (isDisconnectEvent(ev)) {
      handled = "disconnected";
      const row = await getDefaultWhatsappInstance();
      const gen = await markSessionDisconnected();
      logWhatsappSessionEvent({
        eventType: "disconnected",
        connected: false,
        smartphoneConnected: ev.smartphoneConnected ?? null,
        details: { source: "zapi_webhook", raw: ev },
        connectionGeneration: gen,
        incidentStartedAt: nowSP(),
      });

      let extensionToken: string | null = null;
      let extensionExpiresAt: number | null = null;
      let extensionError: string | null = null;
      if (row) {
        const creds = credsFromInstance(row);
        if (creds) {
          const ext = await fetchZapiExtensionToken(creds);
          extensionToken = ext.token;
          extensionExpiresAt = ext.expiresAt;
          extensionError = ext.error || null;
        }
        void sendWhatsappDisconnectAlertEmail({
          to: ALERT_RECIPIENTS,
          instanceLabel: row.label,
          incidentStartedAt: nowSP(),
          dropsLast24h: 1,
          extensionToken,
          extensionExpiresAt,
          extensionError,
        }).catch(() => {
          void sendSystemAlertEmail(
            ALERT_RECIPIENTS,
            "ALERTA: WhatsApp Bot DESCONECTADO (webhook)",
            `<p>Queda detectada via webhook Z-API em ${nowSP()}.</p>`,
          ).catch(() => {});
        });
      }
      continue;
    }

    if (isConnectEvent(ev)) {
      handled = "connected";
      const newGen = await markSessionReconnected();
      logWhatsappSessionEvent({
        eventType: "reconnected",
        connected: true,
        smartphoneConnected: ev.smartphoneConnected ?? true,
        details: { source: "zapi_webhook", raw: ev },
        connectionGeneration: newGen,
      });
      void sendSystemAlertEmail(
        ALERT_RECIPIENTS,
        "WhatsApp Bot RECONECTADO (webhook)",
        `<p>Reconexão detectada via webhook Z-API em ${nowSP()}.</p>`,
      ).catch(() => {});
    }
  }

  return { handled };
}
