-- ROLLBACK Fase 4 RH RLS — public.rh_employee_bank_accounts.
-- Uso emergencial. NÃO EXECUTAR sem autorização explícita.

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
     AND c.relname = 'rh_employee_bank_accounts'
     AND c.relkind = 'r';

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Drift em public.rh_employee_bank_accounts: tabela ausente ou RLS não habilitado';
  END IF;

  SELECT count(*)
    INTO policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'rh_employee_bank_accounts';

  SELECT count(*)
    INTO expected_policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'rh_employee_bank_accounts'
     AND policyname = 'Allow all for rh_employee_bank_accounts'
     AND permissive = 'PERMISSIVE'
     AND cmd = 'ALL'
     AND roles @> ARRAY['anon', 'authenticated']::name[]
     AND roles <@ ARRAY['anon', 'authenticated']::name[]
     AND qual = 'true'
     AND with_check = 'true';

  IF policy_total = 0 THEN
    EXECUTE
      'CREATE POLICY "Allow all for rh_employee_bank_accounts" '
      'ON public.rh_employee_bank_accounts '
      'FOR ALL TO anon, authenticated '
      'USING (true) WITH CHECK (true)';
    RETURN;
  END IF;

  IF policy_total <> 1 OR expected_policy_total <> 1 THEN
    RAISE EXCEPTION
      'Drift no rollback de public.rh_employee_bank_accounts: total=%, esperada=%',
      policy_total,
      expected_policy_total;
  END IF;
END
$$;

ALTER TABLE public.rh_employee_bank_accounts ENABLE ROW LEVEL SECURITY;

COMMIT;
