/**
 * GET /api/whatsapp/bot-status — leve (sem Express/Z-API live).
 */
import { assertAuthenticatedAccess, readBearer, resolveLitePrincipal } from "../../lib/tmsegAuth.js";
import { getBotStatusSnapshot } from "../../lib/whatsappLiteApi.js";

export default async function handler(req: { method?: string; headers?: Record<string, unknown> }, res: {
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
    res.status(200).json(await getBotStatusSnapshot());
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message || "Falha ao consultar status" });
  }
}

export const config = { maxDuration: 15 };
