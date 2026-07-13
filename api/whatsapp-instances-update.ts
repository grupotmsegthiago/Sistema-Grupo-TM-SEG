/** PUT /api/whatsapp/instances/:id — leve (salvar credenciais sem Express) */
import { assertWhatsappAdminAccess, readBearer } from "../lib/tmsegAuth.js";
import { toPublicInstance, updateInstance } from "../lib/whatsappLiteApi.js";

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return (body && typeof body === "object") ? body as Record<string, unknown> : {};
}

export default async function handler(req: {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, unknown>;
}, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "PUT" && req.method !== "PATCH") {
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

  const body = parseBody(req.body);

  try {
    const updated = await updateInstance(instanceId, {
      slug: body.slug != null ? String(body.slug) : undefined,
      label: body.label != null ? String(body.label) : undefined,
      provider: body.provider as "zapi" | "meta" | "mock" | undefined,
      instance_type: body.instance_type as "web" | "mobile" | null | undefined,
      zapi_instance_id: body.zapi_instance_id != null ? String(body.zapi_instance_id) : undefined,
      zapi_token: typeof body.zapi_token === "string" ? body.zapi_token : undefined,
      zapi_client_token: body.zapi_client_token != null ? String(body.zapi_client_token) : undefined,
      meta_phone_number_id: body.meta_phone_number_id != null ? String(body.meta_phone_number_id) : undefined,
      meta_access_token: typeof body.meta_access_token === "string" ? body.meta_access_token : undefined,
      meta_api_version: body.meta_api_version != null ? String(body.meta_api_version) : undefined,
      official_ddi: body.official_ddi != null ? String(body.official_ddi) : undefined,
      official_phone: body.official_phone != null ? String(body.official_phone) : undefined,
      is_default: typeof body.is_default === "boolean" ? body.is_default : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    res.status(200).json(toPublicInstance(updated));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /não encontrada/i.test(message) ? 404 : 500;
    res.status(status).json({ error: message || "Falha ao salvar instância" });
  }
}

export const config = { maxDuration: 20 };
