const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_SUPABASE_REF = "ajhmmjuewdsukecaimik";

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

function isDhlMission(clientName: string | null | undefined): boolean {
  if (!clientName) return false;
  const n = String(clientName).toUpperCase();
  return n.includes("DHL SUPPLY CHAIN") || n.includes("DHL LOGISTICS");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const token = String(req.query?.token || req.params?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "token é obrigatório" });
    return;
  }

  try {
    const sb = await supabase();
    const { data: intake } = await sb.from("dhl_supplier_intakes").select("*").eq("token", token).maybeSingle();
    if (!intake) {
      res.status(404).json({ error: "Link inválido ou expirado" });
      return;
    }
    if (intake.status === "cancelado") {
      res.status(410).json({ error: "Link cancelado — a OS foi excluída ou cancelada. Solicite um novo link ao Operacional TM Seg." });
      return;
    }
    if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
      res.status(410).json({ error: "Link expirado" });
      return;
    }

    try {
      await sb.rpc("dhl_intake_register_open", { p_token: token });
    } catch (e: any) {
      console.error("[DHL Intake] erro ao registrar abertura do link:", e?.message);
    }

    const { data: mission } = await sb
      .from("missions")
      .select("id, client, provider, origin, destination, start_time, dhl_se_number, status")
      .eq("id", intake.mission_id)
      .maybeSingle();

    const { data: escoltistasProv } = await sb
      .from("provider_escoltistas")
      .select("*")
      .eq("provider_id", intake.provider_id)
      .order("nome", { ascending: true });

    let escoltistasFromAgents: any[] = [];
    const normalize = (s: string) => String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    const candidateNames = new Set<string>();
    const rawNames: string[] = [];
    if (intake.provider_name) {
      candidateNames.add(normalize(intake.provider_name));
      rawNames.push(String(intake.provider_name));
    }
    if (intake.provider_id) {
      try {
        const { data: prov } = await sb.from("providers").select("name, trading_name").eq("id", intake.provider_id).maybeSingle();
        if (prov?.name) {
          candidateNames.add(normalize(prov.name));
          rawNames.push(String(prov.name));
        }
        if (prov?.trading_name) {
          candidateNames.add(normalize(prov.trading_name));
          rawNames.push(String(prov.trading_name));
        }
      } catch { /* ignore */ }
    }
    if (candidateNames.size > 0 && rawNames.length > 0) {
      const escapeIlike = (s: string) => String(s).replace(/[\\,()]/g, "\\$&");
      const orParts = rawNames.map((n) => `provider.ilike.${escapeIlike(n)}`).join(",");
      const { data: agentsData } = await sb
        .from("agents")
        .select("name, cpf, rg, cnh, cnh_validity, cnv, cnv_validity, phone, status, provider, orgao_emissor, cnh_categoria, rua, numero, complemento, bairro, cidade, uf, cep, admissao")
        .or(orParts)
        .neq("status", "Bloqueado / Ação Trabalhista")
        .order("name", { ascending: true })
        .limit(500);
      const matched = (agentsData || []).filter((a: any) => a.provider && candidateNames.has(normalize(a.provider)));
      escoltistasFromAgents = matched.map((a: any) => ({
        id: null,
        nome: a.name || "",
        cpf: a.cpf || "",
        rg: a.rg || "",
        orgao_emissor: a.orgao_emissor || "",
        cnh: a.cnh || "",
        cnh_categoria: a.cnh_categoria || "",
        cnh_vencimento: a.cnh_validity || "",
        cnv_numero: a.cnv || "",
        cnv_validade: a.cnv_validity || "",
        rua: a.rua || "",
        numero: a.numero || "",
        complemento: a.complemento || "",
        bairro: a.bairro || "",
        cidade: a.cidade || "",
        uf: a.uf || "",
        cep: a.cep || "",
        celular: a.phone || "",
        admissao: a.admissao || "",
      }));
    }

    const seenCpfs = new Set<string>();
    const escoltistas: any[] = [];
    for (const e of escoltistasProv || []) {
      const d = String(e.cpf || "").replace(/\D/g, "");
      if (d) seenCpfs.add(d);
      escoltistas.push(e);
    }
    for (const e of escoltistasFromAgents) {
      const d = String(e.cpf || "").replace(/\D/g, "");
      if (!d || seenCpfs.has(d)) continue;
      seenCpfs.add(d);
      escoltistas.push(e);
    }

    const { data: vehicles } = await sb
      .from("provider_intake_vehicles")
      .select("*")
      .eq("provider_id", intake.provider_id)
      .order("placa", { ascending: true });

    res.status(200).json({
      ok: true,
      intake: {
        token: intake.token,
        status: intake.status,
        submittedAt: intake.submitted_at,
        providerName: intake.provider_name,
      },
      mission: mission || null,
      isDhl: isDhlMission(mission?.client),
      escoltistas: escoltistas || [],
      vehicles: vehicles || [],
      progress: {
        agent1: !!intake.progress_agent1,
        agent2: !!intake.progress_agent2,
        vehicle: !!intake.progress_vehicle,
        mirror: !!intake.progress_mirror,
      },
      snapshots: {
        agent1: intake.agent1_snapshot || null,
        agent2: intake.agent2_snapshot || null,
        vehicle: intake.vehicle_snapshot || null,
        mirrorProofUrl: intake.mirror_proof_url || null,
        mirrorProofFilename: intake.mirror_proof_filename || null,
      },
    });
  } catch (e: any) {
    console.error("[DHL Intake] public-get exception:", e);
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}
