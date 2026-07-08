-- ============================================================================
-- Snapshots de saldo de investimento (patrimônio / contas financeiras)
-- Necessário para Vercel serverless sem DATABASE_URL — acesso via Supabase client.
--
-- Como aplicar (uma vez):
--   node scripts/apply-account-balance-snapshots-migration.mjs
-- Ou: Supabase Studio → SQL Editor → RUN
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
  id serial PRIMARY KEY,
  account_id text NOT NULL,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_by text DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_balance_snapshots_account_ts
  ON public.account_balance_snapshots (account_id, recorded_at DESC);

COMMENT ON TABLE public.account_balance_snapshots IS
  'Histórico de saldos informados manualmente em contas de investimento';

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for account_balance_snapshots" ON public.account_balance_snapshots;
CREATE POLICY "Allow all for account_balance_snapshots" ON public.account_balance_snapshots
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
