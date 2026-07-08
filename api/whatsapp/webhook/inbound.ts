function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function digitsOnly(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function looksLikeGroupChatId(value: unknown): boolean {
  const raw = String(value || "");
  return raw.includes("@g.us")
    || raw.endsWith("-group")
    || /^\d+-\d+$/.test(raw)
    || /^120363\d{8,}$/.test(digitsOnly(raw));
}

function hasPrivateReplyPhone(payload: any): boolean {
  const phone = String(payload?.phone || "");
  const from = String(payload?.from || "");
  const isGroup = payload?.isGroup === true || looksLikeGroupChatId(phone) || looksLikeGroupChatId(from);
  if (!isGroup) return digitsOnly(phone || from).length >= 10;

  const candidates = [
    payload?.participantPhone,
    payload?.participant,
    payload?.senderPhone,
    payload?.eventResponse?.responseFrom,
    payload?.eventResponse?.referencedMessage?.participant,
    payload?.from,
  ];

  return candidates.some((candidate) => {
    if (!candidate || looksLikeGroupChatId(candidate) || String(candidate).includes("@lid")) return false;
    const digits = digitsOnly(candidate);
    return digits.length >= 10 && !looksLikeGroupChatId(digits);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const secret = process.env.ZAPI_WEBHOOK_SECRET || process.env.SUPABASE_WEBHOOK_SECRET || "";
    if (secret) {
      const header = String(req.headers["x-zapi-secret"] || req.headers["x-webhook-secret"] || "");
      const query = String(req.query?.token || "");
      if (header !== secret && query !== secret) {
        res.status(401).json({ ok: false, error: "invalid webhook secret" });
        return;
      }
    }

    const payload = parseBody(req.body);
    if (!hasPrivateReplyPhone(payload as any)) {
      res.status(200).json({
        ok: true,
        handled: true,
        action: "no_reply_phone",
        error: "Não foi possível identificar o telefone privado do remetente (participantPhone)",
      });
      return;
    }

    const { handleInboundWhatsappMessage } = await import("../../../server/whatsapp/inboundBot");
    const result = await handleInboundWhatsappMessage((payload || {}) as any);
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[WhatsApp Inbound Function]", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Erro interno" });
  }
}

