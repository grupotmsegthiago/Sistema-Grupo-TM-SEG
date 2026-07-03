// ── Vigia da conexão do WhatsApp (Z-API) ────────────────────────────────────
// Objetivo: detectar queda da sessão em minutos, tentar UMA reconexão suave
// (com cooldown longo — reconexões insistentes/repetidas aumentam o risco de
// banimento pelo WhatsApp) e alertar a equipe por e-mail na queda e na volta.
// O vigia NUNCA fica em loop de restart: no máximo 1 restart por incidente e
// respeitando um cooldown global de 30 minutos entre restarts.

import { createClient } from '@supabase/supabase-js';
import { sendSystemAlertEmail } from "./emailService";
import { getConnectedBotPhone, invalidateBotPhoneCache, OFFICIAL_BOT_PHONE, OFFICIAL_BOT_PHONE_DISPLAY } from "./zapiGuard";

const COOLDOWN_SETTINGS_KEY = 'zapi_watchdog_last_restart_at';

function getSb() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// Cooldown persistido: sobrevive a reinícios do servidor (deploys) para o
// freio anti-loop de restart nunca zerar sem querer. Best-effort — se o banco
// falhar, cai no valor em memória.
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
    console.warn(`[Z-API Vigia] Falha ao persistir cooldown (segue em memória): ${e?.message || e}`);
  }
}

const CHECK_INTERVAL_MS = 3 * 60 * 1000;          // checa a cada 3 min
const RESTART_COOLDOWN_MS = 30 * 60 * 1000;       // no máx. 1 restart a cada 30 min
const CONFIRM_CHECKS = 2;                          // exige 2 leituras "caído" seguidas (evita falso positivo)
const ALERT_RECIPIENTS = ['thiago@grupotmseg.com.br', 'operacional@grupotmseg.com.br'];

const nowSP = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function zapiEnv() {
  const instance = process.env.ZAPI_INSTANCE_ID || process.env.VITE_ZAPI_INSTANCE_ID || '';
  const token = process.env.ZAPI_TOKEN || process.env.VITE_ZAPI_TOKEN || '';
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || process.env.VITE_ZAPI_CLIENT_TOKEN || '';
  return { instance, token, clientToken };
}

async function zapiGet(path: string): Promise<any | null> {
  const { instance, token, clientToken } = zapiEnv();
  if (!instance || !token) return null;
  const headers: Record<string, string> = {};
  if (clientToken) headers['Client-Token'] = clientToken;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const r = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/${path}`, { headers, signal: ac.signal });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { raw: text, httpStatus: r.status }; }
  } finally {
    clearTimeout(timer);
  }
}

export function startZapiWatchdog() {
  const { instance, token } = zapiEnv();
  if (!instance || !token) {
    console.log('[Z-API Vigia] Z-API não configurada — vigia desativado.');
    return;
  }

  // Estado do incidente atual
  let lastConnected: boolean | null = null;   // null = ainda não sabemos
  let downStreak = 0;                          // leituras "caído" consecutivas
  let incidentOpen = false;                    // já alertamos esta queda?
  let incidentStartedAt: string | null = null;
  let restartTriedThisIncident = false;
  let wrongNumberAlerted = false;              // já alertamos que conectaram o número ERRADO?
  let lastRestartAt = 0;                       // cooldown global de restart (persistido no banco)
  void loadLastRestartAt().then(ts => { if (ts > lastRestartAt) lastRestartAt = ts; }).catch(() => {});
  // Histórico de quedas nas últimas 24h (só timestamps) — vai no e-mail para
  // a equipe enxergar reconexões frequentes (sinal de risco de banimento).
  const dropHistory: number[] = [];

  const tick = async () => {
    let status: any = null;
    try {
      status = await zapiGet('status');
    } catch (e: any) {
      // Falha de REDE ao consultar a Z-API não significa que o bot caiu.
      console.warn(`[Z-API Vigia] Falha ao consultar status (rede): ${e?.message || e}`);
      return;
    }
    if (!status || typeof status.connected !== 'boolean') {
      console.warn('[Z-API Vigia] Resposta de status inesperada — ignorando esta leitura.');
      return;
    }

    const connected = status.connected === true && status.smartphoneConnected !== false;

    if (connected) {
      downStreak = 0;

      // ── Trava do número oficial: o bot SÓ pode operar no (11) 92683-9456 ──
      // Se alguém parear a instância com OUTRO número, os envios já são
      // bloqueados pela guarda em server/zapiGuard.ts; aqui o vigia alerta a
      // equipe por e-mail (1 alerta por incidente de número errado).
      if (lastConnected !== true) invalidateBotPhoneCache(); // reconectou agora — não confiar no cache
      const phone = await getConnectedBotPhone(lastConnected !== true).catch(() => null);
      if (phone && phone !== OFFICIAL_BOT_PHONE) {
        if (!wrongNumberAlerted) {
          wrongNumberAlerted = true;
          console.error(`[Z-API Vigia] NÚMERO ERRADO conectado: ${phone} (oficial: ${OFFICIAL_BOT_PHONE}). Envios bloqueados pela guarda.`);
          void sendSystemAlertEmail(
            ALERT_RECIPIENTS,
            'ALERTA: WhatsApp Bot conectado no NÚMERO ERRADO — Central de Monitoramento',
            `<h2>Bot conectado em um número não autorizado</h2>
             <p>Em <strong>${nowSP()}</strong> a instância Z-API foi detectada conectada no número <strong>${phone}</strong>.</p>
             <table class="info-table">
               <tr><td>Número oficial do bot</td><td><strong>${OFFICIAL_BOT_PHONE_DISPLAY}</strong> (${OFFICIAL_BOT_PHONE})</td></tr>
               <tr><td>Número conectado agora</td><td>${phone}</td></tr>
               <tr><td>Envios automáticos</td><td><strong>BLOQUEADOS</strong> — nenhuma mensagem sai por número errado.</td></tr>
             </table>
             <div class="highlight-box"><p><strong>Ação:</strong> desconecte esse número no painel da Z-API e reconecte o número oficial ${OFFICIAL_BOT_PHONE_DISPLAY} via QR Code.</p></div>`
          ).catch(() => {});
        }
      } else if (phone === OFFICIAL_BOT_PHONE && wrongNumberAlerted) {
        wrongNumberAlerted = false;
        console.log(`[Z-API Vigia] Número oficial ${OFFICIAL_BOT_PHONE_DISPLAY} reconectado — envios liberados.`);
        void sendSystemAlertEmail(
          ALERT_RECIPIENTS,
          'WhatsApp Bot de volta no número OFICIAL — Central de Monitoramento',
          `<h2>Número oficial reconectado</h2>
           <p>Em <strong>${nowSP()}</strong> a instância voltou a operar no número oficial <strong>${OFFICIAL_BOT_PHONE_DISPLAY}</strong>. Envios automáticos liberados.</p>`
        ).catch(() => {});
      }

      if (incidentOpen) {
        // RECUPEROU: fecha o incidente e avisa.
        incidentOpen = false;
        restartTriedThisIncident = false;
        const since = incidentStartedAt || '?';
        incidentStartedAt = null;
        console.log(`[Z-API Vigia] Bot RECONECTADO (queda iniciada em ${since}).`);
        void sendSystemAlertEmail(
          ALERT_RECIPIENTS,
          'WhatsApp Bot RECONECTADO — Central de Monitoramento',
          `<h2>Bot do WhatsApp voltou</h2>
           <p>A sessão do WhatsApp (Z-API) reconectou em <strong>${nowSP()}</strong>.</p>
           <table class="info-table">
             <tr><td>Queda detectada em</td><td>${since}</td></tr>
             <tr><td>Quedas nas últimas 24h</td><td>${dropHistory.length}</td></tr>
           </table>
           ${dropHistory.length >= 3 ? '<div class="highlight-box"><p><strong>Atenção:</strong> 3 ou mais quedas em 24h. Reconexões frequentes aumentam o risco de banimento pelo WhatsApp — verifique o aparelho pareado (bateria, internet, WhatsApp aberto) e o painel da Z-API.</p></div>' : ''}`
        ).catch(() => {});
      }
      lastConnected = true;
      return;
    }

    // Desconectado nesta leitura
    downStreak += 1;
    console.warn(`[Z-API Vigia] Bot desconectado (leitura ${downStreak}/${CONFIRM_CHECKS}) — connected=${status.connected} smartphoneConnected=${status.smartphoneConnected}`);
    if (downStreak < CONFIRM_CHECKS) return; // aguarda confirmação (evita blip)

    if (!incidentOpen) {
      // ABRE incidente: alerta a equipe imediatamente.
      incidentOpen = true;
      incidentStartedAt = nowSP();
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      while (dropHistory.length && dropHistory[0] < cutoff) dropHistory.shift();
      dropHistory.push(Date.now());
      console.error(`[Z-API Vigia] QUEDA CONFIRMADA do bot em ${incidentStartedAt}. Quedas nas últimas 24h: ${dropHistory.length}.`);
      void sendSystemAlertEmail(
        ALERT_RECIPIENTS,
        'ALERTA: WhatsApp Bot DESCONECTADO — Central de Monitoramento',
        `<h2>Bot do WhatsApp caiu</h2>
         <p>A sessão do WhatsApp (Z-API) está <strong>desconectada</strong> desde <strong>${incidentStartedAt}</strong>.</p>
         <table class="info-table">
           <tr><td>Quedas nas últimas 24h</td><td>${dropHistory.length}</td></tr>
           <tr><td>Reconexão automática</td><td>O sistema fará no máximo 1 tentativa suave (evita loop de reconexão, que gera risco de banimento).</td></tr>
         </table>
         <div class="highlight-box"><p>Se não reconectar em alguns minutos, verifique o aparelho pareado (internet/bateria) e, se preciso, escaneie o QR Code no painel da Z-API.</p></div>`
      ).catch(() => {});
    }

    // Reconexão SUAVE: no máximo 1 tentativa por incidente + cooldown global.
    const now = Date.now();
    if (!restartTriedThisIncident && now - lastRestartAt >= RESTART_COOLDOWN_MS) {
      restartTriedThisIncident = true;
      lastRestartAt = now;
      void saveLastRestartAt(now);
      try {
        console.log('[Z-API Vigia] Tentando reconexão suave (restart único da instância)...');
        await zapiGet('restart');
      } catch (e: any) {
        console.warn(`[Z-API Vigia] Restart falhou: ${e?.message || e}`);
      }
    }
    lastConnected = false;
  };

  setInterval(() => { void tick().catch(e => console.warn(`[Z-API Vigia] tick falhou: ${e?.message || e}`)); }, CHECK_INTERVAL_MS);
  // Primeira leitura logo após subir (com pequeno atraso para o boot terminar).
  setTimeout(() => { void tick().catch(() => {}); }, 15_000);
  console.log(`[Z-API Vigia] ativo — status a cada ${CHECK_INTERVAL_MS / 60000} min; alerta por e-mail na queda/volta; no máx. 1 restart por incidente (cooldown ${RESTART_COOLDOWN_MS / 60000} min).`);
}
