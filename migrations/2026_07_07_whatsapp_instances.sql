-- Instâncias WhatsApp (credenciais no banco, multi-provider)
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
