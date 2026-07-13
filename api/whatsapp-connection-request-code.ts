/** POST /api/whatsapp/connection/request-code — leve (mobile wa_old/sms/voice) */
import { assertWhatsappAdminAccess, readBearer } from "../lib/tmsegAuth.js";
import { getInstance, instanceConfigured, requestMobilePairingCode } from "../lib/whatsappLiteApi.js";

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return (body && typeof body === "object") ? body as Record<string, unknown> : {};
}

export default async function handler(req: { method?: string; body?: unknown; headers?: Record<string, unknown> }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  const denied = await assertWhatsappAdminAccess(token, req);
  if (denied) {
    res.status(denied === "Não autorizado" ? 401 : 403).json({ error: denied });
    return;
  }

  const methodRaw = String(parseBody(req.body).method || "wa_old").toLowerCase();
  const method = (["sms", "voice", "wa_old"].includes(methodRaw) ? methodRaw : "wa_old") as "sms" | "voice" | "wa_old";

  try {
    const row = await getInstance();
    if (!row || !instanceConfigured(row)) {
      res.status(503).json({ error: "WhatsApp não configurado" });
      return;
    }
    const result = await requestMobilePairingCode(row, method);
    res.status(result.ok ? 200 : 502).json({
      registration: result.registration || null,
      phoneDisplay: result.phoneDisplay || null,
      phoneUsed: result.phoneUsed || null,
      phoneLinkCode: result.phoneLinkCode || null,
      requestCode: {
        ok: result.ok,
        method: result.method || method,
        data: result.data,
        error: result.error,
        message: result.message,
        captcha: result.captcha || null,
        phase: result.phase,
        phoneLinkCode: result.phoneLinkCode || null,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 45 };
