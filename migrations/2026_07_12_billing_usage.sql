-- ============================================================================
-- Monitoramento de custos de IA / Cursor (billing_usage)
-- Executar no Supabase SQL Editor (uma vez) ou via scripts/apply-billing-usage-migration.mjs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_month TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cursor_stripe', 'cursor_dashboard', 'gemini', 'agent_token', 'manual', 'sync')),
  external_id TEXT,
  token_id TEXT,
  summary TEXT NOT NULL,
  amount_usd NUMERIC(12, 4) DEFAULT 0,
  exchange_rate NUMERIC(8, 4) NOT NULL DEFAULT 5.50,
  iof_pct NUMERIC(6, 4) NOT NULL DEFAULT 4.38,
  amount_brl NUMERIC(12, 2) NOT NULL,
  plan_balance_brl NUMERIC(12, 2),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_month
  ON public.billing_usage (reference_month, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_usage_token
  ON public.billing_usage (token_id, recorded_at DESC)
  WHERE token_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_usage_external
  ON public.billing_usage (source, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON TABLE public.billing_usage IS
  'Log de custos de IA (Cursor/Stripe, Gemini, tokens de agente) convertidos para BRL';

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for billing_usage" ON public.billing_usage;
CREATE POLICY "Allow all for billing_usage" ON public.billing_usage
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
