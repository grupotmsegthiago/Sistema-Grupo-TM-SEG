/** GET /api/zapi/health — leve: testa Z-API sem expor tokens */
import { credsFromRow, getInstance, instanceConfigured, zapiFetch } from "../../lib/whatsappLiteApi.js";
import { sanitizeWhatsappError } from "../../lib/whatsappDisplayUtils.js";

export default async function handler(req: { method?: string }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const row = await getInstance();
    if (!row || !instanceConfigured(row)) {
      res.status(503).json({ ok: false, configured: false, error: "Instância WhatsApp não configurada" });
      return;
    }
    const creds = credsFromRow(row);
    if (!creds) {
      res.status(503).json({ ok: false, configured: false, error: "Credenciais Z-API incompletas" });
      return;
    }

    const { ok, status, data } = await zapiFetch(creds, "status", { method: "GET" });
    const connected = data?.connected === true && data?.smartphoneConnected !== false;
    const rawError = data?.error || data?.message || (!ok ? `HTTP ${status}` : null);
    const error = rawError != null ? (sanitizeWhatsappError(String(rawError)) || String(rawError)) : null;

    res.status(connected ? 200 : 502).json({
      ok: !!connected,
      configured: true,
      apiReachable: status > 0 || !!data,
      httpStatus: status,
      connected: data?.connected ?? null,
      smartphoneConnected: data?.smartphoneConnected ?? null,
      session: data?.session ?? null,
      instanceType: creds.type,
      label: row.label,
      hasClientToken: !!creds.clientToken,
      clientTokenLooksLikeInstanceToken: !!(creds.clientToken && creds.token && creds.clientToken === creds.token),
      error: connected ? null : error,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message || "Falha ao consultar Z-API" });
  }
}

export const config = { maxDuration: 30 };
