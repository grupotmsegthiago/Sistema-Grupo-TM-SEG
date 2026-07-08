-- ============================================================================
-- Realtime: garantir que as tabelas novas fazem parte da publicação
-- supabase_realtime (necessário para o postgres_changes emitir eventos).
--
-- Este script é IDEMPOTENTE: ignora silenciosamente tabelas já publicadas
-- e tabelas que ainda não existem no schema.
--
-- Como executar (uma única vez, pelo Supabase Dashboard → SQL Editor):
--   copie/cole este arquivo e clique em RUN.
-- ============================================================================

DO $$
DECLARE
  tbl text;
  target_tables text[] := ARRAY[
    'rh_salary_configs',
    'rh_commissions',
    'rh_awards',
    'rh_bonuses',
    'rh_payroll_items',
    'rh_employee_bank_accounts',
    'rh_employee_documents',
    'rh_warnings',
    'mission_history',
    'provider_escoltistas',
    'provider_intake_vehicles',
    'dhl_supplier_intake_resends',
    'client_registries',
    'client_mission_notes',
    'operational_reports',
    'monitored_processes',
    'system_settings',
    'whatsapp_instances',
    'user_presence'
  ];
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    -- Só age se a tabela existe e ainda não está publicada
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'Realtime publication: tabela % adicionada', tbl;
    ELSE
      RAISE NOTICE 'Realtime publication: tabela % já publicada ou não existe (ok)', tbl;
    END IF;

    -- REPLICA IDENTITY FULL garante que UPDATE/DELETE trazem a linha antiga inteira,
    -- essencial para o cliente reagir corretamente (o Supabase padroniza assim).
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    END IF;
  END LOOP;
END $$;
