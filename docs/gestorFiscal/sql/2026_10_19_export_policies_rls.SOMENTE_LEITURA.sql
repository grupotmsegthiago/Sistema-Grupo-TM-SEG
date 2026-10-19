-- SOMENTE LEITURA.
-- Executar no SQL Editor do Supabase TM SEG, projeto ajhmmjuewdsukecaimik.
-- Não executar em outro projeto. Não altera policy, privilégio, RLS nem dado.

SELECT
  current_database() AS banco,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_users'
  ) AS tem_system_users,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'missions'
  ) AS tem_missions,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_orders'
  ) AS tem_service_orders;

SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_ligada,
  c.relforcerowsecurity AS rls_forcada
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = ANY (ARRAY[
    'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
    'financial_transactions', 'financial_categories', 'financial_invoices',
    'financial_invoice_missions', 'providers', 'financial_accounts'
  ])
ORDER BY c.relname;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
    'financial_transactions', 'financial_categories', 'financial_invoices',
    'financial_invoice_missions', 'providers', 'financial_accounts'
  ])
ORDER BY tablename, policyname;

SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = ANY (ARRAY[
    'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
    'financial_transactions', 'financial_categories', 'financial_invoices',
    'financial_invoice_missions', 'providers', 'financial_accounts'
  ])
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public')
ORDER BY table_name, grantee, privilege_type;
