/** GET /api/whatsapp/connection/sdk-token — token de sessão para o SDK Connector Z-API. */
import { assertWhatsappAdminAccess, readBearer } from "../lib/tmsegAuth.js";
import { getSdkConnectorToken } from "../lib/whatsappLiteApi.js";

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
  const denied = await assertWhatsappAdminAccess(token, req);
  if (denied) {
    res.status(denied === "Não autorizado" ? 401 : 403).json({ error: denied });
    return;
  }

  try {
    const result = await getSdkConnectorToken(req.query?.instanceId || null);
    if ("error" in result && result.error) {
      res.status(result.status).json({ error: result.error, data: "data" in result ? result.data : undefined });
      return;
    }
    res.status(200).json("body" in result ? result.body : result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 30 };
