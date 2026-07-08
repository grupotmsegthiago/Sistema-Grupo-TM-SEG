// ── Alertas unificados de queda/reconexão Z-API ───────────────────────────────
import { sendSystemAlertEmail, sendWhatsappDisconnectAlertEmail } from "./emailService";
import { pushWhatsappDisconnected, pushWhatsappReconnected } from "./whatsappAlertPush";
import { fetchZapiExtensionToken } from "./whatsapp/zapiExtensionToken";
import { credsFromInstance } from "./whatsapp/zapiHttp";
import type { WhatsappInstanceRecord } from "./whatsapp/types";
import { openZapiIncident } from "./zapiWatchdogState";

const ALERT_RECIPIENTS = ["thiago@grupotmseg.com.br", "operacional@grupotmseg.com.br"];

const nowSP = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export async function notifyZapiDisconnected(
  row: Pick<WhatsappInstanceRecord, "label"> | { label: string },
  source: string,
): Promise<{ alerted: boolean }> {
  const { shouldAlert, state, dropsLast24h } = await openZapiIncident(source);
  if (!shouldAlert) return { alerted: false };

  const incidentStartedAt = state.incidentStartedAt || nowSP();
  let extensionToken: string | null = null;
  let extensionExpiresAt: number | null = null;
  let extensionError: string | null = null;

  const creds = credsFromInstance(row as WhatsappInstanceRecord);
  if (creds) {
    const ext = await fetchZapiExtensionToken(creds);
    extensionToken = ext.token;
    extensionExpiresAt = ext.expiresAt;
    extensionError = ext.error || null;
  }

  try {
    await sendWhatsappDisconnectAlertEmail({
      to: ALERT_RECIPIENTS,
      instanceLabel: row.label,
      incidentStartedAt,
      dropsLast24h,
      extensionToken,
      extensionExpiresAt,
      extensionError,
    });
  } catch (e: any) {
    console.error("[Z-API Alerta] Falha e-mail desconexão:", e?.message || e);
    await sendSystemAlertEmail(
      ALERT_RECIPIENTS,
      `ALERTA: WhatsApp Bot DESCONECTADO (${source})`,
      `<p>Desde ${incidentStartedAt}. Falha ao gerar e-mail com código extensão.</p>`,
    ).catch(() => {});
  }

  void pushWhatsappDisconnected(incidentStartedAt, dropsLast24h);
  return { alerted: true };
}

export async function notifyZapiReconnected(source: string, since?: string | null): Promise<void> {
  const when = since || "?";
  await sendSystemAlertEmail(
    ALERT_RECIPIENTS,
    `WhatsApp Bot RECONECTADO (${source})`,
    `<p>Reconectou em ${nowSP()}. Queda anterior: ${when}.</p>`,
  ).catch(() => {});
  void pushWhatsappReconnected();
}
