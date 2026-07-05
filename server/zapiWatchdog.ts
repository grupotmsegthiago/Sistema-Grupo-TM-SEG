// ── Vigia da conexão do WhatsApp (Z-API) ────────────────────────────────────
import { sendSystemAlertEmail } from "./emailService";
import { getConnectedBotPhone, invalidateBotPhoneCache, OFFICIAL_BOT_PHONE, OFFICIAL_BOT_PHONE_DISPLAY, getExpectedOfficialPhone } from "./zapiGuard";
import { createSupabaseAdminClient } from "./supabaseConfig";
import { logWhatsappSessionEvent } from "./whatsappTelemetry";
import { markSessionDisconnected, markSessionReconnected } from "./zapiConnectionState";
import { getDefaultWhatsappInstance, instanceConfigured } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiFetchWith } from "./whatsapp/zapiHttp";

const COOLDOWN_SETTINGS_KEY = 'zapi_watchdog_last_restart_at';

function getSb() {
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error('Supabase não configurado');
  return sb;
}

async function loadLastRestartAt(): Promise<number> {
  try {
    const { data } = await getSb().from('system_settings').select('value').eq('key', COOLDOWN_SETTINGS_KEY).maybeSingle();
    const raw: any = data?.value;
    const ts = typeof raw === 'object' && raw ? Number(raw.ts) : Number(raw);
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  } catch { return 0; }
}

async function saveLastRestartAt(ts: number): Promise<void> {
  try {
    await getSb().from('system_settings').upsert([{
      key: COOLDOWN_SETTINGS_KEY,
      value: { ts },
      updated_by: 'Z-API Vigia',
      updated_at: new Date().toISOString(),
    }], { onConflict: 'key' });
  } catch (e: any) {
    console.warn(`[Z-API Vigia] Falha ao persistir cooldown: ${e?.message || e}`);
  }
}

const CHECK_INTERVAL_MS = 3 * 60 * 1000;
const RESTART_COOLDOWN_MS = 30 * 60 * 1000;
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
let restartTriedThisIncident = false;
let wrongNumberAlerted = false;
let lastRestartAt = 0;
let cooldownLoaded = false;
const dropHistory: number[] = [];

async function ensureCooldownLoaded() {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  const ts = await loadLastRestartAt().catch(() => 0);
  if (ts > lastRestartAt) lastRestartAt = ts;
}

export async function runZapiWatchdogTick(): Promise<void> {
  const row = await getDefaultWhatsappInstance();
  if (!row || row.provider !== 'zapi' || !instanceConfigured(row)) return;

  await ensureCooldownLoaded();

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
      restartTriedThisIncident = false;
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
    void sendSystemAlertEmail(ALERT_RECIPIENTS, 'ALERTA: WhatsApp Bot DESCONECTADO', `<p>Desde ${incidentStartedAt}.</p>`).catch(() => {});
  }

  const now = Date.now();
  if (!restartTriedThisIncident && now - lastRestartAt >= RESTART_COOLDOWN_MS) {
    restartTriedThisIncident = true;
    lastRestartAt = now;
    void saveLastRestartAt(now);
    logWhatsappSessionEvent({ eventType: 'restart_attempted', connected: false, dropsLast24h: dropHistory.length, incidentStartedAt: incidentStartedAt || undefined });
    try { await zapiGet('restart'); } catch { /* ignore */ }
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
