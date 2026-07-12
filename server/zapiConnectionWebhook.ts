// ── Webhook Z-API: eventos de conexão (DisconnectedCallback / ConnectedCallback) ─
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { markSessionDisconnected, markSessionReconnected } from "./zapiConnectionState";
import { getDefaultWhatsappInstance } from "./whatsapp/instanceStore";
import { notifyZapiDisconnected, notifyZapiReconnected } from "./zapiDisconnectNotify";
import { attemptZapiAutoReconnect } from "./zapiAutoReconnect";
import { closeZapiIncident, loadZapiWatchdogState } from "./zapiWatchdogState";

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

      if (row) {
        void notifyZapiDisconnected(row, "webhook").catch((e) => {
          console.error("[Z-API Webhook] Falha alerta desconexão:", e?.message || e);
        });
        void attemptZapiAutoReconnect("webhook").then((r) => {
          if (r.attempted) console.log(`[Z-API Webhook] Auto-reconnect: ${r.phase} — ${r.message}`);
        }).catch(() => {});
      }
      continue;
    }

    if (isConnectEvent(ev)) {
      handled = "connected";
      const prev = await loadZapiWatchdogState();
      const since = prev.incidentStartedAt;
      await closeZapiIncident();
      const newGen = await markSessionReconnected();
      logWhatsappSessionEvent({
        eventType: "reconnected",
        connected: true,
        smartphoneConnected: ev.smartphoneConnected ?? true,
        details: { source: "zapi_webhook", raw: ev },
        connectionGeneration: newGen,
      });
      void notifyZapiReconnected("webhook", since);
    }
  }

  return { handled };
}
