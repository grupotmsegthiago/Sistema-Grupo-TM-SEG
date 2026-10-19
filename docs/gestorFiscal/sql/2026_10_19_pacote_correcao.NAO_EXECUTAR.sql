-- NÃO EXECUTAR.
-- Pacote restante do PR 348, projeto ajhmmjuewdsukecaimik.
-- Não apaga linha. Não altera Asaas, comissão TORRES nem cálculo de OS.
-- Aborta se o banco não for o da TM SEG ou se as três marcas da sessão não existirem.
-- service_role precisa continuar com BYPASSRLS. Sem isso, a API autenticada cai.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.system_users') IS NULL
     OR to_regclass('public.missions') IS NULL
     OR to_regclass('public.financial_invoices') IS NULL THEN
    RAISE EXCEPTION 'Banco errado. Este pacote só vale no projeto com system_users, missions e financial_invoices.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'service_role não ignora RLS. O corte parou para não derrubar a API.';
  END IF;

  IF current_setting('tmseg.p0_backup', true) IS DISTINCT FROM 'conferido'
     OR current_setting('tmseg.p0_telas', true) IS DISTINCT FROM 'validadas'
     OR current_setting('tmseg.p0_correcao', true) IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION 'NÃO EXECUTAR. Faltam backup conferido, telas validadas e autorização.';
  END IF;
END
$$;

-- Senha: o anon deixa de ler segredo. As colunas abaixo são as que as telas já pedem.
-- O service_role não entra neste REVOKE.
REVOKE SELECT ON TABLE public.system_users FROM anon, authenticated;
GRANT SELECT (
  id, name, email, status, profile_id, client_id, provider_id,
  permissions, force_password_change, user_type, created_at,
  training_required, training_passed_at, training_modules, training_score
) ON TABLE public.system_users TO anon, authenticated;

-- Dez tabelas: some o anon. Sem policy nova para anon.
-- O navegador dessas tabelas já passa por /api/dados-protegidos com service_role.
DO $$
DECLARE
  tabela text;
  item record;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
    'financial_transactions', 'financial_categories', 'financial_invoices',
    'financial_invoice_missions', 'providers', 'financial_accounts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', tabela);
    FOR item IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tabela
        AND (roles && ARRAY['anon', 'authenticated']::name[] OR roles && ARRAY['public']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.policyname, tabela);
    END LOOP;
  END LOOP;
END
$$;

COMMIT;
