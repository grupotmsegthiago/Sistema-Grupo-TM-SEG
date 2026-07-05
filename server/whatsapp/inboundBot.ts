// ── Bot inbound: comandos do grupo → resposta no PV (nunca no grupo) ─────────

import { assertOfficialBotNumber } from "../zapiGuard";
import { whatsappProviderSendText } from "./providerRegistry";
import { buildFleetOperationalSummary } from "./fleetSummary";

export function isWhatsappResumoEnabled(): boolean {
  return (process.env.WHATSAPP_RESUMO_ENABLED || "").trim().toLowerCase() === "true";
}

const RESUMO_PATTERN = /^(resumo|atualiza(ç|c)(a|ã)o|status|viaturas)(\s|$)|resumo operacional/i;
const OPERATIONAL_PRIVATE_REPLY_PATTERN = /\b(rein[ií]cio|reiniciou|reiniciar|reiniciado)\b/i;

export function isFleetSummaryCommand(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return RESUMO_PATTERN.test(t);
}

export function isOperationalPrivateReplyCommand(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return OPERATIONAL_PRIVATE_REPLY_PATTERN.test(t);
}

export type ZapiInboundPayload = {
  phone?: string;
  from?: string;
  participant?: string;
  participantPhone?: string | null;
  senderPhone?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  senderName?: string;
  chatName?: string;
  text?: { message?: string };
  message?: { text?: string; extendedTextMessage?: { text?: string } };
  eventResponse?: {
    response?: string;
    responseFrom?: string;
    referencedMessage?: { participant?: string };
  };
  body?: string;
};

function firstName(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split(/\s+/)[0] || "";
}

export function buildOperationalPrivateReply(payload: ZapiInboundPayload): string {
  const name = firstName(payload.senderName || payload.chatName);
  const prefix = name ? `${name}, ` : "";
  return `${prefix}vou checar com a equipe agora e já retorno com atualização. 👍`;
}

export function extractInboundText(payload: ZapiInboundPayload): string {
  return String(
    payload.message?.text
    || payload.message?.extendedTextMessage?.text
    || payload.text?.message
    || payload.body
    || payload.eventResponse?.response
    || "",
  ).trim();
}

function digitsOnly(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBrazilPhone(value: unknown): string | null {
  const digits = digitsOnly(value);
  if (digits.length < 10) return null;
  return digits.length <= 11 ? `55${digits}` : digits;
}

function looksLikeGroupChatId(value: string): boolean {
  const phone = String(value || "");
  return phone.includes("@g.us")
    || phone.endsWith("-group")
    || /^\d+-\d+$/.test(phone);
}

export function resolveReplyPhone(payload: ZapiInboundPayload): string | null {
  const phone = String(payload.phone || payload.from || "");
  const isGroup = payload.isGroup === true || looksLikeGroupChatId(phone);
  if (isGroup) {
    return normalizeBrazilPhone(
      payload.participantPhone
      || payload.participant
      || payload.senderPhone
      || payload.eventResponse?.responseFrom
      || payload.eventResponse?.referencedMessage?.participant,
    );
  }
  return normalizeBrazilPhone(phone);
}

export function resolveInboundChatKind(payload: ZapiInboundPayload): "group" | "private" {
  const phone = String(payload.phone || payload.from || "");
  return payload.isGroup === true || looksLikeGroupChatId(phone) ? "group" : "private";
}

export function resolveInboundDebug(payload: ZapiInboundPayload): { chatKind: "group" | "private"; replyPhone: string | null } {
  const chatKind = resolveInboundChatKind(payload);
  return {
    chatKind,
    replyPhone: resolveReplyPhone(payload),
  };
}

export async function handleInboundWhatsappMessage(payload: ZapiInboundPayload): Promise<{
  handled: boolean;
  action?: string;
  replyPhone?: string | null;
  error?: string;
}> {
  if (payload.fromMe) return { handled: false, action: "ignored_from_me" };

  const text = extractInboundText(payload);
  const isSummary = isFleetSummaryCommand(text);
  const isOperationalReply = isOperationalPrivateReplyCommand(text);
  if (!isSummary && !isOperationalReply) return { handled: false, action: "not_a_command" };

  if (!isWhatsappResumoEnabled()) {
    return { handled: true, action: "inbound_bot_disabled", error: "WHATSAPP_RESUMO_ENABLED não está ativo" };
  }

  const numGuard = await assertOfficialBotNumber();
  if (!numGuard.ok) {
    return { handled: true, action: "blocked_unofficial_number", error: numGuard.error || "Número não oficial" };
  }

  const replyPhone = resolveReplyPhone(payload);
  if (!replyPhone) {
    return { handled: true, action: "no_reply_phone", error: "Não foi possível identificar o remetente (participant)" };
  }

  try {
    const message = isSummary
      ? (await buildFleetOperationalSummary()).text
      : buildOperationalPrivateReply(payload);
    const result = await whatsappProviderSendText(
      replyPhone,
      message,
      isSummary ? "resumo viaturas PV" : "pedido operacional PV",
    );
    if (!result.ok) {
      return { handled: true, action: "send_failed", replyPhone, error: result.error || `HTTP ${result.httpStatus}` };
    }
    return { handled: true, action: isSummary ? "resumo_sent_pv" : "operational_reply_sent_pv", replyPhone };
  } catch (e: any) {
    return { handled: true, action: "error", replyPhone, error: e?.message || "Erro ao gerar resumo" };
  }
}
