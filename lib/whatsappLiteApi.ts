/**
 * Operações WhatsApp/Z-API para handlers serverless leves (sem Express).
 */
import { createSupabaseAdminClient } from "./supabaseAdmin.js";
import {
  getZapiMobileEnvCreds,
  hasExplicitZapiMobileEnv,
  OFFICIAL_BOT_PHONE_LOCAL,
  WHATSAPP_BOT_DISPLAY_NAME,
} from "./zapiMobileEnv.js";

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
export const RECONNECT_LOCK_TTL_MS = 10 * 60 * 1000;

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
    has_zapi_token: !!zapi_token,
    has_meta_token: !!meta_access_token,
    zapi_token_masked: zapi_token ? maskSecret(zapi_token) : undefined,
  };
}

export function credsFromRow(row: InstanceRow): ZapiCreds | null {
  if (!row.zapi_instance_id || !row.zapi_token) return null;
  const dbClient = String(row.zapi_client_token || "").trim();
  const envClient = String(process.env.ZAPI_CLIENT_TOKEN || "").trim();
  return {
    instance: row.zapi_instance_id,
    token: row.zapi_token,
    clientToken: dbClient || envClient,
    type: row.instance_type === "mobile" ? "mobile" : "web",
  };
}

export function officialPhoneParts(row: Pick<InstanceRow, "official_ddi" | "official_phone">) {
  const ddi = String(row.official_ddi || "55").replace(/\D/g, "");
  const phone = String(row.official_phone || "").replace(/\D/g, "");
  const full = phone.startsWith(ddi) ? phone : `${ddi}${phone}`;
  return { ddi, phone, full };
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

  const client = sb();
  const phone = (process.env.ZAPI_OFFICIAL_PHONE || process.env.META_WHATSAPP_DISPLAY_PHONE || OFFICIAL_BOT_PHONE_LOCAL)
    .replace(/\D/g, "")
    .replace(/^55/, "");

  const type = hasExplicitZapiMobileEnv() || (process.env.ZAPI_INSTANCE_TYPE || "mobile").toLowerCase() !== "web"
    ? "mobile" as const
    : "web" as const;

  const payload: Record<string, unknown> = {
    provider: "zapi",
    instance_type: type,
    zapi_instance_id: envCreds.instanceId,
    zapi_token: envCreds.token,
    label: envCreds.label || WHATSAPP_BOT_DISPLAY_NAME,
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
      label: payload.label,
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
    await client.from("whatsapp_instances").update({ ...payload, is_default: true }).eq("id", first.id);
    await client.from("whatsapp_instances").update({ is_default: false }).neq("id", first.id);
  }
}

export async function listInstances(): Promise<InstanceRow[]> {
  await ensureWhatsappInstancesFromEnv();
  const { data, error } = await sb().from("whatsapp_instances").select("*").order("label");
  if (error) throw new Error(error.message);
  return (data || []) as InstanceRow[];
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

export function instanceConfigured(row: InstanceRow): boolean {
  if (row.provider === "zapi") return !!(row.zapi_instance_id && row.zapi_token);
  if (row.provider === "meta") return !!(row.meta_phone_number_id && row.meta_access_token);
  return row.provider === "mock";
}

async function readLiveStatus(creds: ZapiCreds) {
  const { ok, data } = await zapiFetch(creds, "status", { method: "GET" });
  const connected = data?.connected === true && data?.smartphoneConnected !== false;
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
    connected: data?.connected === true && data?.smartphoneConnected !== false,
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

  const official = officialPhoneParts(row).full;
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
    },
  };
}

export async function fetchPhoneLinkCode(row: InstanceRow): Promise<string | null> {
  const creds = credsFromRow(row);
  if (!creds) return null;
  const { full } = officialPhoneParts(row);
  const { ok, data } = await zapiFetch(creds, `phone-code/${full}`, { method: "GET" });
  if (!ok || !data) return null;
  return String(data.code || data.value || "").trim() || null;
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
  const phoneLinkCode = await fetchPhoneLinkCode(row);
  return {
    status: 200 as const,
    body: {
      qrBase64,
      error: qrBase64 ? null : (qrRes.data?.error ? String(qrRes.data.error) : qrRes.text || "QR indisponível"),
      phoneLinkCode,
      phoneLinkError: phoneLinkCode ? null : "Código phone-code indisponível",
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

export async function claimReconnectLock(holderId: string, holderName: string) {
  const id = String(holderId || "").trim();
  const name = String(holderName || "").trim() || "Usuário";
  if (!id) return { ok: false, lock: null, reason: "Usuário inválido" };

  const current = await loadReconnectLock();
  if (current && current.holderId !== id) {
    return { ok: false, lock: current, reason: `${current.holderName} já está reconectando o bot.` };
  }

  const lock: ReconnectLock = {
    holderId: id,
    holderName: name,
    acquiredAt: current?.holderId === id ? current.acquiredAt : new Date().toISOString(),
    expiresAt: new Date(Date.now() + RECONNECT_LOCK_TTL_MS).toISOString(),
    phase: current?.holderId === id ? (current.phase || "claimed") : "claimed",
    phoneLinkCode: current?.holderId === id ? current.phoneLinkCode : null,
    reconnectMessage: current?.holderId === id ? current.reconnectMessage : null,
  };
  await persistLock(lock);
  return { ok: true, lock };
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

export async function getBotStatusSnapshot() {
  await ensureWhatsappInstancesFromEnv().catch(() => { /* tabela pode não existir ainda */ });
  const client = sb();
  const [{ data: inst }, { data: lockRow }, { data: watchRow }] = await Promise.all([
    client.from("whatsapp_instances").select("label,last_connected,last_error,enabled,is_default").eq("is_default", true).maybeSingle(),
    client.from("system_settings").select("value").eq("key", LOCK_KEY).maybeSingle(),
    client.from("system_settings").select("value").eq("key", "zapi_watchdog_state").maybeSingle(),
  ]);

  const online = inst?.enabled !== false && inst?.last_connected === true;
  const watch = watchRow?.value && typeof watchRow.value === "object" ? watchRow.value as { incidentOpen?: boolean } : {};
  const lock = normalizeLock(lockRow?.value);

  return {
    configured: !!inst,
    online,
    label: inst?.label || null,
    lastError: inst?.last_error || null,
    incidentOpen: watch.incidentOpen === true || !online,
    lock,
  };
}
