const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";

type ZapiCreds = {
  instance: string;
  token: string;
  clientToken: string;
  officialPhone: string;
};

function parseBody(body: unknown): any {
  if (typeof body !== "string") return body || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function digitsOnly(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function authToken(req: any): string {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers?.["x-auth-token"] || "");
}

async function supabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

function zapiBase(creds: ZapiCreds): string {
  return `https://api.z-api.io/instances/${creds.instance}/token/${creds.token}`;
}

function zapiHeaders(creds: ZapiCreds): Record<string, string> {
  return {
    ...(creds.clientToken ? { "Client-Token": creds.clientToken } : {}),
    "Content-Type": "application/json",
  };
}

async function getDefaultZapiCreds(sb: any): Promise<ZapiCreds | null> {
  const { data } = await sb
    .from("whatsapp_instances")
    .select("zapi_instance_id,zapi_token,zapi_client_token,official_ddi,official_phone,provider,is_default,enabled")
    .eq("is_default", true)
    .eq("enabled", true)
    .maybeSingle();

  if (data?.zapi_instance_id && data?.zapi_token) {
    const ddi = digitsOnly(data.official_ddi || "55") || "55";
    const local = digitsOnly(data.official_phone || "");
    return {
      instance: String(data.zapi_instance_id),
      token: String(data.zapi_token),
      clientToken: String(data.zapi_client_token || ""),
      officialPhone: local.startsWith(ddi) ? local : `${ddi}${local}`,
    };
  }

  const instance = String(process.env.ZAPI_INSTANCE_ID || "").trim();
  const token = String(process.env.ZAPI_TOKEN || "").trim();
  if (!instance || !token) return null;
  const ddi = digitsOnly(process.env.ZAPI_OFFICIAL_DDI || "55") || "55";
  const local = digitsOnly(process.env.ZAPI_OFFICIAL_PHONE || process.env.META_WHATSAPP_DISPLAY_PHONE || "11926839456");
  return {
    instance,
    token,
    clientToken: String(process.env.ZAPI_CLIENT_TOKEN || "").trim(),
    officialPhone: local.startsWith(ddi) ? local : `${ddi}${local}`,
  };
}

async function assertOfficialBot(creds: ZapiCreds): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`${zapiBase(creds)}/device`, { headers: zapiHeaders(creds) });
  if (!resp.ok) return { ok: false, error: "Não foi possível confirmar o número oficial do WhatsApp." };
  const data: any = await resp.json().catch(() => ({}));
  const connected = digitsOnly(data.phone || data?.device?.phone || data?.wid || "");
  if (!connected) return { ok: false, error: "WhatsApp desconectado ou número não confirmado." };
  if (connected !== creds.officialPhone && connected !== "5511926839456") {
    return { ok: false, error: `Bot conectado em número não autorizado (${connected}).` };
  }
  return { ok: true };
}

async function findClientGroup(sb: any, clientName: string): Promise<{ name: string; groupId: string } | null> {
  const select = "name,whatsapp_group_id";
  let { data } = await sb.from("clients").select(select).eq("name", clientName).limit(1);
  if (!data || data.length === 0) {
    const byTrading = await sb.from("clients").select(select).eq("trading_name", clientName).limit(1);
    data = byTrading.data || [];
  }
  const row = data?.[0];
  if (!row) return null;
  return { name: String(row.name || clientName), groupId: String(row.whatsapp_group_id || "").trim() };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  try {
    const body = parseBody(req.body);
    const clientName = String(body.clientName || "").trim();
    const message = String(body.message || "").trim();
    const missionId = body.missionId ? String(body.missionId) : null;
    const imagePayload = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    const requireImage = body.requireImage === true;

    if (!clientName || !message) {
      res.status(400).json({ error: "clientName e message são obrigatórios" });
      return;
    }
    if (requireImage && !imagePayload) {
      res.status(400).json({ error: "Foto obrigatória ausente — envio ao grupo não foi realizado sem imagem." });
      return;
    }

    const sb = await supabase();
    const creds = await getDefaultZapiCreds(sb);
    if (!creds) {
      res.status(503).json({ error: "WhatsApp não configurado no banco" });
      return;
    }

    const client = await findClientGroup(sb, clientName);
    if (!client) {
      res.status(200).json({ skipped: true, reason: "cliente não encontrado no cadastro" });
      return;
    }
    if (!client.groupId) {
      res.status(200).json({ skipped: true, reason: "cliente sem grupo de WhatsApp configurado" });
      return;
    }
    if (!/-group$|@g\.us$/i.test(client.groupId)) {
      res.status(400).json({ error: "O destino configurado no cadastro do cliente não é um grupo de WhatsApp válido." });
      return;
    }

    const guard = await assertOfficialBot(creds);
    if (!guard.ok) {
      res.status(503).json({ error: guard.error || "Número oficial não confirmado" });
      return;
    }

    const endpoint = imagePayload ? "send-image" : "send-text";
    const sendResp = await fetch(`${zapiBase(creds)}/${endpoint}`, {
      method: "POST",
      headers: zapiHeaders(creds),
      body: JSON.stringify(imagePayload
        ? { phone: client.groupId, image: imagePayload, caption: message, viewOnce: false }
        : { phone: client.groupId, message }),
    });
    const text = await sendResp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!sendResp.ok) {
      res.status(sendResp.status || 502).json({ error: "Falha WhatsApp", detail: data });
      return;
    }

    res.status(200).json({ sent: true, endpoint, missionId, ...((data && typeof data === "object") ? data : {}) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}

