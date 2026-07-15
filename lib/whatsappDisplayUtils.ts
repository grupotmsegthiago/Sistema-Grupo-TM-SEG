import { WHATSAPP_BOT_DISPLAY_NAME } from "./zapiMobileEnv.js";

/** Nunca exibir URL/token Z-API na UI. */
export function looksLikeZapiSecret(value: string | null | undefined): boolean {
  const s = String(value || "").trim();
  if (!s) return false;
  return /api\.z-api\.io/i.test(s)
    || /\/token\/[A-F0-9]{8,}/i.test(s)
    || /^https?:\/\//i.test(s);
}

export function safeWhatsappInstanceLabel(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s || looksLikeZapiSecret(s)) return WHATSAPP_BOT_DISPLAY_NAME;
  if (s.length > 80) return WHATSAPP_BOT_DISPLAY_NAME;
  return s;
}

export function sanitizeWhatsappError(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/client-token.*not allowed/i.test(s) || /Client-Token \[.+\] not allowed/i.test(s)) {
    if (/client-token\s+null\s+not allowed/i.test(s)) {
      return "Client-Token não configurado — cadastre ZAPI_CLIENT_TOKEN na Vercel (Token de Segurança da conta Z-API) ou salve em Configurações → WhatsApp.";
    }
    return "Client-Token inválido na Vercel — no painel Z-API copie o Token de Segurança da conta (não o Token da instância) e atualize ZAPI_CLIENT_TOKEN.";
  }
  if (/client-token is not configured/i.test(s)) {
    return "Client-Token não configurado — cadastre ZAPI_CLIENT_TOKEN na Vercel (Token de Segurança da conta Z-API).";
  }
  if (looksLikeZapiSecret(s)) {
    if (/send-text/i.test(s)) return "Bot desconectado — não consegue enviar mensagens (send-text). Gere novo código no eSIM.";
    if (/send-image/i.test(s)) return "Bot desconectado — não consegue enviar imagens. Gere novo código no eSIM.";
    return "Bot desconectado da Z-API — reconecte pelo código no WhatsApp Business do eSIM.";
  }
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}
