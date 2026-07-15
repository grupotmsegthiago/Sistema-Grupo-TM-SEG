const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_SUPABASE_REF = "ajhmmjuewdsukecaimik";

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

function decodeSupabaseRef(key: string): string | null {
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json)?.ref || null;
  } catch {
    return null;
  }
}

function normalizeClientName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " E ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(LTDA|EIRELI|EPP|ME|SA|S A|S\/A|TRANSPORTES?|LOGISTICA|SEGURANCA|VIGILANCIA|PATRIMONIAL|SERVICOS?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function rowScore(row: any, clientName: string): number {
  const target = normalizeClientName(clientName);
  const names = [row.name, row.trading_name].map(normalizeClientName).filter(Boolean);
  let best = 0;
  for (const name of names) {
    if (!target || !name) continue;
    if (name === target) best = Math.max(best, 100);
    if (name.includes(target) || target.includes(name)) best = Math.max(best, 80);
    const targetTokens = tokenSet(target);
    const nameTokens = tokenSet(name);
    const common = [...targetTokens].filter(t => nameTokens.has(t)).length;
    if (common > 0) {
      const coverage = common / Math.max(1, targetTokens.size);
      best = Math.max(best, Math.round(coverage * 70));
    }
  }
  return best;
}

async function supabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const envUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "");
  const url = envUrl.includes(TMSEG_SUPABASE_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const keyCandidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_ANON_KEY,
  ];
  const key = keyCandidates
    .map(key => String(key || "").trim())
    .find(key => key === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(key) === TMSEG_SUPABASE_REF) || DEFAULT_SUPABASE_ANON_KEY;
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
  const envMod = await import("../server/whatsapp/zapiMobileEnv.js");
  const envCreds = envMod.getZapiMobileEnvCreds();
  const explicitEnv = envMod.hasExplicitZapiWebEnv() || envMod.hasExplicitZapiMobileEnv();

  const { data } = await sb
    .from("whatsapp_instances")
    .select("zapi_instance_id,zapi_token,zapi_client_token,official_ddi,official_phone,provider,is_default,enabled,instance_type")
    .eq("is_default", true)
    .eq("enabled", true)
    .maybeSingle();

  const instanceId = explicitEnv && envCreds
    ? envCreds.instanceId
    : String(data?.zapi_instance_id || envCreds?.instanceId || "");
  const token = explicitEnv && envCreds
    ? envCreds.token
    : String(data?.zapi_token || envCreds?.token || "");
  if (!instanceId || !token) return null;

  const ddi = digitsOnly(data?.official_ddi || process.env.ZAPI_OFFICIAL_DDI || "55") || "55";
  const local = digitsOnly(data?.official_phone || process.env.ZAPI_OFFICIAL_PHONE || process.env.META_WHATSAPP_DISPLAY_PHONE || "11926839456");
  const clientToken = String(envCreds?.clientToken || data?.zapi_client_token || "");

  return {
    instance: instanceId,
    token,
    clientToken,
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

async function findClientGroup(sb: any, clientName: string): Promise<{ name: string; groupId: string; matchScore: number } | null> {
  const select = "name,trading_name,whatsapp_group_id";
  let { data } = await sb.from("clients").select(select).eq("name", clientName).limit(1);
  if (!data || data.length === 0) {
    const byTrading = await sb.from("clients").select(select).eq("trading_name", clientName).limit(1);
    data = byTrading.data || [];
  }
  if (data && data.length > 0) {
    const row = data[0];
    return {
      name: String(row.name || clientName),
      groupId: String(row.whatsapp_group_id || "").trim(),
      matchScore: 100,
    };
  }

  const target = normalizeClientName(clientName);
  const firstToken = target.split(" ")[0] || clientName;
  const candidates = await sb
    .from("clients")
    .select(select)
    .or(`name.ilike.*${firstToken}*,trading_name.ilike.*${firstToken}*`)
    .limit(25);
  data = candidates.data || [];

  if (!data || data.length === 0) {
    const all = await sb.from("clients").select(select).limit(500);
    data = all.data || [];
  }

  const ranked = (data || [])
    .map((row: any) => ({ row, score: rowScore(row, clientName) }))
    .filter((x: any) => x.score >= 60)
    .sort((a: any, b: any) => {
      const ag = a.row.whatsapp_group_id ? 1 : 0;
      const bg = b.row.whatsapp_group_id ? 1 : 0;
      return bg - ag || b.score - a.score;
    });

  const row = ranked[0]?.row;
  if (!row) return null;
  return {
    name: String(row.name || clientName),
    groupId: String(row.whatsapp_group_id || "").trim(),
    matchScore: ranked[0]?.score || rowScore(row, clientName),
  };
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
    const dryRun = body.dryRun === true;

    if (!clientName || !message) {
      res.status(400).json({ error: "clientName e message são obrigatórios" });
      return;
    }
    if (requireImage && !imagePayload) {
      res.status(400).json({ error: "Foto obrigatória ausente — envio ao grupo não foi realizado sem imagem." });
      return;
    }

    const sb = await supabase();
    const client = await findClientGroup(sb, clientName);
    if (!client) {
      res.status(200).json({ skipped: true, reason: "cliente não encontrado no cadastro" });
      return;
    }
    if (!client.groupId) {
      res.status(200).json({ skipped: true, reason: "cliente sem grupo de WhatsApp configurado", clientName: client.name, matchScore: client.matchScore });
      return;
    }
    if (!/-group$|@g\.us$/i.test(client.groupId)) {
      res.status(400).json({ error: "O destino configurado no cadastro do cliente não é um grupo de WhatsApp válido." });
      return;
    }
    if (dryRun) {
      res.status(200).json({ ok: true, dryRun: true, clientName: client.name, hasGroup: true, matchScore: client.matchScore });
      return;
    }

    const creds = await getDefaultZapiCreds(sb);
    if (!creds) {
      res.status(503).json({ error: "WhatsApp não configurado no banco" });
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

