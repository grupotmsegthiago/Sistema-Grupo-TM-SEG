-- ROLLBACK F4-P0-RLS — financial_transaction_payments.
-- Preparado para revisão. NÃO EXECUTAR sem autorização explícita.

BEGIN;

DO $$
DECLARE
  rls_enabled boolean;
  policy_total integer;
BEGIN
  SELECT c.relrowsecurity
    INTO rls_enabled
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'financial_transaction_payments'
     AND c.relkind = 'r';

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Drift em public.financial_transaction_payments: tabela ausente ou RLS não habilitado';
  END IF;

  SELECT count(*)
    INTO policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'financial_transaction_payments';

  IF policy_total <> 0 THEN
    RAISE EXCEPTION
      'Drift no rollback de public.financial_transaction_payments: esperado 0 policies, encontrado %',
      policy_total;
  END IF;
END
$$;

ALTER TABLE public.financial_transaction_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for financial_transaction_payments"
  ON public.financial_transaction_payments
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
