-- Fase 4 RH RLS — lockdown de public.rh_employee_documents.
-- Preparada para revisão. NÃO APLICAR sem autorização explícita.

BEGIN;

DO $$
DECLARE
  rls_enabled boolean;
  force_rls boolean;
  policy_total integer;
  expected_policy_total integer;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO rls_enabled, force_rls
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'rh_employee_documents'
     AND c.relkind = 'r';

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Drift em public.rh_employee_documents: tabela ausente ou RLS não habilitado';
  END IF;

  IF force_rls IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'Drift em public.rh_employee_documents: FORCE ROW LEVEL SECURITY inesperado';
  END IF;

  SELECT count(*)
    INTO policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'rh_employee_documents';

  SELECT count(*)
    INTO expected_policy_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'rh_employee_documents'
     AND policyname = 'Allow all for rh_employee_documents'
     AND permissive = 'PERMISSIVE'
     AND cmd = 'ALL'
     AND roles @> ARRAY['anon', 'authenticated']::name[]
     AND roles <@ ARRAY['anon', 'authenticated']::name[]
     AND qual = 'true'
     AND with_check = 'true';

  IF policy_total = 0 THEN
    RETURN;
  END IF;

  IF policy_total <> 1 OR expected_policy_total <> 1 THEN
    RAISE EXCEPTION
      'Drift em policies de public.rh_employee_documents: total=%, esperada=%',
      policy_total,
      expected_policy_total;
  END IF;
END
$$;

DROP POLICY IF EXISTS "Allow all for rh_employee_documents"
  ON public.rh_employee_documents;

COMMIT;
