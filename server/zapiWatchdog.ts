// ── Vigia da conexão do WhatsApp (Z-API) ────────────────────────────────────
import { sendSystemAlertEmail } from "./emailService";
import { getConnectedBotPhone, invalidateBotPhoneCache, OFFICIAL_BOT_PHONE, OFFICIAL_BOT_PHONE_DISPLAY, getExpectedOfficialPhone } from "./zapiGuard";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { markSessionDisconnected, markSessionReconnected } from "./zapiConnectionState";
import { getDefaultWhatsappInstance, instanceConfigured } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiFetchWith } from "./whatsapp/zapiHttp";
import { notifyZapiDisconnected, notifyZapiReconnected } from "./zapiDisconnectNotify";
import { attemptZapiAutoReconnect } from "./zapiAutoReconnect";
import {
  closeZapiIncident,
  incrementDownStreak,
  isWrongNumberAlerted,
  loadZapiWatchdogState,
  resetDownStreak,
  setWrongNumberAlerted,
} from "./zapiWatchdogState";

const CHECK_INTERVAL_MS = 60 * 1000;
const CONFIRM_CHECKS = 2;
const ALERT_RECIPIENTS = ['thiago@grupotmseg.com.br', 'operacional@grupotmseg.com.br'];

async function zapiGet(path: string): Promise<any | null> {
  const row = await getDefaultWhatsappInstance();
  if (!row || !instanceConfigured(row)) return null;
  const creds = credsFromInstance(row);
  if (!creds) return null;
  const { data } = await zapiFetchWith(creds, path, { method: 'GET' });
  return data;
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
  const persisted = await loadZapiWatchdogState();

  if (connected) {
    await resetDownStreak();
    invalidateBotPhoneCache();

    const phone = await getConnectedBotPhone(true).catch(() => null);
    const wrongAlerted = await isWrongNumberAlerted();
    if (phone && phone !== expected && phone !== OFFICIAL_BOT_PHONE) {
      if (!wrongAlerted) {
        await setWrongNumberAlerted(true);
        logWhatsappSessionEvent({ eventType: 'wrong_number', connected: true, phone, details: { expected } });
        void sendSystemAlertEmail(ALERT_RECIPIENTS, 'ALERTA: WhatsApp Bot — número errado', `<p>Número ${phone} conectado (oficial: ${OFFICIAL_BOT_PHONE_DISPLAY}).</p>`).catch(() => {});
      }
    } else if (phone && wrongAlerted) {
      await setWrongNumberAlerted(false);
      logWhatsappSessionEvent({ eventType: 'wrong_number_cleared', connected: true, phone });
    }

    if (persisted.incidentOpen) {
      const since = persisted.incidentStartedAt || '?';
      await closeZapiIncident();
      const newGen = await markSessionReconnected();
      logWhatsappSessionEvent({
        eventType: 'reconnected',
        connected: true,
        dropsLast24h: persisted.dropTimestamps.length,
        incidentStartedAt: since,
        connectionGeneration: newGen,
        details: { source: 'watchdog' },
      });
      void notifyZapiReconnected('vigia', since);
    }
    return;
  }

  const afterStreak = await incrementDownStreak();
  if (afterStreak.downStreak < CONFIRM_CHECKS) return;

  if (!afterStreak.incidentOpen || afterStreak.downStreak === CONFIRM_CHECKS) {
    const gen = await markSessionDisconnected();
    const incidentStartedAt = afterStreak.incidentStartedAt || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    logWhatsappSessionEvent({
      eventType: 'disconnected',
      connected: false,
      smartphoneConnected: status.smartphoneConnected ?? null,
      dropsLast24h: afterStreak.dropTimestamps.length,
      incidentStartedAt,
      connectionGeneration: gen,
      details: {
        connected: status.connected,
        smartphoneConnected: status.smartphoneConnected,
        session: status.session,
        error: status.error,
        source: 'watchdog',
        downStreak: afterStreak.downStreak,
      },
    });
    void notifyZapiDisconnected(row, 'vigia').catch((e) => {
      console.error('[Z-API Vigia] Falha no alerta de desconexão:', e?.message || e);
    });
  }

  if (afterStreak.incidentOpen || afterStreak.downStreak >= CONFIRM_CHECKS) {
    void attemptZapiAutoReconnect('watchdog').then((r) => {
      if (r.attempted || r.phase === 'skipped') {
        console.log(`[Z-API Vigia] Auto-reconnect: ${r.phase} — ${r.message}`);
      }
    }).catch(() => {});
  }
}

export function startZapiWatchdog() {
  void getDefaultWhatsappInstance().then(inst => {
    if (!inst || !instanceConfigured(inst)) {
      console.log('[Z-API Vigia] Nenhuma instância Z-API no banco — vigia desativado.');
      return;
    }
    setInterval(() => { void runZapiWatchdogTick().catch(() => {}); }, CHECK_INTERVAL_MS);
    setTimeout(() => { void runZapiWatchdogTick().catch(() => {}); }, 15_000);
    console.log(`[Z-API Vigia] ativo (1 min) — instância "${inst.slug}" (${inst.provider}).`);
  });
}
