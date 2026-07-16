/**
 * Operações WhatsApp/Z-API para handlers serverless leves (sem Express).
 */
import { createSupabaseAdminClient } from "./supabaseAdmin.js";
import {
  getZapiEnvInstanceType,
  getZapiMobileEnvCreds,
  hasExplicitZapiMobileEnv,
  hasExplicitZapiWebEnv,
  OFFICIAL_BOT_PHONE_LOCAL,
  WHATSAPP_BOT_DISPLAY_NAME,
} from "./zapiMobileEnv.js";
import { looksLikeZapiSecret, safeWhatsappInstanceLabel, sanitizeWhatsappError } from "./whatsappDisplayUtils.js";
import {
  buildMobileConnectionDiagnosis,
  explainMobileDisconnect,
  isZapiSessionConnected,
  pickMobileRegistrationMethod,
  resolveMobileChannelWaits,
} from "./whatsappMobileDiagnosis.js";

function sb() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Supabase indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel.");
  return client;
}

export type InstanceRow = {
  id: string;
  slug: string;
  label: string;
  provider: "zapi" | "meta" | "mock";
  instance_type: "web" | "mobile" | null;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_api_version: string | null;
  official_ddi: string;
  official_phone: string;
  is_default: boolean;
  enabled: boolean;
  last_checked_at: string | null;
  last_connected: boolean | null;
  last_connected_phone: string | null;
  phone_matches_official: boolean | null;
  last_error: string | null;
  last_heartbeat_at: string | null;
  last_qr_base64: string | null;
  last_connected_at: string | null;
  last_status_raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ZapiCreds = {
  instance: string;
  token: string;
  clientToken: string;
  type: "web" | "mobile";
};

const LOCK_KEY = "zapi_reconnect_lock";
export const MODAL_DISMISS_KEY = "zapi_reconnect_modal_dismissed";
export const RECONNECT_LOCK_TTL_MS = 10 * 60 * 1000;

export type ModalDismissRecord = {
  at: string;
  userId: string;
  userName: string;
  incidentStartedAt: string | null;
};

export type ReconnectLock = {
  holderId: string;
  holderName: string;
  acquiredAt: string;
  expiresAt: string;
  phase: "claimed" | "generating" | "code_ready" | "done";
  phoneLinkCode?: string | null;
  reconnectMessage?: string | null;
};

function maskSecret(value: string | null | undefined, visible = 4): string {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= visible) return "*".repeat(s.length);
  return "*".repeat(Math.max(0, s.length - visible)) + s.slice(-visible);
}

export function toPublicInstance(row: InstanceRow) {
  const { zapi_token, zapi_client_token, meta_access_token, ...rest } = row;
  return {
    ...rest,
    label: safeWhatsappInstanceLabel(rest.label),
    last_error: sanitizeWhatsappError(rest.last_error),
    has_zapi_token: !!zapi_token,
    has_meta_token: !!meta_access_token,
    zapi_token_masked: zapi_token ? maskSecret(zapi_token) : undefined,
  };
}

export function credsFromRow(row: InstanceRow): ZapiCreds | null {
  const envCreds = getZapiMobileEnvCreds();
  const explicitEnv = hasExplicitZapiMobileEnv() || hasExplicitZapiWebEnv();
  const dbClient = String(row.zapi_client_token || "").trim();

  // Env explícito (Vercel) vence sobre Supabase — evita ID/token mobile antigos no banco.
  if (explicitEnv && envCreds) {
    return {
      instance: envCreds.instanceId,
      token: envCreds.token,
      clientToken: envCreds.clientToken || dbClient,
      type: getZapiEnvInstanceType(),
    };
  }

  if (!row.zapi_instance_id || !row.zapi_token) {
    if (!envCreds) return null;
    return {
      instance: envCreds.instanceId,
      token: envCreds.token,
      clientToken: envCreds.clientToken || dbClient,
      type: getZapiEnvInstanceType(),
    };
  }

  return {
    instance: row.zapi_instance_id,
    token: row.zapi_token,
    clientToken: envCreds?.clientToken || dbClient,
    type: row.instance_type === "mobile" ? "mobile" : "web",
  };
}

/** Normaliza telefone BR para Z-API mobile: ddi=55, phone=DDD+número (sem 55). */
export function officialPhoneParts(row: Pick<InstanceRow, "official_ddi" | "official_phone">) {
  let ddi = String(row.official_ddi || "55").replace(/\D/g, "") || "55";
  if (ddi === "055") ddi = "55";
  let digits = String(row.official_phone || "").replace(/\D/g, "");
  // Remove zeros à esquerda e DDI duplicado
  while (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith(ddi) && digits.length > 11) {
    digits = digits.slice(ddi.length);
  }
  // BR móvel: 10 ou 11 dígitos (DDD + número). Se veio só com DDI, mantém.
  const phoneLocal = digits;
  const full = phoneLocal.startsWith(ddi) ? phoneLocal : `${ddi}${phoneLocal}`;
  const display =
    phoneLocal.length >= 10
      ? `+${ddi} (${phoneLocal.slice(0, 2)}) ${phoneLocal.slice(2, 7)}-${phoneLocal.slice(7)}`
      : `+${ddi}${phoneLocal}`;
  return { ddi, phone: phoneLocal, phoneLocal, full, display };
}

function zapiBase(creds: Pick<ZapiCreds, "instance" | "token">): string {
  return `https://api.z-api.io/instances/${creds.instance}/token/${creds.token}`;
}

export async function zapiFetch(
  creds: ZapiCreds,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; text: string }> {
  const url = `${zapiBase(creds)}/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) };
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;
  if (init.body) headers["Content-Type"] = "application/json";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);
  try {
    const r = await fetch(url, { ...init, headers, signal: ac.signal });
    const text = await r.text();
    let data: Record<string, unknown> | null = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, data: { error: message }, text: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureWhatsappInstancesFromEnv(): Promise<void> {
  const envCreds = getZapiMobileEnvCreds();
  if (!envCreds) return;

  const explicitSync = hasExplicitZapiMobileEnv() || hasExplicitZapiWebEnv();

  const client = sb();
  const phone = (process.env.ZAPI_OFFICIAL_PHONE || process.env.META_WHATSAPP_DISPLAY_PHONE || OFFICIAL_BOT_PHONE_LOCAL)
    .replace(/\D/g, "")
    .replace(/^55/, "");

  const type = getZapiEnvInstanceType();
  const safeLabel = safeWhatsappInstanceLabel(envCreds.label);

  const payload: Record<string, unknown> = {
    provider: "zapi",
    instance_type: type,
    zapi_instance_id: envCreds.instanceId,
    zapi_token: envCreds.token,
    label: safeLabel,
    official_ddi: process.env.ZAPI_OFFICIAL_DDI || "55",
    official_phone: phone,
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  if (envCreds.clientToken) payload.zapi_client_token = envCreds.clientToken;

  const { count, error: countErr } = await client
    .from("whatsapp_instances")
    .select("id", { count: "exact", head: true });

  if (countErr) {
    if (String(countErr.message || "").includes("whatsapp_instances")) {
      throw new Error(
        "Tabela whatsapp_instances não existe no Supabase. Rode migrations/2026_07_07_whatsapp_instances.sql no SQL Editor.",
      );
    }
    throw countErr;
  }

  if (!count || count === 0) {
    const { error } = await client.from("whatsapp_instances").insert([{
      slug: "central",
      label: safeLabel,
      provider: "zapi",
      instance_type: type,
      zapi_instance_id: envCreds.instanceId,
      zapi_token: envCreds.token,
      zapi_client_token: envCreds.clientToken || null,
      official_ddi: payload.official_ddi,
      official_phone: phone,
      is_default: true,
      enabled: true,
    }]);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: def } = await client
    .from("whatsapp_instances")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();

  if (def?.id) {
    if (!explicitSync) {
      // Legado sem env explícito: preserva tokens do banco quando o ID não mudou.
      const { data: current } = await client
        .from("whatsapp_instances")
        .select("zapi_instance_id,zapi_client_token,zapi_token,label")
        .eq("id", def.id)
        .maybeSingle();
      const sameInstanceId = String(current?.zapi_instance_id || "") === envCreds.instanceId;
      if (current?.zapi_client_token && !envCreds.clientToken) delete payload.zapi_client_token;
      if (current?.zapi_token && sameInstanceId) delete payload.zapi_token;
      if (current?.label && !looksLikeZapiSecret(String(current.label))) delete payload.label;
    }
    await client.from("whatsapp_instances").update(payload).eq("id", def.id);
    return;
  }

  const { data: first } = await client
    .from("whatsapp_instances")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (first?.id) {
    const syncPayload = { ...payload, is_default: true };
    if (!explicitSync) {
      const { data: current } = await client
        .from("whatsapp_instances")
        .select("zapi_instance_id,zapi_client_token,zapi_token,label")
        .eq("id", first.id)
        .maybeSingle();
      const sameInstanceId = String(current?.zapi_instance_id || "") === envCreds.instanceId;
      if (current?.zapi_client_token && !envCreds.clientToken) delete syncPayload.zapi_client_token;
      if (current?.zapi_token && sameInstanceId) delete syncPayload.zapi_token;
      if (current?.label && !looksLikeZapiSecret(String(current.label))) delete syncPayload.label;
    }
    await client.from("whatsapp_instances").update(syncPayload).eq("id", first.id);
    await client.from("whatsapp_instances").update({ is_default: false }).neq("id", first.id);
  }
}

export async function listInstances(): Promise<InstanceRow[]> {
  const client = sb();
  const { data, error } = await client.from("whatsapp_instances").select("*").order("label");
  if (error) throw new Error(error.message);

  const rows = (data || []) as InstanceRow[];
  if (rows.length === 0) {
    await ensureWhatsappInstancesFromEnv();
    const retry = await client.from("whatsapp_instances").select("*").order("label");
    if (retry.error) throw new Error(retry.error.message);
    return (retry.data || []) as InstanceRow[];
  }

  // Mantém credenciais Z-API da Vercel alinhadas quando configuradas.
  await ensureWhatsappInstancesFromEnv().catch(() => { /* não bloqueia listagem */ });

  // Corrige label com URL/token Z-API gravado erroneamente no banco.
  for (const row of rows) {
    if (row.label && looksLikeZapiSecret(row.label)) {
      const fixed = safeWhatsappInstanceLabel(row.label);
      void client.from("whatsapp_instances").update({
        label: fixed,
        last_error: sanitizeWhatsappError(row.last_error),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      row.label = fixed;
    }
  }

  return rows;
}

export async function getInstance(instanceId?: string | null): Promise<InstanceRow | null> {
  await ensureWhatsappInstancesFromEnv();
  const client = sb();
  if (instanceId) {
    const { data } = await client.from("whatsapp_instances").select("*").eq("id", instanceId).maybeSingle();
    return (data as InstanceRow) || null;
  }
  const { data } = await client.from("whatsapp_instances").select("*").eq("is_default", true).maybeSingle();
  return (data as InstanceRow) || null;
}

export type WhatsappGroupItem = {
  id: string;
  phone: string;
  name: string;
  isGroup: boolean;
  archived?: string | boolean;
};

/**
 * Lista grupos da instância padrão (Z-API), com paginação e timeout curto.
 * Usado pelo seletor do cadastro de cliente — não passa pelo Express (evita 504).
 */
export async function listWhatsappGroups(): Promise<WhatsappGroupItem[]> {
  const row = await getInstance();
  if (!row) throw new Error("WhatsApp não configurado no banco");
  const creds = credsFromRow(row);
  if (!creds) throw new Error("Z-API não configurada");

  const PAGE_SIZE = 100;
  const MAX_PAGES = 20;
  const all: WhatsappGroupItem[] = [];
  const seen = new Set<string>();

  const collect = (payload: unknown): number => {
    const raw = Array.isArray(payload)
      ? payload
      : (payload && typeof payload === "object" && Array.isArray((payload as { groups?: unknown[] }).groups)
        ? (payload as { groups: unknown[] }).groups
        : []);
    let pageLen = 0;
    for (const item of raw) {
      pageLen++;
      const g = item as Record<string, unknown>;
      const id = String(g.id || g.phone || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push({
        id,
        phone: String(g.phone || id),
        name: String(g.name || g.subject || "Grupo sem nome"),
        isGroup: g.isGroup !== false,
        archived: g.archived as string | boolean | undefined,
      });
    }
    return pageLen;
  };

  for (let page = 1; page <= MAX_PAGES; page++) {
    let result = await zapiFetch(creds, `groups?page=${page}&pageSize=${PAGE_SIZE}`);
    if (!result.ok && page === 1 && result.status >= 400 && result.status < 500) {
      const errMsg = String((result.data as { error?: string } | null)?.error || "");
      if (!/connected/i.test(errMsg)) {
        result = await zapiFetch(creds, "groups");
        if (result.ok) {
          collect(result.data);
          break;
        }
      }
    }
    if (!result.ok) {
      if (page === 1) {
        const zapiMsg = String((result.data as { error?: string } | null)?.error || result.text || "");
        if (/connected/i.test(zapiMsg)) {
          throw new Error(
            "WhatsApp da Central está DESCONECTADO — reconecte a instância e tente novamente",
          );
        }
        throw new Error(`Falha Z-API ao listar grupos (HTTP ${result.status || 502})`);
      }
      break;
    }
    const pageLen = collect(result.data);
    if (pageLen <= 0 || pageLen < PAGE_SIZE) break;
  }

  all.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return all;
}

export type UpdateInstanceInput = {
  slug?: string;
  label?: string;
  provider?: "zapi" | "meta" | "mock";
  instance_type?: "web" | "mobile" | null;
  zapi_instance_id?: string | null;
  zapi_token?: string;
  zapi_client_token?: string | null;
  meta_phone_number_id?: string | null;
  meta_access_token?: string;
  meta_api_version?: string | null;
  official_ddi?: string;
  official_phone?: string;
  is_default?: boolean;
  enabled?: boolean;
};

export async function updateInstance(instanceId: string, input: UpdateInstanceInput): Promise<InstanceRow> {
  const id = String(instanceId || "").trim();
  if (!id) throw new Error("instanceId obrigatório");

  const client = sb();
  const existing = await getInstance(id);
  if (!existing) throw new Error("Instância não encontrada");

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.slug != null) payload.slug = String(input.slug).trim().toLowerCase();
  if (input.label != null) payload.label = safeWhatsappInstanceLabel(input.label);
  if (input.provider != null) payload.provider = input.provider;
  if (input.instance_type !== undefined) payload.instance_type = input.instance_type;
  if (input.zapi_instance_id !== undefined) payload.zapi_instance_id = input.zapi_instance_id;
  if (input.zapi_client_token !== undefined) {
    const ct = input.zapi_client_token == null ? null : String(input.zapi_client_token).trim();
    payload.zapi_client_token = ct || null;
  }
  if (typeof input.zapi_token === "string" && input.zapi_token.trim()) {
    payload.zapi_token = input.zapi_token.trim();
  }
  if (input.meta_phone_number_id !== undefined) payload.meta_phone_number_id = input.meta_phone_number_id;
  if (typeof input.meta_access_token === "string" && input.meta_access_token.trim()) {
    payload.meta_access_token = input.meta_access_token.trim();
  }
  if (input.meta_api_version !== undefined) payload.meta_api_version = input.meta_api_version;
  if (input.official_ddi != null) payload.official_ddi = String(input.official_ddi).replace(/\D/g, "") || "55";
  if (input.official_phone != null) {
    const parts = officialPhoneParts({
      official_ddi: String(payload.official_ddi || input.official_ddi || "55"),
      official_phone: String(input.official_phone),
    });
    payload.official_ddi = parts.ddi;
    payload.official_phone = parts.phoneLocal;
  }
  if (typeof input.enabled === "boolean") payload.enabled = input.enabled;
  if (typeof input.is_default === "boolean") payload.is_default = input.is_default;

  if (payload.is_default === true) {
    await client.from("whatsapp_instances").update({ is_default: false }).neq("id", id);
  }

  const { data, error } = await client
    .from("whatsapp_instances")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Falha ao salvar instância");
  return data as InstanceRow;
}

export function instanceConfigured(row: InstanceRow): boolean {
  if (row.provider === "zapi") return !!(row.zapi_instance_id && row.zapi_token);
  if (row.provider === "meta") return !!(row.meta_phone_number_id && row.meta_access_token);
  return row.provider === "mock";
}

async function readLiveStatus(creds: ZapiCreds) {
  const { ok, data } = await zapiFetch(creds, "status", { method: "GET" });
  const connected = isZapiSessionConnected(data, creds.type);
  return { apiOk: ok || !!data, connected, data };
}

export async function getConnectionStatus(instanceId?: string | null) {
  const row = await getInstance(instanceId);
  if (!row || !instanceConfigured(row)) {
    return { error: "WhatsApp não configurado no banco", status: 503 as const };
  }
  if (row.provider !== "zapi") {
    return { error: "Provider não suportado neste handler leve", status: 400 as const };
  }
  const creds = credsFromRow(row);
  if (!creds) return { error: "Credenciais Z-API incompletas", status: 503 as const };

  const { ok, data } = await zapiFetch(creds, "status", { method: "GET" });
  const status = {
    connected: isZapiSessionConnected(data, creds.type),
    smartphoneConnected: data?.smartphoneConnected,
    session: data?.session,
    error: data?.error ? String(data.error) : undefined,
    raw: data,
  };

  let connectedPhone: string | null = null;
  if (status.connected) {
    const dev = await zapiFetch(creds, "device", { method: "GET" });
    if (dev.ok && dev.data) {
      connectedPhone = String(dev.data.phone || dev.data?.device || dev.data?.wid || "").replace(/\D/g, "") || null;
    }
  }

  const officialParts = officialPhoneParts(row);
  const official = officialParts.full;

  // MOBILE: só consulta availability (não dispara request-code).
  let registrationAvailable: Record<string, unknown> | null = null;
  if ((row.instance_type || "web") === "mobile" && !status.connected) {
    const reg = await zapiFetch(creds, "mobile/registration-available", {
      method: "POST",
      body: JSON.stringify({ ddi: officialParts.ddi || "55", phone: officialParts.phoneLocal }),
    });
    if (reg.data && typeof reg.data === "object") registrationAvailable = reg.data;
  }

  const disconnectHint = explainMobileDisconnect(status.error || row.last_error);
  const diagnosis = buildMobileConnectionDiagnosis({
    instanceType: row.instance_type || "web",
    connected: !!status.connected,
    registrationAvailable,
    requestCodeResult: null,
    phoneLinkCode: null,
  });

  return {
    status: 200 as const,
    body: {
      instanceId: row.id,
      slug: row.slug,
      label: row.label,
      provider: row.provider,
      configured: true,
      instanceType: row.instance_type || "web",
      officialPhone: official,
      status,
      connectedPhone,
      phoneMatchesOfficial: connectedPhone === official,
      lastCheckedAt: row.last_checked_at,
      lastError: row.last_error,
      lastConnected: row.last_connected,
      registrationAvailable,
      disconnectHint,
      diagnosis,
    },
  };
}

export async function fetchPhoneLinkCode(row: InstanceRow): Promise<string | null> {
  const result = await fetchPhoneLinkCodeDetailed(row);
  return result.code;
}

export async function fetchPhoneLinkCodeDetailed(row: InstanceRow): Promise<{
  code: string | null;
  error: string | null;
  httpStatus: number;
  raw: Record<string, unknown> | null;
}> {
  const creds = credsFromRow(row);
  if (!creds) {
    return { code: null, error: "Credenciais Z-API incompletas", httpStatus: 0, raw: null };
  }
  const { full } = officialPhoneParts(row);
  const { ok, status, data, text } = await zapiFetch(creds, `phone-code/${full}`, { method: "GET" });
  const code = String(data?.code || data?.value || "").trim() || null;
  if (code) return { code, error: null, httpStatus: status, raw: data };
  const err = sanitizeWhatsappError(
    String(data?.error || data?.message || text || (!ok ? `HTTP ${status}` : "phone-code vazio")),
  );
  return { code: null, error: err, httpStatus: status, raw: data };
}

/**
 * Fluxo mobile (docs Z-API):
 * registration-available → request-registration-code → (respond-captcha) → confirm-registration-code → confirm-pin-code
 * Paths reais: /mobile/request-registration-code (não /mobile/request-code)
 */
export async function requestMobilePairingCode(
  row: InstanceRow,
  method: "wa_old" | "sms" | "voice" | "auto" = "auto",
) {
  const creds = credsFromRow(row);
  if (!creds) return { ok: false, error: "Credenciais incompletas", data: null as Record<string, unknown> | null };
  const parts = officialPhoneParts(row);
  // Z-API mobile docs: { ddi: "55", phone: "11999999999" } — SEM o 55 no phone
  const basePhone = { ddi: parts.ddi || "55", phone: parts.phoneLocal };

  const avail = await zapiFetch(creds, "mobile/registration-available", {
    method: "POST",
    body: JSON.stringify(basePhone),
  });
  if (avail.data?.available === false || avail.data?.blocked === true) {
    return {
      ok: false,
      error: sanitizeWhatsappError(String(avail.data?.error || avail.data?.message || avail.text || "Número indisponível/bloqueado")),
      data: avail.data,
      phase: "registration_available",
      phoneUsed: basePhone,
      phoneDisplay: parts.display,
      registration: avail.data,
    };
  }

  const preferred = method === "auto" ? "wa_old" : method;
  const pick = pickMobileRegistrationMethod(avail.data, preferred);
  const waits = resolveMobileChannelWaits(avail.data);

  if (method === "auto" && pick.deferredSeconds > 0) {
    return {
      ok: false,
      error: `WhatsApp pede espera de ~${Math.ceil(pick.deferredSeconds / 60)} min antes de novo pedido (${pick.method}). ${pick.reason}.`,
      data: avail.data,
      phase: "wait",
      method: pick.method,
      registration: avail.data,
      phoneUsed: basePhone,
      phoneDisplay: parts.display,
      phoneLinkCode: null as string | null,
      deferredSeconds: pick.deferredSeconds,
    };
  }

  const useMethod = method === "auto" ? pick.method : method;
  const channelWait =
    useMethod === "sms" ? waits.sms : useMethod === "voice" ? waits.voice : waits.waOld;
  const channelEligible = useMethod !== "wa_old" || waits.waOldEligible;

  if (!channelEligible) {
    return {
      ok: false,
      error: `Pop-up wa_old não elegível agora para ${parts.display}. Aguarde ou tente Ligação/SMS.`,
      data: avail.data,
      phase: "wait",
      method: useMethod,
      registration: avail.data,
      phoneUsed: basePhone,
      phoneDisplay: parts.display,
      phoneLinkCode: null as string | null,
      deferredSeconds: Math.max(waits.voice, waits.sms > 0 ? waits.sms : 0, waits.retryAfter, 60),
    };
  }

  if (channelWait === -1) {
    return {
      ok: false,
      error: `${useMethod === "sms" ? "SMS" : useMethod === "voice" ? "Ligação" : "Pop-up"} bloqueado agora (wait=-1) para ${parts.display}. Tente outro canal ou aguarde.`,
      data: avail.data,
      phase: "wait",
      method: useMethod,
      registration: avail.data,
      phoneUsed: basePhone,
      phoneDisplay: parts.display,
      phoneLinkCode: null as string | null,
    };
  }

  // Cooldown: NÃO chamar request-registration-code (doc Z-API — gera blocked)
  if (channelWait > 0) {
    return {
      ok: false,
      error: `Cooldown WhatsApp: aguarde ~${Math.ceil(channelWait / 60)} min antes de pedir ${useMethod} de novo para ${parts.display} (wait=${channelWait}s). Pedir agora costuma retornar blocked.`,
      data: avail.data,
      phase: "wait",
      method: useMethod,
      registration: avail.data,
      phoneUsed: basePhone,
      phoneDisplay: parts.display,
      phoneLinkCode: null as string | null,
      deferredSeconds: channelWait,
    };
  }

  const payload = { ...basePhone, method: useMethod };

  const req = await zapiFetch(creds, "mobile/request-registration-code", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const captcha = typeof req.data?.captcha === "string" ? req.data.captcha : null;
  if (captcha) {
    return {
      ok: false,
      error: "Z-API pediu captcha — resolva no painel Z-API ou tente novamente em instantes.",
      data: req.data,
      phase: "captcha",
      method: useMethod,
      registration: avail.data,
      captcha,
      phoneUsed: payload,
      phoneDisplay: parts.display,
    };
  }

  const zapiErrorCode = String(req.data?.error || "").trim();
  const zapiErrorMsg = String(req.data?.message || "").trim();
  const zapiError = [zapiErrorCode, zapiErrorMsg].filter(Boolean).join(": ");
  const success = req.data?.success === true;
  if (!req.ok || req.data?.success === false || zapiError || !success) {
    let friendly: string;
    if (req.data?.blocked === true) {
      friendly = `WhatsApp bloqueou o envio (${useMethod}) para ${parts.display} agora (blocked sem appealToken). Continue no MOBILE: pare de repetir pedidos, deixe o Business aberto no eSIM, aguarde e tente UMA vez (Pop-up/SMS/Ligação). Quando o código chegar por SMS/voz, confirme no painel.`;
    } else if (useMethod === "sms" && Number(req.data?.smsWaitSeconds) === -1) {
      friendly = `SMS bloqueado (smsWaitSeconds=-1) para ${parts.display}. Tente Pop-up ou Ligação.`;
    } else if (useMethod === "wa_old" && avail.data?.waOldEligible === false) {
      friendly = `Pop-up wa_old não elegível agora para ${parts.display}. Tente Ligação ou SMS.`;
    } else if (/unable to find matching target resource method/i.test(zapiError)) {
      friendly = `Rota Z-API inválida no request-registration-code — confira Client-Token e tipo MOBILE no painel.`;
    } else {
      friendly = sanitizeWhatsappError(zapiError || req.text || `Falha request-registration-code (${useMethod})`)
        || zapiError
        || `Falha ao solicitar código (${useMethod})`;
    }
    return {
      ok: false,
      error: friendly,
      data: req.data,
      phase: "request_code",
      method: useMethod,
      registration: avail.data,
      phoneUsed: payload,
      phoneDisplay: parts.display,
      phoneLinkCode: null as string | null,
      message: req.data?.blocked === true
        ? "Registro MOBILE temporariamente bloqueado pelo WhatsApp. Não use código de 8 letras — aguarde e tente pop-up/SMS de novo."
        : undefined,
    };
  }

  return {
    ok: true,
    error: null as string | null,
    data: req.data,
    phase: "request_code",
    method: useMethod,
    registration: avail.data,
    phoneUsed: payload,
    phoneDisplay: parts.display,
    phoneLinkCode: null as string | null,
    message: useMethod === "wa_old"
      ? `Pop-up enviado para ${parts.display}. Deixe o WhatsApp Business aberto e confirme o aviso na tela (não use código de 8 letras).`
      : `Código pedido via ${useMethod} para ${parts.display}. Quando chegar, digite em “Confirmar código” no painel.`,
  };
}

export async function confirmMobilePairingCode(code: string) {
  const row = await getInstance();
  if (!row || !instanceConfigured(row)) return { ok: false, error: "Instância não configurada", data: null as Record<string, unknown> | null };
  const creds = credsFromRow(row);
  if (!creds) return { ok: false, error: "Credenciais incompletas", data: null as Record<string, unknown> | null };
  const { ok, data, text } = await zapiFetch(creds, "mobile/confirm-registration-code", {
    method: "POST",
    body: JSON.stringify({ code: String(code).trim() }),
  });
  if (!ok || data?.success === false) {
    return {
      ok: false,
      error: sanitizeWhatsappError(String(data?.error || data?.message || text || "Falha ao confirmar código")),
      data,
    };
  }
  // Após confirmar o código, a Z-API pode exigir device-transfer (virar aparelho principal).
  let transfer: Record<string, unknown> | null = null;
  try {
    const tr = await zapiFetch(creds, "mobile/device-transfer-confirmed", { method: "GET" });
    transfer = tr.data;
  } catch {
    /* opcional — nem sempre a API exige neste passo */
  }
  return { ok: true, error: null as string | null, data, transfer };
}

export async function confirmMobileSecurityPin(pin: string) {
  const row = await getInstance();
  if (!row || !instanceConfigured(row)) return { ok: false, error: "Instância não configurada", data: null as Record<string, unknown> | null };
  const creds = credsFromRow(row);
  if (!creds) return { ok: false, error: "Credenciais incompletas", data: null as Record<string, unknown> | null };
  const { ok, data, text } = await zapiFetch(creds, "mobile/confirm-pin-code", {
    method: "POST",
    body: JSON.stringify({ code: String(pin).trim() }),
  });
  if (!ok || data?.success === false) {
    return {
      ok: false,
      error: sanitizeWhatsappError(String(data?.error || data?.message || text || "Falha ao confirmar PIN")),
      data,
    };
  }
  return { ok: true, error: null as string | null, data };
}

/** Token de sessão descartável para o SDK Connector (modal oficial Z-API). */
export async function getSdkConnectorToken(instanceId?: string | null) {
  const row = await getInstance(instanceId);
  if (!row || !instanceConfigured(row)) {
    return { status: 503 as const, error: "WhatsApp não configurado" };
  }
  if (row.provider !== "zapi") {
    return { status: 400 as const, error: "SDK Connector só está disponível para provider Z-API" };
  }
  const creds = credsFromRow(row);
  if (!creds) return { status: 503 as const, error: "Credenciais Z-API incompletas" };
  if (!creds.clientToken) {
    return { status: 503 as const, error: "Client-Token Z-API obrigatório para gerar o token do SDK" };
  }

  const { ok, status, data, text } = await zapiFetch(creds, "sdk-connector-token", { method: "GET" });
  const token = String(data?.token || data?.value || "").trim();
  if (!ok || !token) {
    return {
      status: (status >= 400 ? status : 502) as number,
      error: sanitizeWhatsappError(String(data?.error || data?.message || text || "Falha ao gerar sdk-connector-token")),
      httpStatus: status,
      data,
    };
  }

  return {
    status: 200 as const,
    body: {
      ok: true,
      token,
      instanceId: row.id,
      instanceType: creds.type,
      label: row.label,
      phoneDisplay: officialPhoneParts(row).display,
    },
  };
}

export async function getQrAndPhoneCode(instanceId?: string | null) {
  const row = await getInstance(instanceId);
  if (!row || !instanceConfigured(row)) return { error: "WhatsApp não configurado", status: 503 as const };
  const creds = credsFromRow(row);
  if (!creds) return { error: "Credenciais incompletas", status: 503 as const };

  const qrRes = await zapiFetch(creds, "qr-code/image", { method: "GET" });
  let qrBase64: string | null = null;
  if (qrRes.ok && qrRes.data) {
    const value = qrRes.data.value || qrRes.data.qrcode;
    if (typeof value === "string" && value.length > 20) {
      qrBase64 = value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
    }
  }
  const phoneDetailed = await fetchPhoneLinkCodeDetailed(row);
  return {
    status: 200 as const,
    body: {
      qrBase64,
      error: qrBase64 ? null : (qrRes.data?.error ? String(qrRes.data.error) : qrRes.text || "QR indisponível"),
      phoneLinkCode: phoneDetailed.code,
      phoneLinkError: phoneDetailed.code ? null : (phoneDetailed.error || "Código phone-code indisponível"),
    },
  };
}

export type ReconnectResult = {
  attempted: boolean;
  ok: boolean;
  phase: string;
  message: string;
  connectedAfter?: boolean;
  details?: Record<string, unknown>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** restore-session → restart → phone-code (fallback wa_old). */
export async function attemptReconnect(force = false): Promise<ReconnectResult> {
  const row = await getInstance();
  if (!row || row.provider !== "zapi" || !instanceConfigured(row)) {
    return { attempted: false, ok: false, phase: "skipped", message: "Instância Z-API não configurada." };
  }
  const creds = credsFromRow(row);
  if (!creds) return { attempted: false, ok: false, phase: "skipped", message: "Credenciais Z-API incompletas." };

  let status = await readLiveStatus(creds);
  if (status.connected) {
    return { attempted: false, ok: true, phase: "already_connected", message: "Já conectado.", connectedAfter: true };
  }

  const restore = await zapiFetch(creds, "restore-session", { method: "GET" });
  await sleep(2500);
  status = await readLiveStatus(creds);
  if (status.connected) {
    return {
      attempted: true,
      ok: true,
      phase: "restore_session",
      message: "Sessão restaurada com sucesso.",
      connectedAfter: true,
      details: { restore: restore.data },
    };
  }

  let restart = await zapiFetch(creds, "restart", { method: "GET" });
  if (!restart.ok) restart = await zapiFetch(creds, "restart", { method: "POST" });
  await sleep(4000);
  status = await readLiveStatus(creds);
  if (status.connected) {
    return {
      attempted: true,
      ok: true,
      phase: "restart",
      message: "Conectado após restart.",
      connectedAfter: true,
      details: { restart: restart.data },
    };
  }

  // MOBILE: registro real (wa_old) — não gerar phone-code WEB (conflita sessão).
  if (creds.type === "mobile") {
    const pairing = await requestMobilePairingCode(row, "auto");
    if (pairing.ok) {
      return {
        attempted: true,
        ok: false,
        phase: "wa_old",
        message: pairing.message || "Pop-up/SMS/voz pedido — confirme no WhatsApp Business do eSIM.",
        connectedAfter: false,
        details: { pairing, force },
      };
    }
    const blocked = pairing.data?.blocked === true;
    const diagnosis = buildMobileConnectionDiagnosis({
      instanceType: "mobile",
      connected: false,
      registrationAvailable: (pairing as any).registration || null,
      requestCodeResult: pairing.data,
      phoneLinkCode: null,
    });
    if (blocked || diagnosis.recommendedPath === "wait_retry_mobile" || diagnosis.recommendedPath === "mobile_unban") {
      return {
        attempted: true,
        ok: false,
        phase: "mobile_registration_blocked",
        message: diagnosis.summaryPt,
        connectedAfter: false,
        details: {
          pairing,
          diagnosis,
          force,
          note: "Mantendo fluxo MOBILE (pop-up/SMS/voz). Não usar phone-code de 8 letras.",
        },
      };
    }
    return {
      attempted: true,
      ok: false,
      phase: "wa_old",
      message: pairing.error || "Falha no registro mobile.",
      connectedAfter: false,
      details: { pairing, diagnosis, force },
    };
  }

  const phoneLinkCode = await fetchPhoneLinkCode(row);

  if (phoneLinkCode) {
    return {
      attempted: true,
      ok: false,
      phase: "phone_code",
      message: `No WhatsApp Business (eSIM): Aparelhos conectados → Conectar → Vincular com número → código ${phoneLinkCode}`,
      connectedAfter: false,
      details: { phoneLinkCode, fallback: "phone-code", force },
    };
  }

  return {
    attempted: true,
    ok: false,
    phase: "failed",
    message: "Não foi possível reconectar automaticamente. Use o painel Z-API ou QR Code abaixo.",
    connectedAfter: false,
    details: { restore: restore.data, restart: restart.data },
  };
}

export async function bootstrapConnection(instanceId?: string | null, force = true) {
  const row = await getInstance(instanceId);
  if (!row || !instanceConfigured(row)) return { error: "WhatsApp não configurado", status: 503 as const };
  const creds = credsFromRow(row);
  if (!creds) return { error: "Credenciais incompletas", status: 503 as const };

  const statusRes = await getConnectionStatus(row.id);
  if (statusRes.status !== 200) return statusRes;
  const status = statusRes.body.status;
  if (status.connected) {
    return {
      status: 200 as const,
      body: {
        phase: "connected",
        message: "Já conectado.",
        status,
        phone: statusRes.body.connectedPhone,
        instanceType: creds.type,
      },
    };
  }

  if (!force) {
    return {
      status: 200 as const,
      body: {
        phase: creds.type === "mobile" ? "needs_code" : "needs_qr",
        message: creds.type === "mobile" ? "Desconectado — use Iniciar conexão." : "Desconectado — escaneie o QR.",
        status,
        instanceType: creds.type,
      },
    };
  }

  const reconnect = await attemptReconnect(true);
  const qr = await getQrAndPhoneCode(row.id);
  const phoneLinkCode = reconnect.details?.phoneLinkCode || qr.body?.phoneLinkCode || null;
  return {
    status: 200 as const,
    body: {
      phase: phoneLinkCode || qr.body?.qrBase64 ? (phoneLinkCode ? "needs_code" : "needs_qr") : "error",
      message: reconnect.message,
      status,
      qrBase64: qr.body?.qrBase64 || null,
      phoneLinkCode,
      instanceType: creds.type,
      reconnect,
    },
  };
}

function normalizeLock(raw: unknown): ReconnectLock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ReconnectLock;
  if (!o.holderId || !o.expiresAt) return null;
  const exp = Date.parse(o.expiresAt);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return o;
}

export async function loadReconnectLock(): Promise<ReconnectLock | null> {
  const client = sb();
  const { data } = await client.from("system_settings").select("value").eq("key", LOCK_KEY).maybeSingle();
  const lock = normalizeLock(data?.value);
  if (lock && Date.parse(lock.expiresAt) <= Date.now()) {
    await client.from("system_settings").delete().eq("key", LOCK_KEY);
    return null;
  }
  return lock;
}

async function persistLock(lock: ReconnectLock | null): Promise<void> {
  const client = sb();
  const now = new Date().toISOString();
  if (!lock) {
    await client.from("system_settings").delete().eq("key", LOCK_KEY);
    return;
  }
  await client.from("system_settings").upsert([{
    key: LOCK_KEY,
    value: lock,
    updated_by: "Z-API Reconnect Lock",
    updated_at: now,
  }], { onConflict: "key" });
}

export async function claimReconnectLock(
  holderId: string,
  holderName: string,
  options: { force?: boolean } = {},
) {
  const id = String(holderId || "").trim();
  const name = String(holderName || "").trim() || "Usuário";
  if (!id) return { ok: false, lock: null, reason: "Usuário inválido" };

  const current = await loadReconnectLock();
  if (current && current.holderId !== id && !options.force) {
    return { ok: false, lock: current, reason: `${current.holderName} já está reconectando o bot.` };
  }

  const lock: ReconnectLock = {
    holderId: id,
    holderName: name,
    acquiredAt: current?.holderId === id && !options.force ? current.acquiredAt : new Date().toISOString(),
    expiresAt: new Date(Date.now() + RECONNECT_LOCK_TTL_MS).toISOString(),
    phase: options.force ? "claimed" : (current?.holderId === id ? (current.phase || "claimed") : "claimed"),
    phoneLinkCode: options.force ? null : (current?.holderId === id ? current.phoneLinkCode : null),
    reconnectMessage: options.force ? null : (current?.holderId === id ? current.reconnectMessage : null),
  };
  await persistLock(lock);
  return { ok: true, lock, tookOver: options.force && !!current && current.holderId !== id };
}

export async function heartbeatReconnectLock(holderId: string): Promise<ReconnectLock | null> {
  const id = String(holderId || "").trim();
  const current = await loadReconnectLock();
  if (!current || current.holderId !== id) return current;
  const lock: ReconnectLock = {
    ...current,
    expiresAt: new Date(Date.now() + RECONNECT_LOCK_TTL_MS).toISOString(),
  };
  await persistLock(lock);
  return lock;
}

export async function updateReconnectLock(
  holderId: string,
  patch: Partial<Pick<ReconnectLock, "phase" | "phoneLinkCode" | "reconnectMessage">>,
): Promise<ReconnectLock | null> {
  const id = String(holderId || "").trim();
  const current = await loadReconnectLock();
  if (!current || current.holderId !== id) return current;
  const lock: ReconnectLock = {
    ...current,
    ...patch,
    expiresAt: new Date(Date.now() + RECONNECT_LOCK_TTL_MS).toISOString(),
  };
  await persistLock(lock);
  return lock;
}

export async function releaseReconnectLock(holderId: string, force = false): Promise<void> {
  const id = String(holderId || "").trim();
  const current = await loadReconnectLock();
  if (!current) return;
  if (!force && current.holderId !== id) return;
  await persistLock(null);
}

export type ConnectionTestResult = {
  ok: boolean;
  instanceId: string;
  slug: string;
  provider: string;
  apiReachable: boolean;
  connected: boolean;
  connectedPhone: string | null;
  expectedPhone: string;
  phoneMatchesOfficial: boolean;
  message: string;
  checkedAt: string;
};

export async function testInstanceConnection(instanceId: string): Promise<
  { status: 200 | 502; body: ConnectionTestResult } | { status: 400 | 404 | 503; error: string }
> {
  const row = await getInstance(instanceId);
  if (!row) return { status: 404, error: "Instância não encontrada" };
  if (!instanceConfigured(row)) return { status: 503, error: "Instância incompleta ou desativada" };
  if (row.provider !== "zapi") return { status: 400, error: "Provider não suportado neste handler leve" };

  const creds = credsFromRow(row);
  if (!creds) return { status: 503, error: "Credenciais Z-API incompletas" };

  const expected = officialPhoneParts(row).full;
  const checkedAt = new Date().toISOString();
  let apiReachable = false;
  let connected = false;
  let statusError: string | undefined;
  let statusRaw: Record<string, unknown> | null = null;
  let connectedPhone: string | null = null;

  try {
    const statusRes = await zapiFetch(creds, "status", { method: "GET" });
    apiReachable = statusRes.ok || !!statusRes.data;
    statusRaw = statusRes.data;
    connected = isZapiSessionConnected(statusRes.data, creds.type);
    if (statusRes.data?.error) statusError = String(statusRes.data.error);
    if (connected) {
      const dev = await zapiFetch(creds, "device", { method: "GET" });
      if (dev.ok && dev.data) {
        connectedPhone = String(dev.data.phone || dev.data?.device || dev.data?.wid || "").replace(/\D/g, "") || null;
      }
    }
  } catch (e: unknown) {
    statusError = e instanceof Error ? e.message : "Erro de rede";
  }

  const phoneMatchesOfficial = connectedPhone === expected;
  const ok = apiReachable && connected && phoneMatchesOfficial;

  let message = "";
  if (!apiReachable) {
    const err = sanitizeWhatsappError(statusError) || statusError;
    message = err
      || "Z-API não respondeu — confira Instance ID, Token e Client-Token na Vercel.";
  } else if (!connected) {
    const err = sanitizeWhatsappError(statusError) || statusError;
    message = err ? `Desconectado: ${err}` : "Desconectado — gere código de vinculação no eSIM.";
  } else if (!phoneMatchesOfficial) {
    message = `Conectado em ${connectedPhone}, esperado ${expected}.`;
  } else {
    message = `Conectado no número oficial (${expected}).`;
  }

  // Z-API com Client-Token inválido: apiReachable pode ser true (respondeu JSON de erro).
  if (statusError && /client-token/i.test(statusError)) {
    message = sanitizeWhatsappError(statusError) || message;
  }

  const client = sb();
  const now = checkedAt;
  await client.from("whatsapp_instances").update({
    last_checked_at: now,
    last_heartbeat_at: now,
    last_connected: connected,
    last_connected_phone: connectedPhone,
    phone_matches_official: phoneMatchesOfficial,
    last_error: ok ? null : message,
    last_status_raw: statusRaw,
    ...(connected ? { last_connected_at: now } : {}),
    updated_at: now,
    ...(looksLikeZapiSecret(row.label) ? { label: safeWhatsappInstanceLabel(row.label) } : {}),
  }).eq("id", row.id);

  return {
    status: ok ? 200 : 502,
    body: {
      ok,
      instanceId: row.id,
      slug: row.slug,
      provider: row.provider,
      apiReachable,
      connected,
      connectedPhone,
      expectedPhone: expected,
      phoneMatchesOfficial,
      message,
      checkedAt,
    },
  };
}

function normalizeModalDismiss(raw: unknown): ModalDismissRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ModalDismissRecord;
  if (!o.at || !o.userId) return null;
  return {
    at: String(o.at),
    userId: String(o.userId),
    userName: String(o.userName || "Usuário"),
    incidentStartedAt: typeof o.incidentStartedAt === "string" ? o.incidentStartedAt : null,
  };
}

export function isModalDismissedForIncident(
  dismiss: ModalDismissRecord | null,
  incidentStartedAt: string | null,
  online: boolean,
): boolean {
  if (online || !dismiss) return false;
  const cur = incidentStartedAt ?? null;
  const rec = dismiss.incidentStartedAt ?? null;
  return cur === rec;
}

export async function loadModalDismiss(): Promise<ModalDismissRecord | null> {
  const client = sb();
  const { data } = await client.from("system_settings").select("value").eq("key", MODAL_DISMISS_KEY).maybeSingle();
  return normalizeModalDismiss(data?.value);
}

export async function clearModalDismiss(): Promise<void> {
  const client = createSupabaseAdminClient();
  if (!client) return;
  await client.from("system_settings").delete().eq("key", MODAL_DISMISS_KEY);
}

export async function dismissReconnectModal(userId: string, userName: string): Promise<ModalDismissRecord> {
  const client = sb();
  const { data: watchRow } = await client
    .from("system_settings")
    .select("value")
    .eq("key", "zapi_watchdog_state")
    .maybeSingle();
  const watch = watchRow?.value && typeof watchRow.value === "object"
    ? watchRow.value as { incidentStartedAt?: string | null }
    : {};
  const record: ModalDismissRecord = {
    at: new Date().toISOString(),
    userId: String(userId || "").trim(),
    userName: String(userName || "").trim() || "Usuário",
    incidentStartedAt: typeof watch.incidentStartedAt === "string" ? watch.incidentStartedAt : null,
  };
  await client.from("system_settings").upsert([{
    key: MODAL_DISMISS_KEY,
    value: record,
    updated_by: record.userName,
    updated_at: record.at,
  }], { onConflict: "key" });
  return record;
}

export async function getBotStatusSnapshot() {
  await ensureWhatsappInstancesFromEnv().catch(() => { /* tabela pode não existir ainda */ });
  const client = sb();
  const [{ data: inst }, { data: lockRow }, { data: watchRow }, { data: dismissRow }] = await Promise.all([
    client.from("whatsapp_instances").select("id,label,last_connected,last_error,enabled,is_default").eq("is_default", true).maybeSingle(),
    client.from("system_settings").select("value").eq("key", LOCK_KEY).maybeSingle(),
    client.from("system_settings").select("value").eq("key", "zapi_watchdog_state").maybeSingle(),
    client.from("system_settings").select("value").eq("key", MODAL_DISMISS_KEY).maybeSingle(),
  ]);

  const online = inst?.enabled !== false && inst?.last_connected === true;
  const watch = watchRow?.value && typeof watchRow.value === "object"
    ? watchRow.value as { incidentOpen?: boolean; incidentStartedAt?: string | null }
    : {};
  const lock = normalizeLock(lockRow?.value);
  const modalDismiss = normalizeModalDismiss(dismissRow?.value);
  const incidentStartedAt = typeof watch.incidentStartedAt === "string" ? watch.incidentStartedAt : null;

  const rawLabel = inst?.label || null;
  const label = safeWhatsappInstanceLabel(rawLabel);
  const lastError = sanitizeWhatsappError(inst?.last_error);

  if (inst?.id && rawLabel && looksLikeZapiSecret(rawLabel)) {
    void client.from("whatsapp_instances").update({
      label: WHATSAPP_BOT_DISPLAY_NAME,
      last_error: sanitizeWhatsappError(inst.last_error),
      updated_at: new Date().toISOString(),
    }).eq("id", inst.id);
  }

  return {
    configured: !!inst,
    online,
    label,
    lastError,
    incidentOpen: watch.incidentOpen === true || !online,
    lock,
    modalDismissed: isModalDismissedForIncident(modalDismiss, incidentStartedAt, online),
    modalDismissedBy: modalDismiss?.userName || null,
  };
}
