-- NÃO EXECUTAR.
-- Projeto ajhmmjuewdsukecaimik. Não apaga linha.
-- Não altera Asaas, comissão TORRES nem cálculo de OS.
--
-- Etapa 1, reconciliada com o catálogo lido em ajhmmjuewdsukecaimik.
-- O RLS já está ativo. Esta etapa só fecha leitura anônima de financeiro
-- e a senha em system_users.
--
-- Não derruba public_access_missions: o postgres_changes da OS ainda depende dela.
-- Não derruba public_access_clients: é ALL para public e as telas de OS ainda gravam cliente.
-- Não derruba tmp_auth_select_all, tmp_auth_insert_all, tmp_auth_update_all
-- nem tmp_auth_delete_all: são do papel authenticated, em várias tabelas, com condição true.

BEGIN;

DO $$
DECLARE
  falta text;
BEGIN
  IF to_regclass('public.system_users') IS NULL
     OR to_regclass('public.missions') IS NULL
     OR to_regclass('public.financial_invoices') IS NULL THEN
    RAISE EXCEPTION 'Banco errado. Este pacote só vale no projeto com system_users, missions e financial_invoices.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'service_role não ignora RLS. O corte parou para não derrubar o login no servidor.';
  END IF;

  IF current_setting('tmseg.p0_backup', true) IS DISTINCT FROM 'conferido'
     OR current_setting('tmseg.p0_telas', true) IS DISTINCT FROM 'validadas'
     OR current_setting('tmseg.p0_correcao', true) IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION 'NÃO EXECUTAR. Faltam backup conferido, homologação das telas e autorização.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[
        'clients', 'financial_accounts', 'financial_invoices',
        'financial_transactions', 'missions', 'system_users'
      ])
      AND c.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'RLS não está ativo numa tabela já confirmada. Pare e reconcilie o catálogo.';
  END IF;

  SELECT string_agg(esperado.nome, ', ')
    INTO falta
  FROM (
    VALUES
      ('public_access_fin_trans', 'financial_transactions'),
      ('public_access_fin_acc', 'financial_accounts'),
      ('financial_invoices_anon_select', 'financial_invoices'),
      ('public_access_users', 'system_users'),
      ('public_access_missions', 'missions')
  ) AS esperado(nome, tabela)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.policyname = esperado.nome
      AND p.tablename = esperado.tabela
      AND p.cmd IN ('SELECT', 'ALL')
      AND (
        p.roles && ARRAY['anon']::name[]
        OR p.roles && ARRAY['public']::name[]
      )
  );

  IF falta IS NOT NULL THEN
    RAISE EXCEPTION 'Catálogo diferente do confirmado (%). Não aplique este arquivo.', falta;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
      AND policyname = 'public_access_clients'
      AND cmd = 'ALL'
      AND roles && ARRAY['public']::name[]
      AND qual = 'true'
      AND with_check = 'true'
  ) THEN
    RAISE EXCEPTION 'public_access_clients não está como ALL para public. Pare e reconcilie.';
  END IF;

  SELECT string_agg(nome, ', ')
    INTO falta
  FROM (
    VALUES
      ('tmp_auth_select_all'),
      ('tmp_auth_insert_all'),
      ('tmp_auth_update_all'),
      ('tmp_auth_delete_all')
  ) AS esperado(nome)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.policyname = esperado.nome
      AND p.roles && ARRAY['authenticated']::name[]
      AND p.qual = 'true'
  );

  IF falta IS NOT NULL THEN
    RAISE EXCEPTION 'Policy temporária ausente ou diferente (%). Não aplique este arquivo.', falta;
  END IF;
END
$$;

REVOKE SELECT ON TABLE public.financial_transactions FROM anon;
REVOKE SELECT ON TABLE public.financial_accounts FROM anon;
REVOKE SELECT ON TABLE public.financial_invoices FROM anon;

DROP POLICY public_access_fin_trans ON public.financial_transactions;
DROP POLICY public_access_fin_acc ON public.financial_accounts;
DROP POLICY financial_invoices_anon_select ON public.financial_invoices;

-- A lista de usuários continua legível sem a senha. O login no servidor usa service_role.
REVOKE SELECT ON TABLE public.system_users FROM anon;
GRANT SELECT (
  id, name, email, status, profile_id, client_id, provider_id,
  permissions, force_password_change, user_type, created_at,
  training_required, training_passed_at, training_modules, training_score
) ON TABLE public.system_users TO anon;

DROP POLICY public_access_users ON public.system_users;
CREATE POLICY system_users_tela_select
  ON public.system_users
  FOR SELECT
  TO anon
  USING (true);

-- Etapa 2, de propósito fora deste arquivo:
-- public_access_missions, depois de o tempo real da OS deixar de depender do anon.
-- public_access_clients, depois de a OS gravar cliente só pela API.
-- tmp_auth_* do papel authenticated, uma tabela por vez, depois do inventário completo.

COMMIT;
