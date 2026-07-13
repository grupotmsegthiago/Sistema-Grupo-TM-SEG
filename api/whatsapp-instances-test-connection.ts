/** POST /api/whatsapp/instances/:id/test-connection — leve (sem Express) */
import { assertWhatsappAdminAccess, readBearer } from "../lib/tmsegAuth.js";
import { testInstanceConnection } from "../lib/whatsappLiteApi.js";

export default async function handler(req: { method?: string; query?: Record<string, string> }, res: {
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

  const instanceId = String(req.query?.instanceId || req.query?.id || "").trim();
  if (!instanceId) {
    res.status(400).json({ error: "instanceId obrigatório" });
    return;
  }

  try {
    const result = await testInstanceConnection(instanceId);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json(result.body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message || "Falha no teste de conexão" });
  }
}

export const config = { maxDuration: 30 };
