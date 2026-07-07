// ── Vigia da conexão do WhatsApp (Z-API) ────────────────────────────────────
import { sendSystemAlertEmail, sendWhatsappDisconnectAlertEmail } from "./emailService";
import { getConnectedBotPhone, invalidateBotPhoneCache, OFFICIAL_BOT_PHONE, OFFICIAL_BOT_PHONE_DISPLAY, getExpectedOfficialPhone } from "./zapiGuard";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { markSessionDisconnected, markSessionReconnected } from "./zapiConnectionState";
import { getDefaultWhatsappInstance, instanceConfigured } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiFetchWith } from "./whatsapp/zapiHttp";
import { fetchZapiExtensionToken } from "./whatsapp/zapiExtensionToken";

const CHECK_INTERVAL_MS = 3 * 60 * 1000;
const CONFIRM_CHECKS = 2;
const ALERT_RECIPIENTS = ['thiago@grupotmseg.com.br', 'operacional@grupotmseg.com.br'];

const nowSP = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function zapiGet(path: string): Promise<any | null> {
  const row = await getDefaultWhatsappInstance();
  if (!row || !instanceConfigured(row)) return null;
  const creds = credsFromInstance(row);
  if (!creds) return null;
  const { data } = await zapiFetchWith(creds, path, { method: 'GET' });
  return data;
}

let lastConnected: boolean | null = null;
let downStreak = 0;
let incidentOpen = false;
let incidentStartedAt: string | null = null;
let wrongNumberAlerted = false;
const dropHistory: number[] = [];

async function notifyDisconnect(row: { label: string }) {
  const creds = credsFromInstance(row as any);
  let extensionToken: string | null = null;
  let extensionExpiresAt: number | null = null;
  let extensionError: string | null = null;

  if (creds) {
    const ext = await fetchZapiExtensionToken(creds);
    extensionToken = ext.token;
    extensionExpiresAt = ext.expiresAt;
    extensionError = ext.error || null;
  }

  await sendWhatsappDisconnectAlertEmail({
    to: ALERT_RECIPIENTS,
    instanceLabel: row.label,
    incidentStartedAt: incidentStartedAt || nowSP(),
    dropsLast24h: dropHistory.length,
    extensionToken,
    extensionExpiresAt,
    extensionError,
  });
}

export async function runZapiWatchdogTick(): Promise<void> {
  const row = await getDefaultWhatsappInstance();
  if (!row || row.provider !== 'zapi' || !instanceConfigured(row)) return;

  let status: any = null;
  try {
    status = await zapiGet('status');
  } catch (e: any) {
    console.warn(`[Z-API Vigia] Falha ao consultar status: ${e?.message || e}`);
    return;
  }
  if (!status || typeof status.connected !== 'boolean') return;

  const connected = status.connected === true && status.smartphoneConnected !== false;
  const expected = await getExpectedOfficialPhone();

  if (connected) {
    downStreak = 0;
    if (lastConnected !== true) invalidateBotPhoneCache();
    const phone = await getConnectedBotPhone(lastConnected !== true).catch(() => null);
    if (phone && phone !== expected && phone !== OFFICIAL_BOT_PHONE) {
      if (!wrongNumberAlerted) {
        wrongNumberAlerted = true;
        logWhatsappSessionEvent({ eventType: 'wrong_number', connected: true, phone, details: { expected } });
        void sendSystemAlertEmail(ALERT_RECIPIENTS, 'ALERTA: WhatsApp Bot — número errado', `<p>Número ${phone} conectado (oficial: ${OFFICIAL_BOT_PHONE_DISPLAY}).</p>`).catch(() => {});
      }
    } else if (phone && wrongNumberAlerted) {
      wrongNumberAlerted = false;
      logWhatsappSessionEvent({ eventType: 'wrong_number_cleared', connected: true, phone });
    }

    if (incidentOpen) {
      incidentOpen = false;
      const since = incidentStartedAt || '?';
      incidentStartedAt = null;
      const newGen = await markSessionReconnected();
      logWhatsappSessionEvent({ eventType: 'reconnected', connected: true, dropsLast24h: dropHistory.length, incidentStartedAt: since, connectionGeneration: newGen });
      void sendSystemAlertEmail(ALERT_RECIPIENTS, 'WhatsApp Bot RECONECTADO', `<p>Reconectou em ${nowSP()}.</p>`).catch(() => {});
    }
    lastConnected = true;
    return;
  }

  downStreak += 1;
  if (downStreak < CONFIRM_CHECKS) return;

  if (!incidentOpen) {
    incidentOpen = true;
    incidentStartedAt = nowSP();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    while (dropHistory.length && dropHistory[0] < cutoff) dropHistory.shift();
    dropHistory.push(Date.now());
    const gen = await markSessionDisconnected();
    logWhatsappSessionEvent({ eventType: 'disconnected', connected: false, dropsLast24h: dropHistory.length, incidentStartedAt: incidentStartedAt || undefined, connectionGeneration: gen, details: { connected: status.connected } });
    void notifyDisconnect(row).catch((e) => {
      console.error('[Z-API Vigia] Falha no e-mail de desconexão:', e?.message || e);
      void sendSystemAlertEmail(ALERT_RECIPIENTS, 'ALERTA: WhatsApp Bot DESCONECTADO', `<p>Desde ${incidentStartedAt}. Falha ao gerar código extensão no e-mail.</p>`).catch(() => {});
    });
  }
  lastConnected = false;
}

export function startZapiWatchdog() {
  void getDefaultWhatsappInstance().then(row => {
    if (!row || !instanceConfigured(row)) {
      console.log('[Z-API Vigia] Nenhuma instância Z-API no banco — vigia desativado.');
      return;
    }
    setInterval(() => { void runZapiWatchdogTick().catch(() => {}); }, CHECK_INTERVAL_MS);
    setTimeout(() => { void runZapiWatchdogTick().catch(() => {}); }, 15_000);
    console.log(`[Z-API Vigia] ativo — instância "${row.slug}" (${row.provider}).`);
  });
}
