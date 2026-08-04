-- ============================================================================
-- Gestão TI / Gestor de Desenvolvimento — modelo de fundação (Fase 2)
-- ============================================================================
-- STATUS: PREPARADO PARA REVISÃO — NÃO APLICAR em local, preview ou produção
--         sem autorização expressa (Fase 9 / migration).
--
-- Modelo consolidado (7 tabelas) em vez de ~19 propostas iniciais.
-- Justificativa: ver migrations/2026_08_04_gestao_ti_modelo.md
--
-- A IA NÃO está autorizada a aplicar este SQL automaticamente.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Catálogo versionado (módulos, conexões, SSOT, health defs) como documentos versionados
CREATE TABLE IF NOT EXISTS public.system_catalog_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'build', 'manual')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Definições de health checks + última configuração
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  path TEXT NOT NULL,
  module_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  timeout_ms INTEGER NOT NULL DEFAULT 8000,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resultados de health (série temporal; retenção via job futuro)
CREATE TABLE IF NOT EXISTS public.system_health_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_code TEXT NOT NULL,
  ok BOOLEAN,
  tone TEXT NOT NULL CHECK (tone IN ('green', 'yellow', 'red', 'gray', 'blue')),
  status_code INTEGER,
  latency_ms INTEGER,
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_results_check_time
  ON public.system_health_results (check_code, checked_at DESC);

-- Incidentes (cabeçalho)
CREATE TABLE IF NOT EXISTS public.system_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'investigando', 'conhecido', 'silenciado', 'resolvido', 'encerrado')),
  impact TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_deployment TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_incidents_status_sev
  ON public.system_incidents (status, severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_incidents_fingerprint
  ON public.system_incidents (fingerprint);

-- Timeline polimórfica do incidente (eventos, evidências, hipóteses, ações, prompts)
CREATE TABLE IF NOT EXISTS public.system_incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.system_incidents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'event', 'evidence', 'hypothesis', 'action', 'prompt', 'note', 'status_change'
  )),
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_incident_timeline_inc
  ON public.system_incident_timeline (incident_id, created_at DESC);

-- Deployments / releases correlacionáveis
CREATE TABLE IF NOT EXISTS public.system_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id TEXT NOT NULL,
  version TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  provider TEXT NOT NULL DEFAULT 'vercel',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, build_id)
);

-- Auditoria imutável do módulo Gestão TI (append-only na prática da app)
CREATE TABLE IF NOT EXISTS public.system_ti_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_ti_audit_created
  ON public.system_ti_audit_log (created_at DESC);

-- RLS: módulo restrito — service role (API) bypassa.
-- Políticas permissivas NÃO devem ser "Allow all" em produção futura.
ALTER TABLE public.system_catalog_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_incident_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_ti_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.system_catalog_snapshots IS
  'Snapshots versionados do mapa/catálogo do Gestor de Desenvolvimento. NÃO aplicar sem autorização.';
COMMENT ON TABLE public.system_incidents IS
  'Incidentes técnicos — deduplicados por fingerprint. Sem segredos em payload.';
COMMENT ON TABLE public.system_incident_timeline IS
  'Consolida eventos/evidências/hipóteses/ações/prompts (evita 5+ tabelas espelhadas).';
