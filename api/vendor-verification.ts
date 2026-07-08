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
  const key = keys.map((k) => String(k || "").trim()).find((k) => k === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(k) === TMSEG_SUPABASE_REF) || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

function parseBody(body: unknown): Record<string, any> {
  if (typeof body !== "string") return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function missionIdOf(req: any): string {
  return String(req.query?.missionId || req.params?.missionId || "").trim();
}

async function handleGet(req: any, res: any, missionId: string) {
  try {
    const sb = await supabase();
    const { data: mission, error } = await sb
      .from("missions")
      .select("vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at")
      .eq("id", missionId)
      .single();

    if (!error && mission) {
      res.status(200).json({ ok: true, data: mission });
      return;
    }

    const { data: logs } = await sb
      .from("system_logs")
      .select("details")
      .eq("action_type", "VENDOR_VERIFICATION")
      .eq("entity_id", missionId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (logs && logs.length > 0) {
      const details = typeof logs[0].details === "string" ? JSON.parse(logs[0].details) : logs[0].details;
      res.status(200).json({ ok: true, data: details, source: "system_logs" });
      return;
    }

    res.status(200).json({ ok: true, data: null });
  } catch (e: any) {
    console.error("[vendor-verification] GET:", e?.message);
    res.status(200).json({ ok: true, data: null });
  }
}

async function handlePost(req: any, res: any, missionId: string) {
  try {
    const body = parseBody(req.body);
    const {
      vendor_os_number,
      invoice_number,
      release_date,
      payment_date,
      verified_by,
      verified_at,
      cost_value,
      toll_value_provider,
    } = body;

    const sb = await supabase();
    const corePayload: Record<string, any> = {};
    if (vendor_os_number !== undefined) corePayload.vendor_os_number = vendor_os_number;
    if (invoice_number !== undefined) corePayload.invoice_number = invoice_number;
    if (release_date !== undefined) corePayload.release_date = release_date;
    if (payment_date !== undefined) corePayload.payment_date = payment_date;
    if (cost_value !== undefined) corePayload.cost_value = cost_value;
    if (toll_value_provider !== undefined) corePayload.toll_value_provider = toll_value_provider;

    if (Object.keys(corePayload).length > 0) {
      const { error: coreErr } = await sb.from("missions").update(corePayload).eq("id", missionId);
      if (coreErr && !(coreErr.message.includes("column") && coreErr.message.includes("does not exist"))) {
        throw coreErr;
      }
    }

    if (verified_by !== undefined || verified_at !== undefined) {
      const verPayload: Record<string, any> = {};
      if (verified_by !== undefined) verPayload.verified_by = verified_by;
      if (verified_at !== undefined) verPayload.verified_at = verified_at;
      const { error: verErr } = await sb.from("missions").update(verPayload).eq("id", missionId);
      if (verErr && verErr.message.includes("column") && verErr.message.includes("does not exist")) {
        console.log("[vendor-verification] verified_by/verified_at columns missing");
      } else if (verErr) {
        throw verErr;
      }
    }

    await sb.from("system_logs").insert([{
      user_name: verified_by || "Sistema",
      action_type: "VENDOR_VERIFICATION",
      entity: "Mission",
      entity_id: missionId,
      details: JSON.stringify({ ...corePayload, verified_by, verified_at }),
    }]);

    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[vendor-verification] POST:", e?.message);
    res.status(500).json({ ok: false, error: e?.message || "Erro interno" });
  }
}

export default async function handler(req: any, res: any) {
  if (!authToken(req)) {
    res.status(401).json({ ok: false, error: "Não autorizado" });
    return;
  }

  const missionId = missionIdOf(req);
  if (!missionId) {
    res.status(400).json({ ok: false, error: "missionId é obrigatório" });
    return;
  }

  if (req.method === "GET") {
    await handleGet(req, res, missionId);
    return;
  }
  if (req.method === "POST") {
    await handlePost(req, res, missionId);
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" });
}
