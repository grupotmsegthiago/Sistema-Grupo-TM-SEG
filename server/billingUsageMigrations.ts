import { createSupabaseAdminClient } from './supabaseConfig';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS public.billing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_month TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cursor_stripe', 'gemini', 'agent_token', 'manual', 'sync')),
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
CREATE INDEX IF NOT EXISTS idx_billing_usage_month ON public.billing_usage (reference_month, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_usage_external ON public.billing_usage (source, external_id) WHERE external_id IS NOT NULL;
`;

export async function runBillingUsageMigrations(): Promise<void> {
  const client = createSupabaseAdminClient();
  if (!client) return;
  try {
    await client.rpc('exec_sql', { sql: MIGRATION_SQL });
    console.log('[Billing] Tabela billing_usage verificada.');
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('already exists') || msg.includes('duplicate')) return;
    console.warn('[Billing] Migration:', msg);
  }
}
