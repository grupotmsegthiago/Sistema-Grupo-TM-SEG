/**
 * GET /api/whatsapp/groups — leve (sem Express).
 * Evita FUNCTION_INVOCATION_TIMEOUT / HTTP 504 do seletor no cadastro de cliente.
 */
import { assertAuthenticatedAccess, readBearer, resolveLitePrincipal } from "../../lib/tmsegAuth.js";
import { listWhatsappGroups } from "../../lib/whatsappLiteApi.js";

export default async function handler(req: {
  method?: string;
  headers?: Record<string, unknown>;
}, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "GET") {
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
  if (!await resolveLitePrincipal(token, req)) {
    res.status(403).json({ error: "Sessão inválida" });
    return;
  }

  try {
    const groups = await listWhatsappGroups();
    res.status(200).json(groups);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const disconnected = /DESCONECTADO/i.test(message);
    res.status(disconnected ? 503 : 502).json({ error: message || "Falha ao listar grupos" });
  }
}

export const config = { maxDuration: 60 };
