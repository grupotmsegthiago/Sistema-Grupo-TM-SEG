/** POST /api/whatsapp/bot-status/claim — leve */
import { readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";
import { claimReconnectLock } from "../lib/whatsappLiteApi.js";

export default async function handler(req: { method?: string }, res: {
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
    const result = await claimReconnectLock(principal.id, principal.name || principal.email || "Usuário");
    res.status(result.ok ? 200 : 409).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 15 };
