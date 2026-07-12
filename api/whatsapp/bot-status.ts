/**
 * GET /api/whatsapp/bot-status — leve (sem Express/Z-API live).
 */
import { readBearer, resolveLitePrincipal } from "../../lib/tmsegAuth.js";
import { getBotStatusSnapshot } from "../../lib/whatsappLiteApi.js";

export default async function handler(req: { method?: string }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  const principal = await resolveLitePrincipal(token);
  if (!principal) {
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
