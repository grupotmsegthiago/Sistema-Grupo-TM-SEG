// ── Bot inbound: comando "resumo" → resposta no PV (nunca no grupo) ──────────

import { assertOfficialBotNumber } from "../zapiGuard";
import { whatsappProviderSendText } from "./providerRegistry";
import { buildFleetOperationalSummary } from "./fleetSummary";

export function isWhatsappResumoEnabled(): boolean {
  return (process.env.WHATSAPP_RESUMO_ENABLED || "").trim().toLowerCase() === "true";
}

const RESUMO_PATTERN = /^(resumo|atualiza(ç|c)(a|ã)o|status|viaturas)(\s|$)|resumo operacional/i;

export function isFleetSummaryCommand(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return RESUMO_PATTERN.test(t);
}

export type ZapiInboundPayload = {
  phone?: string;
  from?: string;
  participant?: string;
  senderPhone?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  text?: { message?: string };
  message?: { text?: string };
  body?: string;
};

export function extractInboundText(payload: ZapiInboundPayload): string {
  return String(
    payload.message?.text
    || payload.text?.message
    || payload.body
    || "",
  ).trim();
}

export function resolveReplyPhone(payload: ZapiInboundPayload): string | null {
  const phone = String(payload.phone || payload.from || "");
  const isGroup = payload.isGroup === true || phone.includes("@g.us") || phone.endsWith("-group");
  if (isGroup) {
    const participant = String(payload.participant || payload.senderPhone || "").replace(/\D/g, "");
    if (participant.length >= 10) return participant.length <= 11 ? `55${participant}` : participant;
    return null;
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length <= 11 ? `55${digits}` : digits;
}

export async function handleInboundWhatsappMessage(payload: ZapiInboundPayload): Promise<{
  handled: boolean;
  action?: string;
  replyPhone?: string | null;
  error?: string;
}> {
  if (payload.fromMe) return { handled: false, action: "ignored_from_me" };

  const text = extractInboundText(payload);
  if (!isFleetSummaryCommand(text)) return { handled: false, action: "not_a_command" };

  if (!isWhatsappResumoEnabled()) {
    return { handled: true, action: "resumo_disabled", error: "WHATSAPP_RESUMO_ENABLED não está ativo" };
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
    const summary = await buildFleetOperationalSummary();
    const result = await whatsappProviderSendText(replyPhone, summary.text, "resumo viaturas PV");
    if (!result.ok) {
      return { handled: true, action: "send_failed", replyPhone, error: result.error || `HTTP ${result.httpStatus}` };
    }
    return { handled: true, action: "resumo_sent_pv", replyPhone };
  } catch (e: any) {
    return { handled: true, action: "error", replyPhone, error: e?.message || "Erro ao gerar resumo" };
  }
}
