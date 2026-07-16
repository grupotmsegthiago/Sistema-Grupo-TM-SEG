/** POST /api/zapi/webhook/connection — leve (Connected/DisconnectedCallback). */
function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function readSecret(req: {
  headers?: Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
}): string {
  const h = req.headers || {};
  const q = req.query || {};
  const header = String(h["x-zapi-secret"] || h["x-webhook-secret"] || "");
  const token = q.token;
  const query = Array.isArray(token) ? String(token[0] || "") : String(token || "");
  return header || query;
}

export default async function handler(req: {
  method?: string;
  body?: unknown;
  headers?: Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
}, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const expected = (process.env.ZAPI_WEBHOOK_SECRET || "").trim();
    if (expected && readSecret(req) !== expected) {
      res.status(401).json({ ok: false, error: "invalid webhook secret" });
      return;
    }

    // Import dinâmico (igual inbound) — evita FUNCTION_INVOCATION_FAILED no boot
    // por árvore pesada (e-mail / auto-reconnect) no bundle estático da Vercel.
    const { handleZapiConnectionWebhook } = await import("../server/zapiConnectionWebhook.js");
    const result = await handleZapiConnectionWebhook(parseBody(req.body));
    res.status(200).json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[Z-API Webhook Connection]", message);
    // 200 evita loop de retry agressivo da Z-API
    res.status(200).json({ ok: false, error: message || "erro interno" });
  }
}
