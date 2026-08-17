-- F4-P0-RLS — lockdown de financial_transaction_payments.
-- Preparada para revisão. NÃO APLICAR sem autorização explícita.

BEGIN;

DO $$
DECLARE
  rls_enabled boolean;
  policy_total integer;
  expected_policy_total integer;
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

  SELECT count(*)
    INTO expected_policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'financial_transaction_payments'
     AND policyname = 'Allow all for financial_transaction_payments'
     AND permissive = 'PERMISSIVE'
     AND cmd = 'ALL'
     AND roles @> ARRAY['anon', 'authenticated']::name[]
     AND roles <@ ARRAY['anon', 'authenticated']::name[]
     AND qual = 'true'
     AND with_check = 'true';

  IF policy_total <> 1 OR expected_policy_total <> 1 THEN
    RAISE EXCEPTION
      'Drift em policies de public.financial_transaction_payments: total=%, esperada=%',
      policy_total,
      expected_policy_total;
  END IF;
END
$$;

ALTER TABLE public.financial_transaction_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY "Allow all for financial_transaction_payments"
  ON public.financial_transaction_payments;

COMMIT;
