/** POST /api/whatsapp/connection/confirm-code — leve (mobile confirm-code / PIN) */
import { assertWhatsappAdminAccess, readBearer } from "../lib/tmsegAuth.js";
import {
  confirmMobilePairingCode,
  confirmMobileSecurityPin,
  getConnectionStatus,
} from "../lib/whatsappLiteApi.js";

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return (body && typeof body === "object") ? body as Record<string, unknown> : {};
}

export default async function handler(req: { method?: string; body?: unknown; query?: Record<string, string>; headers?: Record<string, unknown> }, res: {
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

  const body = parseBody(req.body);
  const code = body.code != null ? String(body.code).trim() : "";
  const pin = body.pin != null ? String(body.pin).trim() : "";
  if (!code && !pin) {
    res.status(400).json({ error: "code ou pin obrigatório" });
    return;
  }

  try {
    const result = pin
      ? await confirmMobileSecurityPin(pin)
      : await confirmMobilePairingCode(code);
    const statusRes = await getConnectionStatus(req.query?.instanceId || null);
    res.status(result.ok ? 200 : 502).json({
      ...result,
      status: statusRes.status === 200 ? statusRes.body.status : null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 45 };
