-- ROLLBACK F4-P0-RLS — account_balance_snapshots.
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

  IF policy_total <> 0 THEN
    RAISE EXCEPTION
      'Drift no rollback de public.account_balance_snapshots: esperado 0 policies, encontrado %',
      policy_total;
  END IF;
END
$$;

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for account_balance_snapshots"
  ON public.account_balance_snapshots
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
