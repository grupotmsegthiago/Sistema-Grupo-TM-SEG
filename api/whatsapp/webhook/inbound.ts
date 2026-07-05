import { handleInboundWhatsappMessage } from "../../../server/whatsapp/inboundBot";

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
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
    const result = await handleInboundWhatsappMessage((payload || {}) as any);
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[WhatsApp Inbound Function]", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Erro interno" });
  }
}

