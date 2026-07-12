// ── Relatório diagnóstico consolidado do bot WhatsApp (Z-API) ───────────────
import { getDefaultWhatsappInstance, instanceConfigured } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiFetchWith } from "./whatsapp/zapiHttp";
import { createSupabaseAdminClient } from "./supabaseConfig";
import { getConnectionStateSnapshot } from "./zapiConnectionState";
import {
  getWhatsappTelemetryDashboard,
  type TelemetryRange,
} from "./whatsappTelemetry";
import { OFFICIAL_BOT_PHONE_DISPLAY } from "./zapiGuard";

export type DisconnectCause =
  | "extension_reauth"
  | "smartphone_offline"
  | "session_revoked"
  | "multi_device_conflict"
  | "api_unreachable"
  | "wrong_number"
  | "unknown";

export type DiagnosticsRecommendation = {
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type WhatsappDiagnosticsReport = {
  ok: boolean;
  generatedAt: string;
  range: TelemetryRange;
  error?: string;
  live?: {
    apiReachable: boolean;
    connected: boolean;
    smartphoneConnected: boolean | null;
    connectedPhone: string | null;
    statusRaw?: unknown;
    extensionTokenAvailable: boolean;
    extensionError?: string | null;
  };
  instance?: {
    slug: string;
    label: string;
    lastCheckedAt: string | null;
    lastConnected: boolean | null;
    lastConnectedPhone: string | null;
    lastError: string | null;
    phoneMatchesOfficial: boolean | null;
  } | null;
  connectionState?: ReturnType<typeof getConnectionStateSnapshot>;
  telemetry?: Awaited<ReturnType<typeof getWhatsappTelemetryDashboard>>;
  settings?: {
    lastRestartAt: string | null;
    watchdogNote: string;
  };
  incidents?: Array<{
    at: string;
    type: string;
    dropsLast24h?: number | null;
    details?: unknown;
    connectionGeneration?: number | null;
  }>;
  rootCause?: {
    primary: DisconnectCause;
    confidence: "high" | "medium" | "low";
    summary: string;
    evidence: string[];
  };
  recommendations: DiagnosticsRecommendation[];
};

function classifyRootCause(input: {
  liveConnected: boolean;
  smartphoneConnected: boolean | null;
  extensionTokenAvailable: boolean;
  lastError: string | null;
  wrongNumberAlerts: number;
  disconnects: number;
  lastRestartAt: string | null;
}): WhatsappDiagnosticsReport["rootCause"] {
  const evidence: string[] = [];
  let primary: DisconnectCause = "unknown";
  let confidence: "high" | "medium" | "low" = "low";

  if (!input.liveConnected) {
    if (input.extensionTokenAvailable) {
      primary = "extension_reauth";
      confidence = "high";
      evidence.push("Z-API retorna token de extensão — fluxo típico de sessão WhatsApp Web expirada.");
    } else if (input.smartphoneConnected === false) {
      primary = "smartphone_offline";
      confidence = "high";
      evidence.push("smartphoneConnected=false — celular offline, sem internet ou WhatsApp fechado.");
    } else {
      primary = "session_revoked";
      confidence = "medium";
      evidence.push("Sessão desconectada sem token de extensão disponível (revogação ou instabilidade).");
    }
  }

  if (input.wrongNumberAlerts > 0) {
    primary = "wrong_number";
    confidence = "high";
    evidence.push(`${input.wrongNumberAlerts} alerta(s) de número errado no período.`);
  }

  if (input.lastRestartAt) {
    const restartMs = new Date(input.lastRestartAt).getTime();
    if (Number.isFinite(restartMs) && Date.now() - restartMs < 7 * 24 * 60 * 60 * 1000) {
      evidence.push(`Restart manual registrado em ${new Date(input.lastRestartAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`);
    }
  }

  if (input.disconnects >= 3) {
    evidence.push(`${input.disconnects} quedas no período analisado — padrão recorrente.`);
  }

  const summaries: Record<DisconnectCause, string> = {
    extension_reauth: "WhatsApp exigiu reautenticação via extensão Z-API Conector (sessão Web expirada).",
    smartphone_offline: "Celular do número oficial está offline ou sem WhatsApp ativo em segundo plano.",
    session_revoked: "Sessão Z-API/WhatsApp Web foi encerrada (logout, atualização ou política Meta).",
    multi_device_conflict: "Possível conflito: outro dispositivo ou WhatsApp Web aberto no mesmo número.",
    api_unreachable: "API Z-API inacessível — problema de rede ou credenciais.",
    wrong_number: "Instância conectada em número diferente do oficial.",
    unknown: "Causa não determinada com os dados disponíveis — verificar painel Z-API e celular.",
  };

  return {
    primary,
    confidence,
    summary: summaries[primary],
    evidence: evidence.length ? evidence : ["Sem telemetria detalhada — consulte status ao vivo e painel Z-API."],
  };
}

function buildRecommendations(input: {
  rootCause: DisconnectCause;
  disconnects: number;
  sendsWithin60sOfReconnect: number;
  botEnabled: boolean;
}): DiagnosticsRecommendation[] {
  const recs: DiagnosticsRecommendation[] = [
    {
      priority: "critical",
      title: "Celular dedicado sempre ligado",
      detail: `Mantenha o aparelho do ${OFFICIAL_BOT_PHONE_DISPLAY} com WhatsApp aberto, Wi‑Fi estável, sem economia de bateria e sem desligar à noite.`,
    },
    {
      priority: "critical",
      title: "Não usar WhatsApp Business no chip do bot",
      detail: "WhatsApp Business ou segundo app no mesmo número do bot compete com a Z-API e causa quedas frequentes. Use um aparelho dedicado só com WhatsApp normal.",
    },
    {
      priority: "critical",
      title: "Não abrir WhatsApp Web no mesmo número",
      detail: "Qualquer sessão Web manual no mesmo chip compete com a Z-API e pode derrubar o bot.",
    },
    {
      priority: "high",
      title: "Reconectar em até 15 minutos após alerta",
      detail: "Use o código da extensão (e-mail ou Configurações → WhatsApp → Código extensão). Quanto mais tempo offline, maior o risco de perder filas.",
    },
    {
      priority: "high",
      title: "Webhook de desconexão Z-API",
      detail: "Configure no painel Z-API o callback DisconnectedCallback para /api/zapi/webhook/connection — detecção instantânea.",
    },
    {
      priority: "medium",
      title: "Monitorar Telemetria (15 dias)",
      detail: "Configurações → Telemetria WhatsApp com range 15d para correlacionar quedas com rajadas de envio.",
    },
  ];

  if (input.rootCause === "extension_reauth") {
    recs.unshift({
      priority: "critical",
      title: "Reautenticar agora via extensão",
      detail: "Painel Z-API → Conectar via extensão → colar código no Chrome (extensão Z-API Conector).",
    });
  }

  if (input.sendsWithin60sOfReconnect > 0) {
    recs.push({
      priority: "high",
      title: "Evitar envios imediatos após reconexão",
      detail: `${input.sendsWithin60sOfReconnect} envio(s) nos primeiros 60s pós-reconexão — aguarde 2–3 min antes de disparar grupos.`,
    });
  }

  if (input.disconnects >= 2) {
    recs.push({
      priority: "medium",
      title: "Avaliar Meta Cloud API para envios automáticos",
      detail: "Envios oficiais via API Meta não dependem de celular ligado — reduz quedas operacionais (custo e setup separados).",
    });
  }

  if (!input.botEnabled) {
    recs.push({
      priority: "low",
      title: "Bot individual desligado (WHATSAPP_BOT_ENABLED≠true)",
      detail: "Apenas envios a grupos via API estão ativos — quedas afetam principalmente notificações de grupo.",
    });
  }

  return recs;
}

/** Monta relatório completo para API/CLI (requer service role no servidor). */
export async function buildWhatsappDiagnosticsReport(
  range: TelemetryRange = "15d",
): Promise<WhatsappDiagnosticsReport> {
  const generatedAt = new Date().toISOString();
  const botEnabled = (process.env.WHATSAPP_BOT_ENABLED || "").trim().toLowerCase() === "true";

  const telemetry = await getWhatsappTelemetryDashboard(range);
  const connectionState = getConnectionStateSnapshot();

  const row = await getDefaultWhatsappInstance();
  if (!row || !instanceConfigured(row)) {
    return {
      ok: false,
      generatedAt,
      range,
      error: "Instância WhatsApp/Z-API não configurada no banco.",
      recommendations: buildRecommendations({
        rootCause: "unknown",
        disconnects: 0,
        sendsWithin60sOfReconnect: 0,
        botEnabled,
      }),
    };
  }

  const creds = credsFromInstance(row);
  let live = {
    apiReachable: false,
    connected: false,
    smartphoneConnected: null as boolean | null,
    connectedPhone: null as string | null,
    statusRaw: undefined as unknown,
    extensionTokenAvailable: false,
    extensionError: null as string | null,
  };

  if (creds) {
    try {
      const { ok, data } = await zapiFetchWith(creds, "status", { method: "GET" });
      live.apiReachable = ok || !!data;
      live.statusRaw = data;
      live.connected = data?.connected === true && data?.smartphoneConnected !== false;
      live.smartphoneConnected = typeof data?.smartphoneConnected === "boolean" ? data.smartphoneConnected : null;

      if (live.connected) {
        const dev = await zapiFetchWith(creds, "device", { method: "GET" });
        if (dev.ok && dev.data) {
          live.connectedPhone = String(dev.data.phone || dev.data?.device?.phone || "").replace(/\D/g, "") || null;
        }
      }

      const ext = await zapiFetchWith(creds, "extension-token", { method: "GET" });
      const token = String(ext.data?.token || "").trim();
      live.extensionTokenAvailable = !!token;
      if (!ext.ok && !token) live.extensionError = ext.data?.error || ext.text || null;
    } catch (e: any) {
      live.extensionError = e?.message || String(e);
    }
  }

  let lastRestartAt: string | null = telemetry.session?.lastRestartAt || null;
  const sb = createSupabaseAdminClient();
  if (sb && !lastRestartAt) {
    try {
      const { data } = await sb.from("system_settings")
        .select("value")
        .eq("key", "zapi_watchdog_last_restart_at")
        .maybeSingle();
      const raw: any = data?.value;
      const ts = typeof raw === "object" && raw ? Number(raw.ts) : Number(raw);
      if (Number.isFinite(ts) && ts > 0) lastRestartAt = new Date(ts).toISOString();
    } catch { /* ignore */ }
  }

  const sessionEvents = telemetry.recentSessionEvents || [];
  const disconnects = telemetry.session?.disconnects ?? 0;
  const wrongNumber = telemetry.session?.wrongNumberAlerts ?? 0;
  const sendsWithin60s = telemetry.outbound?.sendsWithin60sOfReconnect ?? 0;

  const rootCause = classifyRootCause({
    liveConnected: live.connected,
    smartphoneConnected: live.smartphoneConnected,
    extensionTokenAvailable: live.extensionTokenAvailable,
    lastError: row.last_error,
    wrongNumberAlerts: wrongNumber,
    disconnects,
    lastRestartAt,
  });

  return {
    ok: true,
    generatedAt,
    range,
    live,
    instance: {
      slug: row.slug,
      label: row.label,
      lastCheckedAt: row.last_checked_at,
      lastConnected: row.last_connected,
      lastConnectedPhone: row.last_connected_phone,
      lastError: row.last_error,
      phoneMatchesOfficial: row.phone_matches_official,
    },
    connectionState,
    telemetry,
    settings: {
      lastRestartAt,
      watchdogNote: "Reconexão automática desativada por segurança anti-ban. Vigia consulta status a cada 3 min.",
    },
    incidents: sessionEvents.map((e: any) => ({
      at: e.created_at,
      type: e.event_type,
      dropsLast24h: e.drops_last_24h,
      details: e.details,
      connectionGeneration: e.connection_generation,
    })),
    rootCause,
    recommendations: buildRecommendations({
      rootCause: rootCause!.primary,
      disconnects,
      sendsWithin60sOfReconnect: sendsWithin60s,
      botEnabled,
    }),
  };
}
