const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";

type RangeKey = "today" | "7d" | "15d";

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

function rangeStart(range: RangeKey): Date {
  const now = new Date();
  if (range === "today") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return new Date(`${parts}T00:00:00-03:00`);
  }
  return new Date(now.getTime() - (range === "7d" ? 7 : 15) * 24 * 60 * 60 * 1000);
}

function riskLevel(score: number) {
  if (score >= 80) return { level: "critical", label: "Crítico" };
  if (score >= 50) return { level: "high", label: "Alto" };
  if (score >= 25) return { level: "attention", label: "Atenção" };
  return { level: "normal", label: "Normal" };
}

function computeRisk(sessionRows: any[], sentRows: any[]) {
  let score = 0;
  const factors: string[] = [];
  const reconnections = sessionRows.filter(r => r.event_type === "reconnected").length;
  const restarts = sessionRows.filter(r => r.event_type === "restart_attempted").length;
  const failures = sentRows.filter(r => !r.success && !r.skipped).length;
  const maxDepth = sentRows.reduce((m, r) => Math.max(m, Number(r.queue_depth || 0)), 0);
  const highWaits = sentRows.filter(r => Number(r.queue_wait_ms || 0) >= 60_000).length;

  if (reconnections) { score += reconnections * 20; factors.push(`${reconnections} reconexão(ões)`); }
  if (restarts) { score += restarts * 15; factors.push(`${restarts} restart(s)`); }
  if (failures) { score += failures * 10; factors.push(`${failures} falha(s) de envio`); }
  if (maxDepth >= 20) { score += 30; factors.push(`fila máxima ${maxDepth}`); }
  else if (maxDepth >= 10) { score += 15; factors.push(`fila máxima ${maxDepth}`); }
  if (highWaits) { score += Math.min(20, highWaits * 4); factors.push(`${highWaits} envio(s) com espera alta`); }

  const rl = riskLevel(score);
  return { score, ...rl, factors };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ ok: false, error: "Não autorizado" });
    return;
  }

  const range = ["7d", "15d"].includes(String(req.query?.range)) ? String(req.query.range) as RangeKey : "today";
  const startIso = rangeStart(range).toISOString();
  const sb = await supabase();

  try {
    const [outbound, sessions] = await Promise.all([
      sb.from("whatsapp_outbound_log").select("*").gte("created_at", startIso).order("created_at", { ascending: false }).limit(1000),
      sb.from("whatsapp_session_events").select("*").gte("created_at", startIso).order("created_at", { ascending: false }).limit(1000),
    ]);

    if (outbound.error) {
      const msg = String(outbound.error.message || outbound.error);
      if (msg.includes("whatsapp_outbound_log") || msg.includes("schema cache")) {
        res.status(200).json({
          ok: false,
          needsMigration: true,
          error: "Tabelas de telemetria WhatsApp ainda não criadas no Supabase.",
          observationNote: "Rode migrations/2026_07_05_whatsapp_telemetry.sql no SQL Editor do Supabase (não bloqueia reconexão do bot).",
        });
        return;
      }
      throw outbound.error;
    }
    if (sessions.error) {
      const msg = String(sessions.error.message || sessions.error);
      if (msg.includes("whatsapp_session_events") || msg.includes("schema cache")) {
        res.status(200).json({
          ok: false,
          needsMigration: true,
          error: "Tabelas de telemetria WhatsApp ainda não criadas no Supabase.",
          observationNote: "Rode migrations/2026_07_05_whatsapp_telemetry.sql no SQL Editor do Supabase.",
        });
        return;
      }
      throw sessions.error;
    }

    const sentRows = outbound.data || [];
    const sessionRows = sessions.data || [];
    const success = sentRows.filter(r => r.success).length;
    const skipped = sentRows.filter(r => r.skipped).length;
    const failed = sentRows.filter(r => !r.success && !r.skipped).length;
    const groups = new Set(sentRows.map(r => r.group_id).filter(Boolean)).size;
    const risk = computeRisk(sessionRows, sentRows);

    res.status(200).json({
      ok: true,
      range,
      summary: {
        total: sentRows.length,
        success,
        failed,
        skipped,
        groups,
        sessions: sessionRows.length,
        maxQueueDepth: sentRows.reduce((m, r) => Math.max(m, Number(r.queue_depth || 0)), 0),
      },
      risk,
      recent: sentRows.slice(0, 20),
      sessionEvents: sessionRows.slice(0, 20),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Erro ao carregar telemetria WhatsApp" });
  }
}

