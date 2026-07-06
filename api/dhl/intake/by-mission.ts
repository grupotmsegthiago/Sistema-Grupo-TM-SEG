const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_SUPABASE_REF = "ajhmmjuewdsukecaimik";

function authToken(req: any): string {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers?.["x-auth-token"] || "");
}

function decodeSupabaseRef(key: string): string | null {
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.ref || null;
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
  const key = keys.map(k => String(k || "").trim()).find(k => k === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(k) === TMSEG_SUPABASE_REF) || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key);
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

  const missionId = String(req.query?.missionId || req.query?.id || "").trim();
  if (!missionId) {
    res.status(400).json({ error: "missionId é obrigatório" });
    return;
  }

  try {
    const sb = await supabase();
    const { data, error } = await sb
      .from("dhl_supplier_intakes")
      .select("*")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const now = new Date();
    const intakes = (data || []).map((it: any) => {
      const expired = it.expires_at ? new Date(it.expires_at) < now : false;
      return {
        ...it,
        effective_status: it.status === "cancelado" ? "cancelado" : expired ? "expirado" : it.status,
      };
    });

    res.status(200).json({
      ok: true,
      intakes,
      reminderPolicy: {
        providerHours: 24,
        operationalHours: 48,
        maxProviderReminders: 2,
        cycleHours: 24,
      },
      reminderConfig: {
        maxCount: 2,
        cycleHours: 24,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}

