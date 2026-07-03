// ── Trava do número oficial do bot (Z-API) ─────────────────────────────────
// Decisão da diretoria: o bot SÓ pode operar conectado no número oficial da
// Central — (11) 92683-9456. Se a instância for pareada com QUALQUER outro
// número, os envios são BLOQUEADOS server-side (nenhuma mensagem sai por um
// número errado) e o vigia alerta a equipe por e-mail.
//
// Regra de decisão (estrita, a pedido da diretoria):
//   - Número confirmado DIFERENTE do oficial → bloqueia (fail-closed).
//   - Número NÃO determinável (rede/erro/desconectado) → também bloqueia,
//     após UMA nova tentativa forçada — sem prova de que é o número oficial,
//     nenhuma mensagem sai. (Quando desconectado o envio falharia de qualquer
//     forma, então o custo prático do fail-closed é praticamente nulo.)

export const OFFICIAL_BOT_PHONE = '5511926839456'; // (11) 92683-9456
export const OFFICIAL_BOT_PHONE_DISPLAY = '(11) 92683-9456';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — evita consultar /device a cada envio
let cachedPhone: string | null = null;
let cachedAt = 0;

function zapiEnv() {
  const instance = process.env.ZAPI_INSTANCE_ID || process.env.VITE_ZAPI_INSTANCE_ID || '';
  const token = process.env.ZAPI_TOKEN || process.env.VITE_ZAPI_TOKEN || '';
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || process.env.VITE_ZAPI_CLIENT_TOKEN || '';
  return { instance, token, clientToken };
}

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Consulta o número REALMENTE conectado na instância Z-API (com cache de 5 min). */
export async function getConnectedBotPhone(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && cachedPhone !== null && now - cachedAt < CACHE_TTL_MS) return cachedPhone;
  const { instance, token, clientToken } = zapiEnv();
  if (!instance || !token) return null;
  const headers: Record<string, string> = {};
  if (clientToken) headers['Client-Token'] = clientToken;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const r = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/device`, { headers, signal: ac.signal });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!r.ok || !data) return null;
    const phone = onlyDigits(data.phone || data?.device?.phone || data?.wid || '');
    if (!phone) return null;
    cachedPhone = phone;
    cachedAt = now;
    return phone;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Guarda de envio: bloqueia se a instância estiver conectada em um número
 * DIFERENTE do oficial. Retorna { ok:true } quando pode enviar.
 */
export async function assertOfficialBotNumber(): Promise<{ ok: boolean; phone: string | null; error?: string }> {
  let phone = await getConnectedBotPhone();
  if (!phone) {
    // Uma nova tentativa forçada (ignora cache) antes de bloquear — evita
    // travar por um blip transitório de rede.
    phone = await getConnectedBotPhone(true);
  }
  if (!phone) {
    // Sem prova do número oficial, NÃO envia (fail-closed).
    console.warn(`[Z-API Guarda] BLOQUEADO: não foi possível confirmar o número conectado (instância desconectada ou Z-API indisponível). Envio negado por segurança.`);
    return {
      ok: false,
      phone: null,
      error: `Não foi possível confirmar que o bot está no número oficial ${OFFICIAL_BOT_PHONE_DISPLAY} (WhatsApp desconectado ou Z-API indisponível). Envio bloqueado por segurança.`,
    };
  }
  if (phone !== OFFICIAL_BOT_PHONE) {
    console.error(`[Z-API Guarda] BLOQUEADO: instância conectada no número ${phone}, mas o oficial é ${OFFICIAL_BOT_PHONE} (${OFFICIAL_BOT_PHONE_DISPLAY}). Nenhum envio será feito.`);
    return {
      ok: false,
      phone,
      error: `Bot conectado em um número NÃO autorizado (${phone}). O bot só pode operar no número oficial ${OFFICIAL_BOT_PHONE_DISPLAY} — reconecte o número correto no painel Z-API.`,
    };
  }
  return { ok: true, phone };
}

/** Limpa o cache (usado pelo vigia ao detectar troca de conexão). */
export function invalidateBotPhoneCache() {
  cachedPhone = null;
  cachedAt = 0;
}
