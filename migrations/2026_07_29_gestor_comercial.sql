-- =============================================================================
-- Gestor Comercial IA — Grupo TM SEG
-- =============================================================================
-- SSOT: NÃO duplica clientes, missões, faturamento ou propostas.
-- Tabelas aqui são apenas orquestração comercial (metas, planos, pipeline,
-- agenda, reuniões, parâmetros). Indicadores vêm de missions/clients/quotes.
-- Preparado para futuros gestores (mesmo padrão de auditoria/settings).
-- Executar no Supabase SQL Editor ou via runGcMigrations().
-- =============================================================================

-- Configurações parametrizáveis por gestor (nunca hardcode no app)
CREATE TABLE IF NOT EXISTS gestor_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_key TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gestor_key, setting_key)
);
CREATE INDEX IF NOT EXISTS idx_gestor_settings_key ON gestor_settings (gestor_key);

-- Auditoria genérica dos gestores
CREATE TABLE IF NOT EXISTS gestor_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_key TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  action_type TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  ip_address TEXT,
  old_value JSONB,
  new_value JSONB,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gestor_audit_gestor ON gestor_audit_logs (gestor_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gestor_audit_entity ON gestor_audit_logs (entity, entity_id);

-- Planos de comissão (parametrizáveis)
CREATE TABLE IF NOT EXISTS gc_commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gc_commission_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES gc_commission_plans(id) ON DELETE CASCADE,
  min_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(14,2),
  percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  label TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gc_commission_tiers_plan ON gc_commission_tiers (plan_id);

-- Planos de premiação
CREATE TABLE IF NOT EXISTS gc_award_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Cadastro do comercial (orquestração; vínculo com system_users)
CREATE TABLE IF NOT EXISTS gc_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  full_name TEXT NOT NULL,
  job_title TEXT,
  portfolio_label TEXT,
  supervisor_rep_id UUID,
  admission_date DATE,
  monthly_goal NUMERIC(14,2) NOT NULL DEFAULT 0,
  quarterly_goal NUMERIC(14,2) NOT NULL DEFAULT 0,
  yearly_goal NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_plan_id UUID REFERENCES gc_commission_plans(id),
  award_plan_id UUID REFERENCES gc_award_plans(id),
  commission_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Ativo',
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gc_reps_user ON gc_reps (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_reps_status ON gc_reps (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_reps_name ON gc_reps (full_name) WHERE deleted_at IS NULL;

-- Carteira explícita (complementa clients.created_by — não substitui)
CREATE TABLE IF NOT EXISTS gc_client_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  rep_id UUID NOT NULL REFERENCES gc_reps(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by TEXT,
  notes TEXT,
  UNIQUE (client_id, rep_id)
);
CREATE INDEX IF NOT EXISTS idx_gc_client_owners_rep ON gc_client_owners (rep_id);
CREATE INDEX IF NOT EXISTS idx_gc_client_owners_client ON gc_client_owners (client_id);

-- Metas (por comercial / período) — valores parametrizáveis
CREATE TABLE IF NOT EXISTS gc_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID REFERENCES gc_reps(id) ON DELETE SET NULL,
  period_type TEXT NOT NULL DEFAULT 'monthly',
  period_year INT NOT NULL,
  period_month INT,
  period_quarter INT,
  revenue_goal NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_goal_pct NUMERIC(8,4),
  operations_goal INT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gc_goals_rep_period ON gc_goals (rep_id, period_year, period_month) WHERE deleted_at IS NULL;

-- Pipeline / oportunidades (orquestração CRM; pode vincular quote/client existentes)
CREATE TABLE IF NOT EXISTS gc_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID,
  client_name TEXT,
  rep_id UUID REFERENCES gc_reps(id) ON DELETE SET NULL,
  quote_id UUID,
  stage TEXT NOT NULL DEFAULT 'lead',
  probability_pct NUMERIC(8,4) NOT NULL DEFAULT 10,
  expected_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_close_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'media',
  notes TEXT,
  ai_probability_pct NUMERIC(8,4),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gc_opportunities_rep ON gc_opportunities (rep_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_opportunities_stage ON gc_opportunities (stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_opportunities_client ON gc_opportunities (client_id) WHERE deleted_at IS NULL;

-- Agenda / follow-ups
CREATE TABLE IF NOT EXISTS gc_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES gc_opportunities(id) ON DELETE SET NULL,
  client_id UUID,
  client_name TEXT,
  rep_id UUID REFERENCES gc_reps(id) ON DELETE SET NULL,
  responsible_name TEXT,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'contato',
  due_at TIMESTAMPTZ NOT NULL,
  priority TEXT NOT NULL DEFAULT 'media',
  status TEXT NOT NULL DEFAULT 'pendente',
  outcome TEXT,
  reminder_sent_at TIMESTAMPTZ,
  supervisor_notified_at TIMESTAMPTZ,
  diretoria_notified_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gc_agenda_due ON gc_agenda_items (due_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_agenda_rep ON gc_agenda_items (rep_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_agenda_status ON gc_agenda_items (status) WHERE deleted_at IS NULL;

-- Reuniões
CREATE TABLE IF NOT EXISTS gc_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES gc_opportunities(id) ON DELETE SET NULL,
  client_id UUID,
  client_name TEXT,
  rep_id UUID REFERENCES gc_reps(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes_text TEXT,
  transcript TEXT,
  ai_summary TEXT,
  ai_decisions JSONB DEFAULT '[]'::jsonb,
  ai_tasks JSONB DEFAULT '[]'::jsonb,
  negotiation_score NUMERIC(8,4),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gc_meetings_rep ON gc_meetings (rep_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gc_meetings_client ON gc_meetings (client_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS gc_meeting_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES gc_meetings(id) ON DELETE CASCADE,
  file_name TEXT,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  attachment_kind TEXT NOT NULL DEFAULT 'documento',
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gc_meeting_attachments_meeting ON gc_meeting_attachments (meeting_id) WHERE deleted_at IS NULL;

-- Cache de insights da IA (não é fonte de verdade operacional)
CREATE TABLE IF NOT EXISTS gc_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global',
  rep_id UUID REFERENCES gc_reps(id) ON DELETE CASCADE,
  client_id UUID,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  detail TEXT,
  suggested_actions JSONB DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'rules',
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gc_insights_scope ON gc_insights (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gc_insights_rep ON gc_insights (rep_id, created_at DESC);

-- Seeds de configuração padrão do Gestor Comercial
INSERT INTO gestor_settings (gestor_key, setting_key, setting_value, description)
VALUES
  ('comercial', 'tax_rate_pct', '15', 'Percentual de impostos (DRE gerencial por cliente)'),
  ('comercial', 'min_margin_pct', '20', 'Margem mínima aceitável (%)'),
  ('comercial', 'days_without_contact', '15', 'Dias sem contato para alerta'),
  ('comercial', 'days_followup_overdue', '1', 'Dias de atraso para cobrança automática'),
  ('comercial', 'days_supervisor_alert', '3', 'Dias de atraso para notificar supervisor'),
  ('comercial', 'days_diretoria_alert', '7', 'Dias de atraso crítico para Diretoria'),
  ('comercial', 'days_without_revenue', '30', 'Dias sem faturar para risco'),
  ('comercial', 'pipeline_probabilities', '{"lead":10,"contato":20,"qualificacao":30,"reuniao":40,"proposta":70,"negociacao":85,"contrato":95,"cliente_ativo":100}', 'Probabilidades padrão do pipeline (%)'),
  ('comercial', 'default_monthly_goal', '700000', 'Meta mensal padrão (R$) quando comercial não tiver meta própria'),
  ('comercial', 'alert_emails_diretoria', '["thiago@grupotmseg.com.br"]', 'E-mails da Diretoria para alertas críticos')
ON CONFLICT (gestor_key, setting_key) DO NOTHING;
