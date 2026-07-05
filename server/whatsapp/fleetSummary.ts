// ── Resumo operacional por viatura cadastrada ────────────────────────────────

import { createSupabaseAdminClient } from "../supabaseConfig";

const TERMINAL_STATUSES = new Set(["Concluída", "Cancelada", "Recusada"]);

type MissionRow = {
  id: string;
  status: string;
  current_location: string | null;
  origin: string | null;
  destination: string | null;
  driver_name: string | null;
  agent1: string | null;
  agent2: string | null;
  start_time: string | null;
  end_time: string | null;
  last_update: string | null;
  created_at: string | null;
  vehicle_id: string | null;
};

type VehicleRow = {
  id: string;
  plate: string;
  model: string | null;
  status: string | null;
};

function fmtNowBR(): string {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function fmtDurationSince(iso: string | null): string {
  if (!iso) return "";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m > 0 ? `${m}min` : ""}`.trim();
  return `${m}min`;
}

function statusLabel(m: MissionRow): string {
  const loc = String(m.current_location || "").trim();
  if (loc) return loc;
  return String(m.status || "—");
}

function teamLine(m: MissionRow): string {
  const parts = [m.agent1, m.agent2].map(s => String(s || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" e ") : "—";
}

function routeLine(m: MissionRow): string {
  const o = String(m.origin || "—").trim();
  const d = String(m.destination || "—").trim();
  return `${o} → ${d}`;
}

function missionSortTs(m: MissionRow): number {
  const raw = m.end_time || m.last_update || m.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function isActive(m: MissionRow): boolean {
  return !TERMINAL_STATUSES.has(String(m.status || ""));
}

function formatMissionBlock(m: MissionRow, plate: string, inMission: boolean): string[] {
  const lines: string[] = [];
  const st = statusLabel(m);
  if (inMission) {
    lines.push(`OS ${m.id} · ${st}`);
  } else {
    lines.push(`Última OS ${m.id} · ${m.status || "—"}`);
  }
  lines.push(`📍 ${routeLine(m)}`);
  lines.push(`🚛 ${plate}${m.driver_name ? ` · ${m.driver_name}` : ""}`);
  const team = teamLine(m);
  if (team !== "—") lines.push(`🛡️ ${team}`);
  if (inMission && m.start_time) {
    const dur = fmtDurationSince(m.start_time);
    lines.push(`🕒 Início ${fmtDateShort(m.start_time)}${dur ? ` · em rota há ${dur}` : ""}`);
  } else if (m.end_time) {
    lines.push(`🕒 Encerrada ${fmtDateShort(m.end_time)}`);
  }
  return lines;
}

export type FleetSummaryResult = {
  text: string;
  vehicleCount: number;
  inMissionCount: number;
  freeCount: number;
};

export async function buildFleetOperationalSummary(): Promise<FleetSummaryResult> {
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error("Supabase não configurado");

  const { data: vehicles, error: vErr } = await sb
    .from("vehicles")
    .select("id, plate, model, status")
    .neq("status", "Inativo")
    .order("plate");

  if (vErr) throw new Error(vErr.message);

  const vehicleList = (vehicles || []) as VehicleRow[];
  const vehicleIds = vehicleList.map(v => v.id).filter(Boolean);

  let missions: MissionRow[] = [];
  if (vehicleIds.length > 0) {
    const { data, error: mErr } = await sb
      .from("missions")
      .select("id, status, current_location, origin, destination, driver_name, agent1, agent2, start_time, end_time, last_update, created_at, vehicle_id")
      .in("vehicle_id", vehicleIds)
      .order("last_update", { ascending: false })
      .limit(2000);
    if (mErr) throw new Error(mErr.message);
    missions = (data || []) as MissionRow[];
  }

  const byVehicle = new Map<string, MissionRow[]>();
  for (const m of missions) {
    const vid = m.vehicle_id;
    if (!vid) continue;
    if (!byVehicle.has(vid)) byVehicle.set(vid, []);
    byVehicle.get(vid)!.push(m);
  }

  let inMissionCount = 0;

  const bodyLines: string[] = [];

  vehicleList.forEach((v, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const plate = String(v.plate || "—").toUpperCase();
    const list = byVehicle.get(v.id) || [];
    const active = list.find(isActive);
    const last = list.slice().sort((a, b) => missionSortTs(b) - missionSortTs(a))[0];

    bodyLines.push(`${num} — ${active ? `OS ${active.id}` : "Livre"}`);

    if (active) {
      inMissionCount += 1;
      formatMissionBlock(active, plate, true).forEach(l => bodyLines.push(l));
    } else if (last) {
      formatMissionBlock(last, plate, false).forEach(l => bodyLines.push(l));
    } else {
      bodyLines.push(`🚛 ${plate}${v.model ? ` · ${v.model}` : ""}`);
      bodyLines.push("📋 Sem missão registrada no sistema");
    }

    bodyLines.push("");
  });

  const freeCount = vehicleList.length - inMissionCount;

  const lines: string[] = [
    "🛡️ TORRES VIGILÂNCIA PATRIMONIAL",
    "📋 Resumo Operacional — Viaturas",
    "🏢 TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA",
    `🗓️ ${fmtNowBR()}`,
    "━━━━━━━━━━━━━━━",
    `🚦 Em missão: ${inMissionCount}    ✅ Livre(s): ${freeCount}`,
    `🚛 Total: ${String(vehicleList.length).padStart(2, "0")} viatura(s) cadastrada(s)`,
    "",
    ...bodyLines,
  ];

  return {
    text: lines.join("\n").trimEnd(),
    vehicleCount: vehicleList.length,
    inMissionCount,
    freeCount,
  };
}
