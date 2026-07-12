/** POST /api/whatsapp/bot-status/release — leve */
import { hasRole, readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";
import { loadReconnectLock, releaseReconnectLock } from "../lib/whatsappLiteApi.js";

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return (body && typeof body === "object") ? body as Record<string, unknown> : {};
}

export default async function handler(req: { method?: string; body?: unknown }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  if (!token) return res.status(401).json({ error: "Não autorizado" });
  const principal = await resolveLitePrincipal(token);
  if (!principal) return res.status(403).json({ error: "Usuário não encontrado" });

  try {
    const force = parseBody(req.body).force === true
      && hasRole(principal, "diretoria", "administrador", "ceo", "admin");
    await releaseReconnectLock(principal.id, force);
    const lock = await loadReconnectLock();
    res.status(200).json({ ok: true, lock });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 15 };
