/**
 * POST /api/recalculate-open — serverless leve (não passa pelo Express/api/index).
 * Recalcula só OS abertas (~dezenas), com o mesmo motor calculateMissionFinancials.
 *
 * O motor financeiro vem de um bundle CJS gerado no build (build-server.mjs).
 * Import ESM direto de lib/financialUtils.ts quebrava na Vercel com
 * FUNCTION_INVOCATION_FAILED / ERR_MODULE_NOT_FOUND.
 */
import { createRequire } from "node:module";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin.js";
import { readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";

const require = createRequire(import.meta.url);

// Require ESTÁTICO — o file tracer da Vercel precisa ver o caminho literal.
const financialCore = require("./_recalculate-open-core.cjs") as {
  calculateMissionFinancials: (
    mission: unknown,
    clientTables: unknown[],
    providerTables: unknown[],
    clientMatch?: unknown,
  ) => {
    client: { serviceTotal: number };
    provider: { serviceTotal: number };
    tollValue?: number;
  } | null;
};
const { calculateMissionFinancials } = financialCore;

const OPEN_STATUSES = ["Pendente", "Solicitada", "Documentação", "Agendada", "Origem", "Em Viagem"];
const ALLOWED_ROLES = new Set(["diretoria", "administrador", "ceo", "financeiro", "admin"]);

type LiteReq = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

function r2(v: number) {
  return Math.round(v * 100) / 100;
}

function normalizeRole(role: string): string {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default async function handler(
  req: LiteReq,
  res: { status: (n: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void },
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  const principal = await resolveLitePrincipal(token, req);
  if (!principal) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  if (!ALLOWED_ROLES.has(normalizeRole(principal.role))) {
    res.status(403).json({ error: "Sem permissão para recalcular OS" });
    return;
  }

  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ error: "Supabase não configurado" });
    return;
  }

  try {
    const { data: missions, error: mErr } = await sb
      .from("missions")
      .select("*")
      .eq("billing_approved", false)
      .gt("revenue_value", 0)
      .in("status", OPEN_STATUSES)
      .limit(200);
    if (mErr) {
      res.status(502).json({ error: mErr.message });
      return;
    }

    const [{ data: clientTablesRaw }, { data: providerTablesRaw }, { data: clientsRaw }] = await Promise.all([
      sb.from("client_price_tables").select("*"),
      sb.from("provider_cost_tables").select("*"),
      sb.from("clients").select("*"),
    ]);

    const clientTables = (clientTablesRaw || []).map((t: any) => ({
      id: String(t.id),
      client: t.client,
      operation_type: t.operation_type,
      activation_fee: t.activation_fee || t.activation_price || 0,
      franchise_hours: t.franchise_hours || t.hour_franchise || 0,
      franchise_km: t.franchise_km || t.km_franchise || 0,
      price_per_extra_km: t.price_per_extra_km || t.extra_km_price || 0,
      price_per_extra_hour: t.price_per_extra_hour || t.extra_hour_price || 0,
    }));
    const providerTables = (providerTablesRaw || []).map((t: any) => ({
      id: String(t.id),
      provider: t.provider,
      operation_type: t.operation_type,
      activation_cost: t.activation_cost || t.activation_price || 0,
      franchise_hours: t.franchise_hours || t.hour_franchise || 0,
      franchise_km: t.franchise_km || t.km_franchise || 0,
      cost_per_extra_km: t.cost_per_extra_km || t.extra_km_price || 0,
      cost_per_extra_hour: t.cost_per_extra_hour || t.extra_hour_price || 0,
      cancellation_fee: t.cancellation_fee || 0,
    }));

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const details: unknown[] = [];
    const allMissions = missions || [];

    for (const m of allMissions) {
      try {
        if (m.revenue_edit_reason || m.cost_edit_reason || m.snapshot_approved_by || m.billing_verified_by) {
          skipped++;
          continue;
        }
        const clientMatch = (clientsRaw || []).find((c: any) => c.name === m.client || c.trading_name === m.client);
        const fd = calculateMissionFinancials(m, clientTables, providerTables, clientMatch);
        if (!fd || fd.client.serviceTotal <= 0) {
          skipped++;
          continue;
        }

        const calcRev = r2(fd.client.serviceTotal);
        const calcCost = r2(m.is_same_os ? 0 : fd.provider.serviceTotal);
        const savedRev = r2(m.revenue_value || 0);
        const savedCost = r2(m.cost_value || 0);
        const calcToll = r2(fd.tollValue || 0);
        const oldToll = r2(m.toll_value || 0);
        const revDiff = Math.abs(calcRev - savedRev);
        const costDiff = Math.abs(calcCost - savedCost);
        const tollDiff = Math.abs(calcToll - oldToll);

        if (revDiff > 1 || costDiff > 1 || tollDiff > 0.5) {
          const tollProv = m.is_same_os ? 0 : calcToll;
          const { error: uErr } = await sb.from("missions").update({
            revenue_value: calcRev,
            cost_value: calcCost,
            toll_value: calcToll,
            toll_value_provider: r2(tollProv),
            last_update: new Date().toISOString(),
          }).eq("id", m.id);
          if (uErr) {
            errors++;
            continue;
          }
          updated++;
          details.push({
            id: m.id,
            client: m.client,
            oldRev: savedRev,
            newRev: calcRev,
            oldCost: savedCost,
            newCost: calcCost,
          });
        } else {
          skipped++;
        }
      } catch {
        errors++;
      }
    }

    await sb.from("system_logs").insert([{
      user_name: principal.name || "Sistema",
      action_type: "BULK_RECALCULATE",
      entity: "Mission",
      entity_id: "OPEN",
      details: JSON.stringify({
        scope: "open",
        source: "api/recalculate-open",
        total: allMissions.length,
        updated,
        skipped,
        errors,
        timestamp: new Date().toISOString(),
      }),
    }]);

    res.status(200).json({
      success: true,
      scope: "open",
      total: allMissions.length,
      updated,
      skipped,
      errors,
      partial: false,
      details: details.slice(0, 50),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 60 };
