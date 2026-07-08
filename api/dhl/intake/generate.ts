const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_SUPABASE_REF = "ajhmmjuewdsukecaimik";

function parseBody(body: unknown): any {
  if (typeof body !== "string") return body || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
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

function isDhlMission(clientName: unknown): boolean {
  const n = String(clientName || "").toUpperCase();
  return n.includes("DHL SUPPLY CHAIN") || n.includes("DHL LOGISTICS") || n === "DHL";
}

const CANONICAL_PUBLIC_ORIGIN = "https://sistema.grupotmseg.com.br";
const LEGACY_BAD_HOST = "app.grupotmseg.com.br";

function normalizePublicOrigin(url: string): string {
  const trimmed = String(url || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (u.hostname === LEGACY_BAD_HOST) {
      u.hostname = "sistema.grupotmseg.com.br";
    }
    return u.origin;
  } catch {
    return trimmed.replace(LEGACY_BAD_HOST, "sistema.grupotmseg.com.br");
  }
}

function resolvePublicAppUrl(req?: { headers?: Record<string, unknown> } | null): string {
  const fromEnv = normalizePublicOrigin(String(process.env.APP_PUBLIC_URL || process.env.SYSTEM_URL || ""));
  if (fromEnv) return fromEnv;

  const replitDomain = String(process.env.REPLIT_DOMAINS || "").split(",")[0].trim();
  if (replitDomain) return normalizePublicOrigin(`https://${replitDomain}`);

  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(",")[0].trim();
  if (host && !host.includes("localhost")) {
    const proto = String(req?.headers?.["x-forwarded-proto"] || "https");
    return normalizePublicOrigin(`${proto}://${host}`);
  }

  return CANONICAL_PUBLIC_ORIGIN;
}

function appUrl(req: any): string {
  return resolvePublicAppUrl(req);
}

function buildWhatsappText(opts: { providerName: string; osNumber: string; origin: string; destination: string; scheduledAt: string; link: string; isDhl: boolean }) {
  return `${opts.isDhl ? "*DHL — Cadastro de Escolta*" : "*Cadastro operacional de escolta*"}\n\nFornecedor: ${opts.providerName}\nOS: ${opts.osNumber}\nOrigem: ${opts.origin}\nDestino: ${opts.destination}\nAgendamento: ${opts.scheduledAt}\n\nPreencha os dados pelo link:\n${opts.link}`;
}

async function findProvider(sb: any, providerName: string) {
  const cols = "id,name,trading_name,email,os_email,dhl_solicitation_email,phone,dhl_channel_preference";
  for (const col of ["name", "trading_name"]) {
    const { data } = await sb.from("providers").select(cols).eq(col, providerName).limit(1).maybeSingle();
    if (data) return data;
  }
  for (const col of ["name", "trading_name"]) {
    const { data } = await sb.from("providers").select(cols).ilike(col, providerName).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
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
    const missionId = String(body.missionId || "").trim();
    if (!missionId) {
      res.status(400).json({ error: "missionId é obrigatório" });
      return;
    }

    const sb = await supabase();
    const { data: mission, error: mErr } = await sb.from("missions").select("*").eq("id", missionId).maybeSingle();
    if (mErr || !mission) {
      res.status(404).json({ error: "Missão não encontrada" });
      return;
    }
    const isDhl = isDhlMission(mission.client);
    if (!mission.client) {
      res.status(400).json({ error: "Selecione um cliente na OS antes de gerar o link." });
      return;
    }
    if (isDhl && !String(mission.dhl_se_number || "").trim()) {
      res.status(400).json({ error: "Preencha o número da S.E. DHL antes de gerar o link." });
      return;
    }
    if (!mission.provider) {
      res.status(400).json({ error: "Selecione um fornecedor na OS antes de gerar o link." });
      return;
    }

    const provider = await findProvider(sb, String(mission.provider).trim());
    if (!provider) {
      res.status(404).json({ error: `Fornecedor "${mission.provider}" não localizado no cadastro.`, providerName: mission.provider });
      return;
    }

    const { data: existing } = await sb
      .from("dhl_supplier_intakes")
      .select("*")
      .eq("mission_id", mission.id)
      .eq("provider_id", String(provider.id))
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const notExpired = existing && (!existing.expires_at || new Date(existing.expires_at) > new Date());
    let intake = existing;
    let token = existing?.token || "";

    if (!existing || !notExpired) {
      token = crypto.randomUUID().replace(/-/g, "");
      const { data: inserted, error: iErr } = await sb.from("dhl_supplier_intakes").insert([{
        token,
        mission_id: mission.id,
        provider_id: provider.id != null ? String(provider.id) : null,
        provider_name: provider.trading_name || provider.name,
        status: "pendente",
        sent_to_email: provider.dhl_solicitation_email || provider.os_email || provider.email || null,
        sent_to_phone: provider.phone || null,
      }]).select().single();
      if (iErr) {
        res.status(500).json({ error: "Erro ao registrar intake: " + (iErr.message || "falha desconhecida") });
        return;
      }
      intake = inserted;
    }

    const channelRaw = String(body.channel || 'both').toLowerCase();
    const channel: 'email' | 'whatsapp' | 'both' =
      channelRaw === 'email' || channelRaw === 'whatsapp' ? channelRaw : 'both';
    const wantsEmail = channel === 'email' || channel === 'both';

    const providerEmail = String(provider.dhl_solicitation_email || provider.os_email || provider.email || '').trim();
    const scheduledAt = mission.start_time ? new Date(mission.start_time).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
    const whatsappText = buildWhatsappText({
      providerName: provider.trading_name || provider.name,
      osNumber: mission.id,
      origin: mission.origin || "—",
      destination: mission.destination || "—",
      scheduledAt,
      link: `${appUrl(req)}/fornecedor/dhl?token=${token}`,
      isDhl,
    });

    let emailSent = false;
    let emailError: string | null = null;
    let emailSkipped = !wantsEmail;
    if (wantsEmail) {
      if (!providerEmail) {
        emailError = 'Fornecedor sem e-mail cadastrado';
      } else {
        try {
          const { sendDhlSupplierIntakeEmail } = await import('../../../lib/email/reexport.js');
          await sendDhlSupplierIntakeEmail({
            to: providerEmail,
            providerName: provider.trading_name || provider.name,
            osNumber: mission.id,
            seNumber: mission.dhl_se_number || '—',
            origin: mission.origin || '—',
            destination: mission.destination || '—',
            scheduledAt,
            link: `${appUrl(req)}/fornecedor/dhl?token=${token}`,
            isDhl,
          });
          emailSent = true;
        } catch (e: any) {
          emailError = e?.message || 'falha no envio do e-mail';
          console.error('[DHL Intake generate] erro email:', emailError);
        }
      }
    }

    const link = `${appUrl(req)}/fornecedor/dhl?token=${token}`;

    res.status(200).json({
      ok: true,
      token,
      url: link,
      whatsappText,
      emailSent,
      emailError,
      emailSkipped,
      whatsappSent: false,
      whatsappError: null,
      whatsappSkipped: channel !== 'whatsapp' && channel !== 'both',
      channel,
      providerEmail: providerEmail || null,
      providerPhone: provider.phone || null,
      reusedExistingToken: !!(existing && notExpired),
      intakeId: intake?.id || null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}

