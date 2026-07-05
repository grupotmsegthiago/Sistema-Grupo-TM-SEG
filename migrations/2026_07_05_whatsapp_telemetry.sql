-- Telemetria WhatsApp (Z-API) — outbound + sessão/vigia
-- Idempotente. Também aplicada automaticamente via runWhatsappTelemetryMigrations().

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

NOTIFY pgrst, 'reload schema';
