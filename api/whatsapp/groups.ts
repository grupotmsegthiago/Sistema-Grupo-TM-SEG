// Handler dedicado Vercel para listar os grupos de WhatsApp da instância
// oficial (Z-API). Na Vercel NÃO há catch-all Express, então a rota
// /api/whatsapp/groups (usada pelo seletor de grupo no cadastro do cliente)
// precisa de um handler próprio — sem ele, a Vercel cai no rewrite
// "/(.*) -> /index.html" e devolve HTML, causando o erro
// "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" no frontend.
//
// A lógica de paginação replica o comportamento de server/routes.ts para que
// grupos novos não "sumam" do seletor (a Z-API pagina a lista de grupos).

const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_SUPABASE_REF = "ajhmmjuewdsukecaimik";

type ZapiCreds = {
  instance: string;
  token: string;
  clientToken: string;
};

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
    .map(k => String(k || "").trim())
    .find(k => k === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(k) === TMSEG_SUPABASE_REF) || DEFAULT_SUPABASE_ANON_KEY;
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
    .select("zapi_instance_id,zapi_token,zapi_client_token,is_default,enabled")
    .eq("is_default", true)
    .eq("enabled", true)
    .maybeSingle();

  if (data?.zapi_instance_id && data?.zapi_token) {
    return {
      instance: String(data.zapi_instance_id),
      token: String(data.zapi_token),
      clientToken: String(data.zapi_client_token || ""),
    };
  }

  const instance = String(process.env.ZAPI_INSTANCE_ID || "").trim();
  const token = String(process.env.ZAPI_TOKEN || "").trim();
  if (!instance || !token) return null;
  return {
    instance,
    token,
    clientToken: String(process.env.ZAPI_CLIENT_TOKEN || "").trim(),
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  try {
    const sb = await supabase();
    const creds = await getDefaultZapiCreds(sb);
    if (!creds) {
      res.status(503).json({ error: "Z-API não configurada" });
      return;
    }

    const base = zapiBase(creds);
    const headers = zapiHeaders(creds);

    // A Z-API PAGINA a lista de grupos — buscar só a 1ª página faz grupos
    // novos "sumirem" do seletor. Varre todas as páginas e devolve a lista
    // completa (deduplicada por id/phone).
    const PAGE_SIZE = 100;
    const MAX_PAGES = 20; // trava de segurança (2000 grupos)
    const all: any[] = [];
    const seen = new Set<string>();

    const fetchPage = async (url: string) => {
      const r = await fetch(url, { method: "GET", headers });
      const text = await r.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return { r, data };
    };
    const collect = (data: any): number => {
      const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.groups) ? data.groups : []);
      let added = 0;
      for (const g of list) {
        const key = String(g?.id || g?.phone || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        all.push(g);
        added++;
      }
      return list.length ? added : -1; // -1 = página vazia
    };

    for (let page = 1; page <= MAX_PAGES; page++) {
      let { r, data } = await fetchPage(`${base}/groups?page=${page}&pageSize=${PAGE_SIZE}`);
      if (!r.ok && page === 1 && r.status >= 400 && r.status < 500 && !/connected/i.test(String(data?.error || ""))) {
        ({ r, data } = await fetchPage(`${base}/groups`));
        if (r.ok) { collect(data); break; }
      }
      if (!r.ok) {
        if (page === 1) {
          const zapiMsg = String(data?.error || "");
          const friendly = /connected/i.test(zapiMsg)
            ? "WhatsApp da Central está DESCONECTADO — reconecte a instância (QR Code no painel Z-API) e tente novamente"
            : "Falha Z-API";
          res.status(r.status).json({ error: friendly, detail: data });
          return;
        }
        break;
      }
      const added = collect(data);
      // Para se a página veio vazia, incompleta, ou sem NENHUM grupo novo
      // (Z-API ignorando a paginação e repetindo a mesma lista).
      if (added <= 0 || (added >= 0 && (Array.isArray(data) ? data.length : (data?.groups?.length || 0)) < PAGE_SIZE)) break;
    }

    res.status(200).json(all);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}
