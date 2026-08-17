-- ROLLBACK exato F4-P0-RLS piloto — somente public.billing_usage
-- Restaura a policy versionada anterior. Não toca em outra tabela.

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for billing_usage" ON public.billing_usage;
CREATE POLICY "Allow all for billing_usage"
  ON public.billing_usage
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
