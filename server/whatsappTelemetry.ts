// ── Telemetria WhatsApp (Z-API) — outbound + sessão/vigia ───────────────────
// Objetivo: observabilidade antes de qualquer migração ou mudança de throttle.
// Fire-and-forget: falha ao gravar log NUNCA bloqueia envio.

import { createSupabaseAdminClient } from "./supabaseConfig";
import {
  ensureConnectionStateLoaded,
  getConnectionGeneration,
  getConnectionStateSnapshot,
  getMsSinceReconnect,
} from "./zapiConnectionState";

const SP_TZ = "America/Sao_Paulo";

export type OutboundLogInput = {
  queueLabel: string;
  endpoint: string;
  destinationType: "group" | "individual";
  clientName?: string | null;
  groupId?: string | null;
  missionId?: string | null;
  queueWaitMs?: number;
  queueDepth?: number;
  connectionGeneration?: number;
  msSinceReconnect?: number | null;
  retryCount?: number;
  httpStatus?: number | null;
  success: boolean;
  skipped?: boolean;
  skipReason?: string | null;
  zapiResponse?: unknown;
  errorMessage?: string | null;
  triggeredByUserId?: string | null;
};

export type SessionEventType =
  | "disconnected"
  | "reconnected"
  | "restart_attempted"
  | "wrong_number"
  | "wrong_number_cleared";

export type SessionEventInput = {
  eventType: SessionEventType;
  connected?: boolean | null;
  smartphoneConnected?: boolean | null;
  phone?: string | null;
  dropsLast24h?: number;
  incidentStartedAt?: string | null;
  connectionGeneration?: number;
  details?: Record<string, unknown>;
};

export type RiskLevel = "normal" | "attention" | "high" | "critical";

export type DayTimelineEntry = {
  at: string;
  timeLabel: string;
  kind: "session" | "send" | "burst";
  label: string;
  detail?: string;
  severity: "info" | "warn" | "danger";
  connectionGeneration?: number | null;
};

function getSb() {
  return createSupabaseAdminClient();
}

function truncateJson(value: unknown, maxLen = 4000): unknown {
  if (value == null) return null;
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxLen) return value;
    return { _truncated: true, preview: s.slice(0, maxLen) };
  } catch {
    return { _raw: String(value).slice(0, maxLen) };
  }
}

function timeLabelSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: SP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Cria/atualiza tabelas de telemetria (idempotente). */
export async function runWhatsappTelemetryMigrations(): Promise<void> {
  const sb = getSb();
  if (!sb) return;
  try {
    await sb.rpc("exec_sql", {
      sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_outbound_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        queue_label TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        destination_type TEXT NOT NULL CHECK (destination_type IN ('group', 'individual')),
        client_name TEXT,
        group_id TEXT,
        mission_id TEXT,
        queue_wait_ms INTEGER NOT NULL DEFAULT 0,
        queue_depth INTEGER NOT NULL DEFAULT 0,
        connection_generation INTEGER,
        ms_since_reconnect INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        http_status INTEGER,
        success BOOLEAN NOT NULL DEFAULT false,
        skipped BOOLEAN NOT NULL DEFAULT false,
        skip_reason TEXT,
        zapi_response JSONB,
        error_message TEXT,
        triggered_by_user_id TEXT
      );

      ALTER TABLE whatsapp_outbound_log ADD COLUMN IF NOT EXISTS queue_depth INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE whatsapp_outbound_log ADD COLUMN IF NOT EXISTS connection_generation INTEGER;
      ALTER TABLE whatsapp_outbound_log ADD COLUMN IF NOT EXISTS ms_since_reconnect INTEGER;

      CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_log_created
        ON whatsapp_outbound_log (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_log_client_created
        ON whatsapp_outbound_log (client_name, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_log_group_created
        ON whatsapp_outbound_log (group_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_log_success_created
        ON whatsapp_outbound_log (success, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_log_generation
        ON whatsapp_outbound_log (connection_generation, created_at DESC);

      CREATE TABLE IF NOT EXISTS whatsapp_session_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        event_type TEXT NOT NULL,
        connected BOOLEAN,
        smartphone_connected BOOLEAN,
        phone TEXT,
        drops_last_24h INTEGER,
        incident_started_at TEXT,
        connection_generation INTEGER,
        details JSONB
      );

      ALTER TABLE whatsapp_session_events ADD COLUMN IF NOT EXISTS connection_generation INTEGER;

      CREATE INDEX IF NOT EXISTS idx_whatsapp_session_events_created
        ON whatsapp_session_events (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_session_events_type_created
        ON whatsapp_session_events (event_type, created_at DESC);
      `,
    });
    await ensureConnectionStateLoaded();
  } catch (e: any) {
    console.warn("[WhatsApp Telemetria] Migration:", e?.message || e);
  }
}

/** Registra envio (ou tentativa bloqueada/pulada). Nunca lança. */
export function logWhatsappOutbound(input: OutboundLogInput): void {
  const sb = getSb();
  if (!sb) return;
  const generation = input.connectionGeneration ?? getConnectionGeneration();
  const msSince = input.msSinceReconnect !== undefined
    ? input.msSinceReconnect
    : getMsSinceReconnect();
  void (async () => {
    try {
      await sb.from("whatsapp_outbound_log").insert([{
        queue_label: input.queueLabel,
        endpoint: input.endpoint,
        destination_type: input.destinationType,
        client_name: input.clientName || null,
        group_id: input.groupId || null,
        mission_id: input.missionId || null,
        queue_wait_ms: Math.max(0, Math.round(input.queueWaitMs || 0)),
        queue_depth: Math.max(0, Math.round(input.queueDepth || 0)),
        connection_generation: generation,
        ms_since_reconnect: msSince != null ? Math.round(msSince) : null,
        retry_count: Math.max(0, Math.round(input.retryCount || 0)),
        http_status: input.httpStatus ?? null,
        success: input.success,
        skipped: input.skipped ?? false,
        skip_reason: input.skipReason || null,
        zapi_response: truncateJson(input.zapiResponse) as any,
        error_message: input.errorMessage || null,
        triggered_by_user_id: input.triggeredByUserId || null,
      }]);
    } catch (e: any) {
      console.warn("[WhatsApp Telemetria] Falha ao gravar outbound:", e?.message || e);
    }
  })();
}

/** Registra evento de sessão (vigia Z-API). Nunca lança. */
export function logWhatsappSessionEvent(input: SessionEventInput): void {
  const sb = getSb();
  if (!sb) return;
  const generation = input.connectionGeneration ?? getConnectionGeneration();
  void (async () => {
    try {
      await sb.from("whatsapp_session_events").insert([{
        event_type: input.eventType,
        connected: input.connected ?? null,
        smartphone_connected: input.smartphoneConnected ?? null,
        phone: input.phone || null,
        drops_last_24h: input.dropsLast24h ?? null,
        incident_started_at: input.incidentStartedAt || null,
        connection_generation: generation,
        details: truncateJson(input.details || {}) as any,
      }]);
    } catch (e: any) {
      console.warn("[WhatsApp Telemetria] Falha ao gravar sessão:", e?.message || e);
    }
  })();
}

export type TelemetryRange = "today" | "7d" | "15d";

function rangeBounds(range: TelemetryRange): { start: Date; end: Date; label: string } {
  const end = new Date();
  if (range === "today") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SP_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(end);
    const start = new Date(`${parts}T00:00:00-03:00`);
    return { start, end, label: "Hoje" };
  }
  const days = range === "7d" ? 7 : 15;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, label: range === "7d" ? "7 dias" : "15 dias" };
}

function computeRiskScore(
  sessionRows: any[],
  sentRows: any[],
): { score: number; level: RiskLevel; label: string; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  const reconnections = sessionRows.filter(r => r.event_type === "reconnected").length;
  if (reconnections > 0) {
    score += reconnections * 20;
    factors.push(`${reconnections} reconexão(ões) (+${reconnections * 20})`);
  }

  const restarts = sessionRows.filter(r => r.event_type === "restart_attempted").length;
  if (restarts > 0) {
    score += restarts * 15;
    factors.push(`${restarts} restart(s) (+${restarts * 15})`);
  }

  const maxDepth = sentRows.reduce((m, r) => Math.max(m, Number(r.queue_depth || 0)), 0);
  if (maxDepth >= 20) {
    score += 10;
    factors.push(`fila ≥20 (pico ${maxDepth}) (+10)`);
  }

  const apiErrors = sentRows.filter(r => {
    const s = Number(r.http_status || 0);
    return s === 429 || s >= 500;
  }).length;
  if (apiErrors > 0) {
    score += apiErrors * 15;
    factors.push(`${apiErrors} HTTP 429/5xx (+${apiErrors * 15})`);
  }

  const wrongNumber = sessionRows.filter(r => r.event_type === "wrong_number").length;
  if (wrongNumber > 0) {
    score += wrongNumber * 30;
    factors.push(`${wrongNumber} número errado (+${wrongNumber * 30})`);
  }

  // Tempo offline > 5 min entre queda e reconexão
  const sortedSessions = [...sessionRows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  let offlineIncidents = 0;
  for (let i = 0; i < sortedSessions.length; i++) {
    if (sortedSessions[i].event_type !== "disconnected") continue;
    const discAt = new Date(sortedSessions[i].created_at).getTime();
    const nextReconn = sortedSessions.slice(i + 1).find(r => r.event_type === "reconnected");
    if (!nextReconn) continue;
    const diffMin = (new Date(nextReconn.created_at).getTime() - discAt) / 60_000;
    if (diffMin > 5) offlineIncidents += 1;
  }
  if (offlineIncidents > 0) {
    score += offlineIncidents * 10;
    factors.push(`${offlineIncidents} offline >5min (+${offlineIncidents * 10})`);
  }

  let level: RiskLevel = "normal";
  let label = "Normal";
  if (score > 80) { level = "critical"; label = "Possível bloqueio iminente"; }
  else if (score > 50) { level = "high"; label = "Alto risco"; }
  else if (score > 20) { level = "attention"; label = "Atenção"; }

  return { score, level, label, factors };
}

function buildDayTimeline(sessionRows: any[], sentRows: any[]): DayTimelineEntry[] {
  const entries: DayTimelineEntry[] = [];

  for (const r of sessionRows) {
    const labels: Record<string, string> = {
      disconnected: "Queda da sessão",
      reconnected: "Reconectou",
      restart_attempted: "Restart tentado",
      wrong_number: "Número errado detectado",
      wrong_number_cleared: "Número oficial restaurado",
    };
    const severity: DayTimelineEntry["severity"] =
      r.event_type === "disconnected" || r.event_type === "wrong_number" ? "danger"
        : r.event_type === "restart_attempted" ? "warn"
          : r.event_type === "reconnected" ? "info"
            : "info";
    entries.push({
      at: r.created_at,
      timeLabel: timeLabelSP(r.created_at),
      kind: "session",
      label: labels[r.event_type] || r.event_type,
      detail: r.drops_last_24h != null ? `${r.drops_last_24h} quedas/24h` : undefined,
      severity,
      connectionGeneration: r.connection_generation ?? null,
    });
  }

  for (const r of sentRows) {
    if (r.skipped) continue;
    const os = r.mission_id ? `OS ${String(r.mission_id).slice(0, 8)}…` : r.client_name || "Envio";
    entries.push({
      at: r.created_at,
      timeLabel: timeLabelSP(r.created_at),
      kind: "send",
      label: r.success ? os : `FALHA — ${os}`,
      detail: [
        r.client_name && `cliente: ${r.client_name}`,
        `fila=${r.queue_depth ?? 0}`,
        r.ms_since_reconnect != null ? `+${Math.round(r.ms_since_reconnect / 1000)}s pós-reconexão` : null,
        r.connection_generation != null ? `sessão #${r.connection_generation}` : null,
      ].filter(Boolean).join(" · "),
      severity: r.success ? "info" : "warn",
      connectionGeneration: r.connection_generation ?? null,
    });
  }

  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Agrupa rajadas: 3+ envios em 2 min → entrada "burst"
  const merged: DayTimelineEntry[] = [];
  let i = 0;
  while (i < entries.length) {
    if (entries[i].kind !== "send") {
      merged.push(entries[i]);
      i += 1;
      continue;
    }
    const burst: DayTimelineEntry[] = [entries[i]];
    let j = i + 1;
    while (j < entries.length && entries[j].kind === "send") {
      const gap = new Date(entries[j].at).getTime() - new Date(entries[j - 1].at).getTime();
      if (gap > 2 * 60_000) break;
      burst.push(entries[j]);
      j += 1;
    }
    if (burst.length >= 3) {
      merged.push({
        at: burst[0].at,
        timeLabel: burst[0].timeLabel,
        kind: "burst",
        label: `${burst.length} mensagens em sequência`,
        detail: burst.map(b => b.label).slice(0, 3).join(", ") + (burst.length > 3 ? "…" : ""),
        severity: burst.length >= 10 ? "warn" : "info",
        connectionGeneration: burst[0].connectionGeneration,
      });
    } else {
      merged.push(...burst);
    }
    i = j;
  }

  return merged.slice(-80);
}

/** Primeiro envio após cada reconexão (métrica crítica). */
function firstSendAfterReconnect(sessionRows: any[], sentRows: any[]) {
  const reconnects = sessionRows
    .filter(r => r.event_type === "reconnected")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const sends = sentRows
    .filter(r => !r.skipped)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return reconnects.map(rec => {
    const recAt = new Date(rec.created_at).getTime();
    const gen = rec.connection_generation;
    const first = sends.find(s => {
      const sendAt = new Date(s.created_at).getTime();
      if (sendAt < recAt) return false;
      if (gen != null && s.connection_generation != null && s.connection_generation !== gen) return false;
      return true;
    });
    return {
      reconnectedAt: rec.created_at,
      connectionGeneration: gen ?? rec.connection_generation,
      firstSendAt: first?.created_at || null,
      msToFirstSend: first
        ? new Date(first.created_at).getTime() - recAt
        : null,
      firstSendClient: first?.client_name || null,
      firstSendMissionId: first?.mission_id || null,
    };
  }).slice(-10);
}

export async function getWhatsappTelemetryDashboard(range: TelemetryRange = "today") {
  const sb = getSb();
  if (!sb) {
    return { ok: false, error: "Supabase não configurado" };
  }

  await ensureConnectionStateLoaded();
  const connectionState = getConnectionStateSnapshot();

  const { start, end, label } = rangeBounds(range);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const outboundSelect =
    "id, created_at, queue_wait_ms, queue_depth, connection_generation, ms_since_reconnect, retry_count, http_status, success, skipped, group_id, client_name, queue_label, endpoint, error_message, skip_reason, mission_id";

  const [
    outboundRes,
    sessionRes,
    recentOutboundRes,
    recentSessionRes,
  ] = await Promise.all([
    sb.from("whatsapp_outbound_log")
      .select(outboundSelect)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb.from("whatsapp_session_events")
      .select("id, created_at, event_type, connected, drops_last_24h, phone, incident_started_at, connection_generation, details")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("whatsapp_outbound_log")
      .select("id, created_at, client_name, group_id, queue_label, queue_wait_ms, queue_depth, connection_generation, ms_since_reconnect, http_status, success, skipped, skip_reason, error_message, mission_id")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(30),
    sb.from("whatsapp_session_events")
      .select("id, created_at, event_type, connected, drops_last_24h, phone, incident_started_at, connection_generation")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (outboundRes.error?.message?.includes("does not exist")) {
    return {
      ok: false,
      needsMigration: true,
      error: "Tabela whatsapp_outbound_log não existe. Rode a migration ou reinicie o servidor.",
    };
  }

  const rows = outboundRes.data || [];
  const sessionRowsAsc = [...(sessionRes.data || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const sessionRows = sessionRes.data || [];

  const sentRows = rows.filter(r => !r.skipped);
  const groups = new Set(sentRows.map(r => r.group_id).filter(Boolean));
  const clients = new Set(sentRows.map(r => r.client_name).filter(Boolean));
  const waitSamples = sentRows.map(r => Number(r.queue_wait_ms || 0)).filter(n => n >= 0);
  const avgQueueWaitMs = waitSamples.length
    ? Math.round(waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length)
    : 0;
  const maxQueueDepth = sentRows.reduce((m, r) => Math.max(m, Number(r.queue_depth || 0)), 0);

  const failures = sentRows.filter(r => !r.success).length;
  const retries = sentRows.reduce((acc, r) => acc + (Number(r.retry_count || 0) > 0 ? Number(r.retry_count) : 0), 0);
  const skipped = rows.filter(r => r.skipped).length;

  const reconnections = sessionRows.filter(r => r.event_type === "reconnected").length;
  const disconnects = sessionRows.filter(r => r.event_type === "disconnected").length;
  const restartAttempts = sessionRows.filter(r => r.event_type === "restart_attempted").length;
  const wrongNumber = sessionRows.filter(r => r.event_type === "wrong_number").length;

  const lastRestart = sessionRows.find(r => r.event_type === "restart_attempted") || null;
  const lastDisconnect = sessionRows.find(r => r.event_type === "disconnected") || null;
  const lastReconnect = sessionRows.find(r => r.event_type === "reconnected") || null;

  let lastRestartAt: string | null = null;
  try {
    const { data } = await sb.from("system_settings")
      .select("value")
      .eq("key", "zapi_watchdog_last_restart_at")
      .maybeSingle();
    const raw: any = data?.value;
    const ts = typeof raw === "object" && raw ? Number(raw.ts) : Number(raw);
    if (Number.isFinite(ts) && ts > 0) lastRestartAt = new Date(ts).toISOString();
  } catch { /* ignore */ }

  const hourly = new Map<string, { total: number; failures: number }>();
  for (const r of sentRows) {
    const h = new Date(r.created_at).toLocaleString("en-CA", {
      timeZone: SP_TZ,
      hour: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).replace(", ", " ");
    const bucket = h.slice(0, 13);
    const cur = hourly.get(bucket) || { total: 0, failures: 0 };
    cur.total += 1;
    if (!r.success) cur.failures += 1;
    hourly.set(bucket, cur);
  }

  const timelineHourly = [...hourly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, v]) => ({ hour, ...v }));

  const byGroup = new Map<string, number>();
  for (const r of sentRows) {
    if (!r.group_id) continue;
    byGroup.set(r.group_id, (byGroup.get(r.group_id) || 0) + 1);
  }
  const topGroups = [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([groupId, count]) => ({ groupId, count }));

  const risk = computeRiskScore(sessionRows, sentRows);
  const dayTimeline = buildDayTimeline(sessionRowsAsc, sentRows);
  const postReconnect = firstSendAfterReconnect(sessionRowsAsc, sentRows);

  const sendsWithin60sOfReconnect = postReconnect.filter(
    p => p.msToFirstSend != null && p.msToFirstSend <= 60_000,
  ).length;

  return {
    ok: true,
    range,
    rangeLabel: label,
    periodStart: startIso,
    periodEnd: endIso,
    observationNote:
      "Coletar ≥15 dias sem alterar envio/throttle/provedor, salvo bloqueio crítico que impeça a operação (ex.: 3 bloqueios em 3 dias).",
    connectionState,
    risk,
    outbound: {
      total: sentRows.length,
      skipped,
      distinctGroups: groups.size,
      distinctClients: clients.size,
      avgQueueWaitMs,
      avgQueueWaitSec: Math.round(avgQueueWaitMs / 100) / 10,
      maxQueueDepth,
      failures,
      retries,
      successRate: sentRows.length ? Math.round((sentRows.length - failures) / sentRows.length * 1000) / 10 : 100,
      sendsWithin60sOfReconnect,
    },
    session: {
      reconnections,
      disconnects,
      restartAttempts,
      wrongNumberAlerts: wrongNumber,
      lastRestartAt,
      lastDisconnectAt: lastDisconnect?.created_at || null,
      lastReconnectAt: lastReconnect?.created_at || null,
      lastRestartAttemptAt: lastRestart?.created_at || null,
      currentGeneration: connectionState.generation,
    },
    postReconnect,
    topGroups,
    timelineHourly,
    dayTimeline,
    recentOutbound: recentOutboundRes.data || [],
    recentSessionEvents: recentSessionRes.data || [],
  };
}
