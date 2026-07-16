// ── Vigia da conexão do WhatsApp (Z-API) ────────────────────────────────────
import { sendSystemAlertEmail } from "./emailService";
import { getConnectedBotPhone, invalidateBotPhoneCache, OFFICIAL_BOT_PHONE, OFFICIAL_BOT_PHONE_DISPLAY, getExpectedOfficialPhone } from "./zapiGuard";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { markSessionDisconnected, markSessionReconnected } from "./zapiConnectionState";
import { getDefaultWhatsappInstance, instanceConfigured, saveConnectionHealth } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiFetchWith } from "./whatsapp/zapiHttp";
import { notifyZapiDisconnected, notifyZapiReconnected } from "./zapiDisconnectNotify";
import { attemptZapiAutoReconnect } from "./zapiAutoReconnect";
import { isZapiSessionConnected } from "../lib/whatsappMobileDiagnosis.js";
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

async function zapiGet(path: string): Promise<{ data: any; type: string } | null> {
  const row = await getDefaultWhatsappInstance();
  if (!row || !instanceConfigured(row)) return null;
  const creds = credsFromInstance(row);
  if (!creds) return null;
  const { data } = await zapiFetchWith(creds, path, { method: 'GET' });
  return { data, type: creds.type };
}

export async function runZapiWatchdogTick(): Promise<void> {
  const row = await getDefaultWhatsappInstance();
  if (!row || row.provider !== 'zapi' || !instanceConfigured(row)) return;

  let status: any = null;
  let instanceType = row.instance_type || 'mobile';
  try {
    const got = await zapiGet('status');
    status = got?.data ?? null;
    if (got?.type) instanceType = got.type;
  } catch (e: any) {
    console.warn(`[Z-API Vigia] Falha ao consultar status: ${e?.message || e}`);
    return;
  }
  if (!status || typeof status.connected !== 'boolean') return;

  const connected = isZapiSessionConnected(status, instanceType);
  const expected = await getExpectedOfficialPhone();
  const persisted = await loadZapiWatchdogState();

  if (connected) {
    await resetDownStreak();
    invalidateBotPhoneCache();

    const phone = await getConnectedBotPhone(true).catch(() => null);
    const phoneMatchesOfficial = !!phone && (phone === expected || phone === OFFICIAL_BOT_PHONE);
    // Popup/UI leem whatsapp_instances.last_connected — sem isso o bot fica
    // "offline" no sistema mesmo com Z-API connected=true.
    await saveConnectionHealth(row.id, {
      connected: true,
      connectedPhone: phone,
      phoneMatchesOfficial,
      error: phoneMatchesOfficial || !phone
        ? null
        : `Conectado em ${phone}, esperado ${expected}.`,
      statusRaw: status,
    }).catch((e) => {
      console.warn(`[Z-API Vigia] Falha ao persistir last_connected: ${e?.message || e}`);
    });

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
    const disconnectError = status.error
      ? `Desconectado: ${String(status.error)}`
      : 'Desconectado — gere código de vinculação no eSIM.';
    await saveConnectionHealth(row.id, {
      connected: false,
      connectedPhone: null,
      phoneMatchesOfficial: false,
      error: disconnectError,
      statusRaw: status,
    }).catch((e) => {
      console.warn(`[Z-API Vigia] Falha ao persistir desconexão: ${e?.message || e}`);
    });
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
