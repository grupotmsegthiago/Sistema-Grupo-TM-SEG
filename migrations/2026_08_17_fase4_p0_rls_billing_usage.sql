-- F4-P0-RLS piloto — somente public.billing_usage
-- SQL auditado em docs/auditoria/F4_P0_RLS_PLANO_SQL_NAO_EXECUTAR.md (Fase RLS-0).
-- Nenhuma policy para anon/authenticated: deny-by-default.
-- service_role mantém bypass para dashboard, cron e logging.

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for billing_usage" ON public.billing_usage;
