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
  if (looksLikeZapiSecret(s)) {
    if (/send-text/i.test(s)) return "Bot desconectado — não consegue enviar mensagens (send-text). Gere novo código no eSIM.";
    if (/send-image/i.test(s)) return "Bot desconectado — não consegue enviar imagens. Gere novo código no eSIM.";
    return "Bot desconectado da Z-API — reconecte pelo código no WhatsApp Business do eSIM.";
  }
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}
