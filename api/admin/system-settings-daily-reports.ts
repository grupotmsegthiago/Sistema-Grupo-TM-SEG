/**
 * GET /api/admin/system-settings/daily-reports — leve (sem Express).
 */
import { hasRole, readBearer, resolveLitePrincipal, supabaseLite } from "../_lib/tmsegAuth";

const KEY = "daily_reports";

const DEFAULTS = {
  legal: { emails: "thiago@grupotmseg.com.br", hour: 8, minute: 0 },
  pending: { emails: "operacional@grupotmseg.com.br", hour: 8, minute: 30 },
  approval: { emails: "financeiro@grupotmseg.com.br", hour: 9, minute: 0 },
  missingInfo: { emails: "operacional@grupotmseg.com.br", hour: 17, minute: 0 },
  stuckNf: { emails: "financeiro@grupotmseg.com.br", hour: 10, minute: 0 },
};

function sanitizeSchedule(raw: any, fallback: { emails: string; hour: number; minute: number }) {
  const emails = String(raw?.emails ?? fallback.emails).trim() || fallback.emails;
  const hour = Math.min(23, Math.max(0, Number(raw?.hour ?? fallback.hour) || fallback.hour));
  const minute = Math.min(59, Math.max(0, Number(raw?.minute ?? fallback.minute) || fallback.minute));
  return { emails, hour, minute };
}

function sanitizeSettings(raw: any) {
  return {
    legal: sanitizeSchedule(raw?.legal, DEFAULTS.legal),
    pending: sanitizeSchedule(raw?.pending, DEFAULTS.pending),
    approval: sanitizeSchedule(raw?.approval, DEFAULTS.approval),
    missingInfo: sanitizeSchedule(raw?.missingInfo, DEFAULTS.missingInfo),
    stuckNf: sanitizeSchedule(raw?.stuckNf, DEFAULTS.stuckNf),
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "Não autorizado" });
    return;
  }
  const principal = await resolveLitePrincipal(token);
  if (!principal || !hasRole(principal, "diretoria", "administrador")) {
    res.status(403).json({ ok: false, error: "Sem permissão para acessar esta tela." });
    return;
  }

  try {
    const sb = supabaseLite();
    const { data: row } = await sb.from("system_settings").select("value,updated_by,updated_at").eq("key", KEY).maybeSingle();
    let value = DEFAULTS;
    if (row?.value) {
      try {
        value = sanitizeSettings(typeof row.value === "string" ? JSON.parse(row.value) : row.value);
      } catch {
        value = DEFAULTS;
      }
    }
    res.status(200).json({
      ok: true,
      settings: value,
      defaults: DEFAULTS,
      updatedBy: row?.updated_by || null,
      updatedAt: row?.updated_at || null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message || "Falha ao carregar configurações" });
  }
}

export const config = { maxDuration: 15 };
