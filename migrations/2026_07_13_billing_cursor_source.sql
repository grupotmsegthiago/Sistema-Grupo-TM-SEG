-- Permite source cursor_dashboard (espelho do dashboard Cursor)
ALTER TABLE public.billing_usage DROP CONSTRAINT IF EXISTS billing_usage_source_check;
ALTER TABLE public.billing_usage ADD CONSTRAINT billing_usage_source_check
  CHECK (source IN ('cursor_stripe', 'cursor_dashboard', 'gemini', 'agent_token', 'manual', 'sync'));
