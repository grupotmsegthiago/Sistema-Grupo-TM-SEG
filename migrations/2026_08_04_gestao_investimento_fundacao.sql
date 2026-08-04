-- ============================================================================
-- Gestão Investimento — Fase 2 (fundação)
-- Perfil do investidor, carteira manual, watchlist, limites, fontes e auditoria.
--
-- NÃO aplicar em produção sem autorização explícita.
-- Como aplicar (após OK): Supabase Studio → SQL Editor → RUN
--   ou: node scripts/apply-gestao-investimento-migration.mjs (quando existir)
--
-- A IA NÃO está autorizada a comprar, vender, resgatar ou transferir.
-- Meta 1,5%–2% a.m. é objetivo agressivo (~19,6%–26,8% a.a. compostos), não garantia.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Perfil do investidor (bloqueia recomendações personalizadas se incompleto)
CREATE TABLE IF NOT EXISTS public.investor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  person_type TEXT CHECK (person_type IN ('PF', 'PJ')),
  capital_available NUMERIC(18,2),
  emergency_reserve NUMERIC(18,2),
  max_per_investment NUMERIC(18,2),
  horizon_months INTEGER,
  liquidity_need TEXT CHECK (liquidity_need IN ('D0', 'D1', 'D30', 'D90', 'ILLIQUID_OK')),
  max_loss_pct NUMERIC(8,4),
  risk_profile TEXT CHECK (risk_profile IN ('conservador', 'moderado', 'arrojado', 'agressivo')),
  exp_equity BOOLEAN,
  exp_private_credit BOOLEAN,
  exp_fii BOOLEAN,
  exp_crypto BOOLEAN,
  needs_monthly_income BOOLEAN,
  monthly_income_amount NUMERIC(18,2),
  restricted_sectors TEXT DEFAULT '',
  restricted_institutions TEXT DEFAULT '',
  investor_category TEXT CHECK (investor_category IN ('geral', 'qualificado', 'profissional')),
  allows_crypto BOOLEAN DEFAULT FALSE,
  allows_international BOOLEAN DEFAULT FALSE,
  monthly_target_pct_min NUMERIC(8,4) DEFAULT 1.5,
  monthly_target_pct_max NUMERIC(8,4) DEFAULT 2.0,
  broker_default TEXT DEFAULT 'XP',
  notes TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  data_reference_at TIMESTAMPTZ,
  analysis_model TEXT,
  prompt_version TEXT,
  integrity_hash TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_investor_profiles_owner
  ON public.investor_profiles (owner_user_id);

-- Portfólio lógico (um por dono na Fase 2)
CREATE TABLE IF NOT EXISTS public.investment_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Carteira XP',
  base_currency TEXT NOT NULL DEFAULT 'BRL',
  broker TEXT DEFAULT 'XP',
  monitored_capital NUMERIC(18,2) DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

-- Posições manuais (XP etc.)
CREATE TABLE IF NOT EXISTS public.investment_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  portfolio_id UUID REFERENCES public.investment_portfolios(id) ON DELETE SET NULL,
  instrument_name TEXT NOT NULL,
  instrument_code TEXT DEFAULT '',
  instrument_type TEXT NOT NULL DEFAULT 'outros',
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  avg_price NUMERIC(18,6) NOT NULL DEFAULT 0,
  current_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  entry_date DATE,
  broker TEXT DEFAULT 'XP',
  taxation_notes TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  data_reference_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_positions_owner_active
  ON public.investment_positions (owner_user_id, is_active);

-- Watchlist
CREATE TABLE IF NOT EXISTS public.investment_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  instrument_name TEXT NOT NULL,
  instrument_code TEXT DEFAULT '',
  instrument_type TEXT NOT NULL DEFAULT 'outros',
  notes TEXT DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'observar'
    CHECK (status IN ('observar', 'candidato', 'evitar')),
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_watchlists_owner
  ON public.investment_watchlists (owner_user_id);

-- Limites de diversificação / risco
CREATE TABLE IF NOT EXISTS public.investment_risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  max_pct_per_asset NUMERIC(8,4) DEFAULT 20,
  max_pct_per_issuer NUMERIC(8,4) DEFAULT 25,
  max_pct_per_institution NUMERIC(8,4) DEFAULT 40,
  max_pct_per_class NUMERIC(8,4) DEFAULT 40,
  max_pct_illiquid NUMERIC(8,4) DEFAULT 15,
  max_pct_private_credit NUMERIC(8,4) DEFAULT 20,
  max_pct_fx NUMERIC(8,4) DEFAULT 10,
  max_pct_crypto NUMERIC(8,4) DEFAULT 0,
  min_cash_pct NUMERIC(8,4) DEFAULT 5,
  emergency_reserve_untouchable BOOLEAN DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

-- Fontes de dados (cadastro — coleta vem nas fases seguintes)
CREATE TABLE IF NOT EXISTS public.investment_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  reliability TEXT NOT NULL DEFAULT 'media'
    CHECK (reliability IN ('alta', 'media', 'baixa', 'oficial')),
  license_notes TEXT DEFAULT '',
  last_collected_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.investment_data_sources (code, name, url, reliability, license_notes)
VALUES
  ('tesouro', 'Tesouro Direto', 'https://www.tesourodireto.com.br', 'oficial', 'Fonte oficial'),
  ('bcb', 'Banco Central do Brasil', 'https://www.bcb.gov.br', 'oficial', 'Fonte oficial'),
  ('cvm', 'CVM', 'https://www.gov.br/cvm', 'oficial', 'Fonte oficial'),
  ('anbima', 'ANBIMA', 'https://www.anbima.com.br', 'oficial', 'Fonte oficial'),
  ('b3', 'B3', 'https://www.b3.com.br', 'oficial', 'Fonte oficial'),
  ('ibge', 'IBGE', 'https://www.ibge.gov.br', 'oficial', 'Fonte oficial'),
  ('manual_xp', 'Lançamento manual XP', '', 'media', 'Posições informadas pelo investidor')
ON CONFLICT (code) DO NOTHING;

-- Auditoria imutável (append-only na prática da aplicação)
CREATE TABLE IF NOT EXISTS public.investment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB DEFAULT '{}'::jsonb,
  integrity_hash TEXT,
  source TEXT DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_audit_log_owner_created
  ON public.investment_audit_log (owner_user_id, created_at DESC);

-- RLS: módulo restrito — service role (API) bypassa, anon sem acesso amplo.
ALTER TABLE public.investor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura autenticada apenas das fontes (não sensível)
DROP POLICY IF EXISTS "Authenticated read investment_data_sources" ON public.investment_data_sources;
CREATE POLICY "Authenticated read investment_data_sources"
  ON public.investment_data_sources
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.investor_profiles IS
  'Perfil do investidor — Gestão Investimento. Sem perfil completo não há recomendação personalizada.';
COMMENT ON TABLE public.investment_positions IS
  'Posições manuais (ex.: XP). Sem execução automática de ordens.';
COMMENT ON TABLE public.investment_audit_log IS
  'Auditoria de análises, alterações de perfil/carteira e decisões humanas.';

-- Recarrega cache do PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
