/** POST /api/whatsapp/bot-status/claim — leve */
import { assertAuthenticatedAccess, assertWhatsappAdminAccess, readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";
import { claimReconnectLock } from "../lib/whatsappLiteApi.js";

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
  const denied = await assertAuthenticatedAccess(token, req);
  if (denied) {
    res.status(denied === "Não autorizado" ? 401 : 403).json({ error: denied });
    return;
  }
  const principal = await resolveLitePrincipal(token, req);
  if (!principal) return res.status(403).json({ error: "Usuário não encontrado" });

  const force = parseBody(req.body).force === true;
  if (force) {
    const adminDenied = await assertWhatsappAdminAccess(token, req);
    if (adminDenied) {
      res.status(403).json({ error: "Somente Diretoria/Administrador pode assumir reconexão de outro usuário." });
      return;
    }
  }

  try {
    const result = await claimReconnectLock(
      principal.id,
      principal.name || principal.email || "Usuário",
      { force },
    );
    res.status(result.ok ? 200 : 409).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 15 };
