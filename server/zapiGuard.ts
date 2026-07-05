// ── Trava do número oficial do bot (Z-API) ─────────────────────────────────
import { getDefaultWhatsappInstance } from "./whatsapp/instanceStore";
import { createWhatsappProvider, getDefaultWhatsappProvider } from "./whatsapp/providerRegistry";
import { expectedOfficialPhone } from "./whatsapp/types";
import { zapiFetchWith, credsFromInstance } from "./whatsapp/zapiHttp";

export const OFFICIAL_BOT_PHONE = '5511926839456';
export const OFFICIAL_BOT_PHONE_DISPLAY = '(11) 92683-9456';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPhone: string | null = null;
let cachedAt = 0;

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export async function getExpectedOfficialPhone(): Promise<string> {
  const row = await getDefaultWhatsappInstance();
  return row ? expectedOfficialPhone(row) : OFFICIAL_BOT_PHONE;
}

/** Consulta o número REALMENTE conectado na instância Z-API (com cache de 5 min). */
export async function getConnectedBotPhone(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && cachedPhone !== null && now - cachedAt < CACHE_TTL_MS) return cachedPhone;

  const provider = await getDefaultWhatsappProvider(true);
  if (provider) {
    const phone = await provider.getConnectedPhone();
    if (phone) {
      cachedPhone = phone;
      cachedAt = now;
      return phone;
    }
  }

  const row = await getDefaultWhatsappInstance(true);
  const creds = row ? credsFromInstance(row) : null;
  if (!creds) return null;
  const { ok, data } = await zapiFetchWith(creds, 'device', { method: 'GET' });
  if (!ok || !data) return null;
  const phone = onlyDigits(data.phone || data?.device?.phone || data?.wid || '');
  if (!phone) return null;
  cachedPhone = phone;
  cachedAt = now;
  return phone;
}

export async function assertOfficialBotNumber(): Promise<{ ok: boolean; phone: string | null; error?: string }> {
  const expected = await getExpectedOfficialPhone();
  let phone = await getConnectedBotPhone();
  if (!phone) phone = await getConnectedBotPhone(true);
  if (!phone) {
    console.warn(`[Z-API Guarda] BLOQUEADO: não foi possível confirmar o número conectado.`);
    return {
      ok: false,
      phone: null,
      error: `Não foi possível confirmar que o bot está no número oficial ${OFFICIAL_BOT_PHONE_DISPLAY} (WhatsApp desconectado ou indisponível). Envio bloqueado por segurança.`,
    };
  }
  if (phone !== expected && phone !== OFFICIAL_BOT_PHONE) {
    console.error(`[Z-API Guarda] BLOQUEADO: conectado em ${phone}, oficial ${expected}.`);
    return {
      ok: false,
      phone,
      error: `Bot conectado em um número NÃO autorizado (${phone}). O bot só pode operar no número oficial ${OFFICIAL_BOT_PHONE_DISPLAY}.`,
    };
  }
  return { ok: true, phone };
}

export function invalidateBotPhoneCache() {
  cachedPhone = null;
  cachedAt = 0;
}
