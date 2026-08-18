-- F4-P0-RLS — lockdown de account_balance_snapshots.
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
     AND c.relname = 'account_balance_snapshots'
     AND c.relkind = 'r';

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Drift em public.account_balance_snapshots: tabela ausente ou RLS não habilitado';
  END IF;

  SELECT count(*)
    INTO policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'account_balance_snapshots';

  SELECT count(*)
    INTO expected_policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'account_balance_snapshots'
     AND policyname = 'Allow all for account_balance_snapshots'
     AND permissive = 'PERMISSIVE'
     AND cmd = 'ALL'
     AND roles @> ARRAY['anon', 'authenticated']::name[]
     AND roles <@ ARRAY['anon', 'authenticated']::name[]
     AND qual = 'true'
     AND with_check = 'true';

  IF policy_total <> 1 OR expected_policy_total <> 1 THEN
    RAISE EXCEPTION
      'Drift em policies de public.account_balance_snapshots: total=%, esperada=%',
      policy_total,
      expected_policy_total;
  END IF;
END
$$;

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY "Allow all for account_balance_snapshots"
  ON public.account_balance_snapshots;

COMMIT;
