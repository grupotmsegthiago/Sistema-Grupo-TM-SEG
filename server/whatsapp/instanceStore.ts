// ── Persistência de instâncias WhatsApp (credenciais no banco) ───────────────

import { createSupabaseAdminClient } from "../supabaseConfig";
import {
  type WhatsappInstanceRecord,
  type WhatsappProviderId,
  type ZapiInstanceType,
} from "./types";

const CACHE_TTL_MS = 30_000;
let cachedDefault: WhatsappInstanceRecord | null = null;
let cachedDefaultAt = 0;

function sb() {
  return createSupabaseAdminClient();
}

function mapRow(r: any): WhatsappInstanceRecord {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    provider: r.provider,
    instance_type: r.instance_type,
    zapi_instance_id: r.zapi_instance_id,
    zapi_token: r.zapi_token,
    zapi_client_token: r.zapi_client_token,
    meta_phone_number_id: r.meta_phone_number_id,
    meta_access_token: r.meta_access_token,
    meta_api_version: r.meta_api_version,
    official_ddi: r.official_ddi || "55",
    official_phone: r.official_phone || "",
    is_default: !!r.is_default,
    enabled: r.enabled !== false,
    last_checked_at: r.last_checked_at,
    last_connected: r.last_connected,
    last_connected_phone: r.last_connected_phone,
    phone_matches_official: r.phone_matches_official,
    last_error: r.last_error,
    last_heartbeat_at: r.last_heartbeat_at,
    last_qr_base64: r.last_qr_base64,
    last_connected_at: r.last_connected_at,
    last_status_raw: r.last_status_raw,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function runWhatsappInstanceMigrations(): Promise<void> {
  const client = sb();
  if (!client) return;
  try {
    await client.rpc("exec_sql", {
      sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_instances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('zapi', 'meta', 'mock')),
        instance_type TEXT CHECK (instance_type IN ('web', 'mobile')),
        zapi_instance_id TEXT,
        zapi_token TEXT,
        zapi_client_token TEXT,
        meta_phone_number_id TEXT,
        meta_access_token TEXT,
        meta_api_version TEXT DEFAULT 'v21.0',
        official_ddi TEXT NOT NULL DEFAULT '55',
        official_phone TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        last_checked_at TIMESTAMPTZ,
        last_connected BOOLEAN,
        last_connected_phone TEXT,
        phone_matches_official BOOLEAN,
        last_error TEXT,
        last_heartbeat_at TIMESTAMPTZ,
        last_qr_base64 TEXT,
        last_connected_at TIMESTAMPTZ,
        last_status_raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_one_default
        ON whatsapp_instances (is_default) WHERE is_default = true;

      CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_slug
        ON whatsapp_instances (slug);
      `,
    });
    await seedDefaultFromEnvIfEmpty();
  } catch (e: any) {
    console.warn("[WhatsApp Instâncias] Migration:", e?.message || e);
  }
}

/** Importa credenciais do .env uma única vez se a tabela estiver vazia. */
export async function seedDefaultFromEnvIfEmpty(): Promise<void> {
  const client = sb();
  if (!client) return;
  const { count } = await client.from("whatsapp_instances").select("id", { count: "exact", head: true });
  if (count && count > 0) return;

  const instanceId = process.env.ZAPI_INSTANCE_ID || "";
  const token = process.env.ZAPI_TOKEN || "";
  if (!instanceId || !token) {
    console.log("[WhatsApp Instâncias] Tabela vazia e sem ZAPI_* no .env — cadastre via Configurações.");
    return;
  }

  const type = (process.env.ZAPI_INSTANCE_TYPE || "web").toLowerCase() === "mobile" ? "mobile" : "web";
  const phone = (process.env.ZAPI_OFFICIAL_PHONE || process.env.META_WHATSAPP_DISPLAY_PHONE || "11926839456")
    .replace(/\D/g, "")
    .replace(/^55/, "");

  await client.from("whatsapp_instances").insert([{
    slug: "central",
    label: "Central TM SEG",
    provider: (process.env.WHATSAPP_PROVIDER || "zapi").toLowerCase() === "meta" ? "meta" : "zapi",
    instance_type: type,
    zapi_instance_id: instanceId,
    zapi_token: token,
    zapi_client_token: process.env.ZAPI_CLIENT_TOKEN || null,
    meta_phone_number_id: process.env.META_WHATSAPP_PHONE_NUMBER_ID || null,
    meta_access_token: process.env.META_WHATSAPP_ACCESS_TOKEN || null,
    meta_api_version: process.env.META_WHATSAPP_API_VERSION || "v21.0",
    official_ddi: process.env.ZAPI_OFFICIAL_DDI || "55",
    official_phone: phone,
    is_default: true,
    enabled: true,
  }]);
  invalidateDefaultCache();
  console.log("[WhatsApp Instâncias] Instância padrão 'central' criada a partir do .env (migração única).");
}

export function invalidateDefaultCache() {
  cachedDefault = null;
  cachedDefaultAt = 0;
}

export async function listWhatsappInstances(): Promise<WhatsappInstanceRecord[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client.from("whatsapp_instances").select("*").order("label");
  return (data || []).map(mapRow);
}

export async function getWhatsappInstanceById(id: string): Promise<WhatsappInstanceRecord | null> {
  const client = sb();
  if (!client) return null;
  const { data } = await client.from("whatsapp_instances").select("*").eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getWhatsappInstanceBySlug(slug: string): Promise<WhatsappInstanceRecord | null> {
  const client = sb();
  if (!client) return null;
  const { data } = await client.from("whatsapp_instances").select("*").eq("slug", slug).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getDefaultWhatsappInstance(force = false): Promise<WhatsappInstanceRecord | null> {
  if (!force && cachedDefault && Date.now() - cachedDefaultAt < CACHE_TTL_MS) return cachedDefault;

  const client = sb();
  if (!client) return envFallbackInstance();

  const { data } = await client.from("whatsapp_instances")
    .select("*")
    .eq("is_default", true)
    .eq("enabled", true)
    .maybeSingle();

  if (data) {
    cachedDefault = mapRow(data);
    cachedDefaultAt = Date.now();
    return cachedDefault;
  }

  const { data: first } = await client.from("whatsapp_instances")
    .select("*")
    .eq("enabled", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (first) {
    cachedDefault = mapRow(first);
    cachedDefaultAt = Date.now();
    return cachedDefault;
  }

  return envFallbackInstance();
}

/** Fallback temporário enquanto não há registro no banco. */
function envFallbackInstance(): WhatsappInstanceRecord | null {
  const instanceId = process.env.ZAPI_INSTANCE_ID || "";
  const token = process.env.ZAPI_TOKEN || "";
  if (!instanceId || !token) return null;
  const now = new Date().toISOString();
  const phone = (process.env.ZAPI_OFFICIAL_PHONE || "11926839456").replace(/\D/g, "").replace(/^55/, "");
  return {
    id: "env-fallback",
    slug: "central",
    label: "Central (env fallback)",
    provider: "zapi",
    instance_type: (process.env.ZAPI_INSTANCE_TYPE || "web") === "mobile" ? "mobile" : "web",
    zapi_instance_id: instanceId,
    zapi_token: token,
    zapi_client_token: process.env.ZAPI_CLIENT_TOKEN || null,
    meta_phone_number_id: null,
    meta_access_token: null,
    meta_api_version: null,
    official_ddi: "55",
    official_phone: phone,
    is_default: true,
    enabled: true,
    last_checked_at: null,
    last_connected: null,
    last_connected_phone: null,
    phone_matches_official: null,
    last_error: null,
    last_heartbeat_at: null,
    last_qr_base64: null,
    last_connected_at: null,
    last_status_raw: null,
    created_at: now,
    updated_at: now,
  };
}

export type UpsertInstanceInput = {
  slug: string;
  label: string;
  provider: WhatsappProviderId;
  instance_type?: ZapiInstanceType | null;
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_client_token?: string | null;
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
  meta_api_version?: string | null;
  official_ddi?: string;
  official_phone?: string;
  is_default?: boolean;
  enabled?: boolean;
};

export async function upsertWhatsappInstance(
  id: string | null,
  input: UpsertInstanceInput,
): Promise<WhatsappInstanceRecord | null> {
  const client = sb();
  if (!client) return null;

  const payload: Record<string, unknown> = {
    slug: input.slug.trim().toLowerCase(),
    label: input.label.trim(),
    provider: input.provider,
    instance_type: input.instance_type ?? null,
    zapi_instance_id: input.zapi_instance_id ?? null,
    zapi_client_token: input.zapi_client_token ?? null,
    meta_phone_number_id: input.meta_phone_number_id ?? null,
    meta_api_version: input.meta_api_version ?? "v21.0",
    official_ddi: input.official_ddi || "55",
    official_phone: String(input.official_phone || "").replace(/\D/g, ""),
    is_default: input.is_default ?? false,
    enabled: input.enabled !== false,
    updated_at: new Date().toISOString(),
  };
  if (input.zapi_token) payload.zapi_token = input.zapi_token;
  if (input.meta_access_token) payload.meta_access_token = input.meta_access_token;

  if (payload.is_default) {
    await client.from("whatsapp_instances").update({ is_default: false }).eq("is_default", true);
  }

  if (id) {
    const { data } = await client.from("whatsapp_instances").update(payload).eq("id", id).select("*").single();
    invalidateDefaultCache();
    return data ? mapRow(data) : null;
  }

  const { data } = await client.from("whatsapp_instances").insert([payload]).select("*").single();
  invalidateDefaultCache();
  return data ? mapRow(data) : null;
}

export async function saveConnectionHealth(
  id: string,
  health: {
    connected: boolean;
    connectedPhone: string | null;
    phoneMatchesOfficial: boolean;
    error: string | null;
    statusRaw?: unknown;
    qrBase64?: string | null;
  },
): Promise<void> {
  const client = sb();
  if (!client || id === "env-fallback") return;
  const now = new Date().toISOString();
  await client.from("whatsapp_instances").update({
    last_checked_at: now,
    last_heartbeat_at: now,
    last_connected: health.connected,
    last_connected_phone: health.connectedPhone,
    phone_matches_official: health.phoneMatchesOfficial,
    last_error: health.error,
    last_status_raw: health.statusRaw ?? null,
    last_qr_base64: health.qrBase64 ?? null,
    last_connected_at: health.connected ? now : undefined,
    updated_at: now,
  }).eq("id", id);
  invalidateDefaultCache();
}

export function instanceConfigured(row: WhatsappInstanceRecord | null): boolean {
  if (!row || !row.enabled) return false;
  if (row.provider === "zapi") return !!(row.zapi_instance_id && row.zapi_token);
  if (row.provider === "meta") return !!(row.meta_phone_number_id && row.meta_access_token);
  if (row.provider === "mock") return true;
  return false;
}
