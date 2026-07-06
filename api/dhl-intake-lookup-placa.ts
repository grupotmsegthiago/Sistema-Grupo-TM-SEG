const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_SUPABASE_REF = "ajhmmjuewdsukecaimik";

const placaLookupHits = new Map<string, number[]>();
const PLACA_LOOKUP_WINDOW_MS = 60_000;
const PLACA_LOOKUP_MAX_PER_KEY = 12;

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
  const keys = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_ANON_KEY,
  ];
  const key = keys.map((k) => String(k || "").trim()).find((k) => k === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(k) === TMSEG_SUPABASE_REF) || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

function hitRateLimit(key: string): boolean {
  const now = Date.now();
  const arr = (placaLookupHits.get(key) || []).filter((t) => now - t < PLACA_LOOKUP_WINDOW_MS);
  arr.push(now);
  placaLookupHits.set(key, arr);
  if (placaLookupHits.size > 500) {
    for (const [k, v] of placaLookupHits) {
      if (!v.length || now - v[v.length - 1] > PLACA_LOOKUP_WINDOW_MS) placaLookupHits.delete(k);
    }
  }
  return arr.length > PLACA_LOOKUP_MAX_PER_KEY;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const token = String(req.query?.token || req.params?.token || "").trim();
    const placaRaw = String(req.query?.placa || req.params?.placa || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!token) {
      res.status(400).json({ error: "token é obrigatório" });
      return;
    }
    if (placaRaw.length !== 7) {
      res.status(400).json({ error: "Placa deve conter 7 caracteres." });
      return;
    }

    const ip = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (hitRateLimit(`tok:${token}`) || hitRateLimit(`ip:${ip}`)) {
      res.status(429).json({ error: "Muitas consultas em sequência — aguarde alguns segundos." });
      return;
    }

    const sb = await supabase();
    const { data: intake } = await sb
      .from("dhl_supplier_intakes")
      .select("status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!intake) {
      res.status(404).json({ error: "Link inválido" });
      return;
    }
    if (intake.status === "cancelado") {
      res.status(410).json({ error: "Link cancelado" });
      return;
    }
    if (intake.status === "preenchido") {
      res.status(410).json({ error: "Intake já finalizado." });
      return;
    }
    if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
      res.status(410).json({ error: "Link expirado" });
      return;
    }

    const wdToken = String(process.env.VITE_WDAPI_TOKEN || process.env.WDAPI_TOKEN || "").trim();
    if (!wdToken) {
      res.status(503).json({ error: "Consulta de placa indisponível no momento." });
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const lookupUrl = `https://wdapi2.com.br/consulta/${encodeURIComponent(placaRaw)}/${encodeURIComponent(wdToken)}`;
      const placaHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
      };
      let r = await fetch(lookupUrl, { signal: ctrl.signal as any, headers: placaHeaders });
      if (r.status === 403) {
        await new Promise((rs) => setTimeout(rs, 400));
        r = await fetch(lookupUrl, { signal: ctrl.signal as any, headers: placaHeaders });
      }
      clearTimeout(timer);

      if (!r.ok) {
        if (r.status === 404) {
          res.status(404).json({ error: "Placa não encontrada." });
          return;
        }
        if (r.status === 403) {
          res.status(502).json({ error: "Consulta bloqueada (Cloudflare). Preencha manualmente." });
          return;
        }
        res.status(502).json({ error: "Falha ao consultar placa." });
        return;
      }

      const rawBody = await r.text();
      let j: any;
      try {
        j = JSON.parse(rawBody);
      } catch {
        res.status(502).json({ error: "Falha ao consultar placa." });
        return;
      }

      const marca = String(j?.MARCA || j?.marca || "").trim();
      const modelo = String(j?.MODELO || j?.modelo || "").trim();
      const ano = String(j?.ano || j?.anoModelo || j?.ANO || j?.anoFabricacao || "").trim();
      const cor = String(j?.cor || j?.COR || "").trim();
      res.status(200).json({ ok: true, marca, modelo, ano, cor });
    } catch (fetchErr: any) {
      clearTimeout(timer);
      if (fetchErr?.name === "AbortError") {
        res.status(504).json({ error: "Tempo esgotado ao consultar placa." });
        return;
      }
      res.status(502).json({ error: "Falha de conexão ao consultar placa." });
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}
