/** GET /api/whatsapp/connection/status — leve */
import { isWhatsappAdmin, readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";
import { getConnectionStatus } from "../lib/whatsappLiteApi.js";

export default async function handler(req: { method?: string; query?: Record<string, string> }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  if (!token) return res.status(401).json({ error: "Não autorizado" });
  const principal = await resolveLitePrincipal(token);
  if (!principal || !isWhatsappAdmin(principal)) {
    return res.status(403).json({ error: "Sem permissão" });
  }

  try {
    const result = await getConnectionStatus(req.query?.instanceId || null);
    res.status(result.status).json("body" in result ? result.body : { error: result.error });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 30 };
