-- NÃO EXECUTAR no projeto ajhmmjuewdsukecaimik.
-- Proposta de corte do acesso anônimo às tabelas financeiras e operacionais
-- usadas pelo Gestor Fiscal e pelo restante do sistema.
--
-- Este arquivo aborta se a sessão não marcar tmseg.p0_teste_isolado = ligado.
-- O teste isolado faz isso num Postgres local, sem dados reais.
-- Em produção, a ausência dessa marca interrompe o script antes de qualquer policy.
--
-- Não colocar service_role no navegador. A identidade válida é app_metadata,
-- gravada só pelo servidor. user_metadata é ignorada de propósito.

BEGIN;

DO $$
BEGIN
  IF current_setting('tmseg.p0_teste_isolado', true) IS DISTINCT FROM 'ligado' THEN
    RAISE EXCEPTION
      'NÃO EXECUTAR. Proposta do P0. O projeto ajhmmjuewdsukecaimik só recebe este corte depois do JWT emitido pelo servidor e de autorização explícita.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS tmseg_private;
REVOKE ALL ON SCHEMA tmseg_private FROM PUBLIC;
GRANT USAGE ON SCHEMA tmseg_private TO authenticated;

CREATE OR REPLACE FUNCTION tmseg_private.fold(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(translate(
    COALESCE(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
  ));
$$;

CREATE OR REPLACE FUNCTION tmseg_private.app()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    CASE
      WHEN COALESCE(current_setting('request.jwt.claims', true), '') = '' THEN NULL
      ELSE current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata'
    END,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION tmseg_private.ativo()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'authenticated'
     AND tmseg_private.app() ->> 'status' = 'Ativo';
$$;

CREATE OR REPLACE FUNCTION tmseg_private.perfil()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.fold(tmseg_private.app() ->> 'perfil');
$$;

CREATE OR REPLACE FUNCTION tmseg_private.tem(p text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(tmseg_private.app() -> 'permissions', '[]'::jsonb) ? p;
$$;

CREATE OR REPLACE FUNCTION tmseg_private.avancado()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.perfil() = 'avancado';
$$;

CREATE OR REPLACE FUNCTION tmseg_private.portal()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.ativo()
     AND COALESCE(tmseg_private.app() ->> 'client_id', '') <> '';
$$;

CREATE OR REPLACE FUNCTION tmseg_private.interno()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.ativo() AND NOT tmseg_private.portal();
$$;

CREATE OR REPLACE FUNCTION tmseg_private.empresas()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(tmseg_private.app() -> 'empresas') = 'array'
      THEN tmseg_private.app() -> 'empresas'
    ELSE '[]'::jsonb
  END;
$$;

-- Lista vazia significa o grupo inteiro, para quem já passou na permissão.
-- Lista preenchida só deixa a empresa citada. O navegador não grava essa lista.
CREATE OR REPLACE FUNCTION tmseg_private.empresa_permitida(emissora text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN jsonb_array_length(tmseg_private.empresas()) = 0 THEN true
    ELSE EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(tmseg_private.empresas()) AS item
      WHERE tmseg_private.fold(item) = tmseg_private.fold(emissora)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION tmseg_private.le_financeiro()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.interno()
     AND NOT tmseg_private.avancado()
     AND (
       tmseg_private.tem('fin-dashboard')
       OR tmseg_private.tem('finance-group')
       OR tmseg_private.tem('*')
       OR (
         tmseg_private.perfil() = 'diretoria'
         AND (
           tmseg_private.tem('diretoria-faturamento')
           OR tmseg_private.tem('gestor-fiscal')
         )
       )
     );
$$;

-- Lançamento, conta e vínculo não têm CNPJ confiável.
-- Com lista de empresas preenchida, ficam ocultos. A conta bancária não escolhe a empresa.
CREATE OR REPLACE FUNCTION tmseg_private.ve_sem_cnpj()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.le_financeiro()
     AND jsonb_array_length(tmseg_private.empresas()) = 0;
$$;

-- Gestor Fiscal sozinho lê. Não grava fatura, lançamento nem conta.
CREATE OR REPLACE FUNCTION tmseg_private.escreve_financeiro()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.le_financeiro()
     AND (
       tmseg_private.tem('fin-dashboard')
       OR tmseg_private.tem('finance-group')
       OR tmseg_private.tem('diretoria-faturamento')
       OR tmseg_private.tem('*')
     );
$$;

CREATE OR REPLACE FUNCTION tmseg_private.le_os()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.interno()
     AND (
       tmseg_private.tem('missions')
       OR tmseg_private.tem('*')
       OR (
         tmseg_private.perfil() = 'diretoria'
         AND (
           tmseg_private.tem('missions')
           OR tmseg_private.tem('diretoria-faturamento')
           OR tmseg_private.tem('gestor-fiscal')
         )
       )
     );
$$;

CREATE OR REPLACE FUNCTION tmseg_private.escreve_os()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT tmseg_private.interno()
     AND (tmseg_private.tem('missions') OR tmseg_private.tem('*'));
$$;

CREATE OR REPLACE FUNCTION tmseg_private.cliente_da_os(nome_cliente text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, tmseg_private, pg_temp
AS $$
  SELECT tmseg_private.portal()
     AND EXISTS (
       SELECT 1
       FROM public.clients AS cliente
       WHERE cliente.id::text = tmseg_private.app() ->> 'client_id'
         AND tmseg_private.fold(cliente.name) = tmseg_private.fold(nome_cliente)
     );
$$;

REVOKE ALL ON FUNCTION tmseg_private.fold(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.app() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.ativo() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.perfil() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.tem(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.avancado() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.portal() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.interno() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.empresas() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.empresa_permitida(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.ve_sem_cnpj() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.le_financeiro() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.escreve_financeiro() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.le_os() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.escreve_os() FROM PUBLIC;
REVOKE ALL ON FUNCTION tmseg_private.cliente_da_os(text) FROM PUBLIC;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tmseg_private TO authenticated;

DO $$
DECLARE
  vista record;
BEGIN
  FOR vista IN
    SELECT n.nspname AS esquema, c.relname AS nome, c.reloptions AS opcoes
    FROM pg_rewrite AS regra
    JOIN pg_class AS c ON c.oid = regra.ev_class
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_depend AS dependencia ON dependencia.objid = regra.oid
    JOIN pg_class AS origem ON origem.oid = dependencia.refobjid
    WHERE origem.relname = ANY (ARRAY[
      'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
      'financial_transactions', 'financial_categories', 'financial_invoices',
      'financial_invoice_missions', 'providers', 'financial_accounts'
    ])
      AND c.relkind = 'v'
      AND n.nspname = 'public'
  LOOP
    IF NOT (
      COALESCE(vista.opcoes, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
      OR COALESCE(vista.opcoes, ARRAY[]::text[]) @> ARRAY['security_invoker=on']
    ) THEN
      RAISE EXCEPTION
        'A view pública %.% lê tabela protegida sem security_invoker. O corte parou.',
        vista.esquema, vista.nome;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
        'financial_transactions', 'financial_categories', 'financial_invoices',
        'financial_invoice_missions', 'providers', 'financial_accounts'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.policyname, item.tablename);
  END LOOP;
END
$$;

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_cost_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_invoice_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.missions,
  public.clients,
  public.client_price_tables,
  public.provider_cost_tables,
  public.financial_transactions,
  public.financial_categories,
  public.financial_invoices,
  public.financial_invoice_missions,
  public.providers,
  public.financial_accounts
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.missions,
  public.clients,
  public.client_price_tables,
  public.provider_cost_tables,
  public.financial_transactions,
  public.financial_categories,
  public.financial_invoices,
  public.financial_invoice_missions,
  public.providers,
  public.financial_accounts
TO authenticated;

CREATE POLICY p0_missions_select ON public.missions
  FOR SELECT TO authenticated
  USING (
    tmseg_private.le_os()
    OR tmseg_private.le_financeiro()
    OR tmseg_private.cliente_da_os(client)
  );

CREATE POLICY p0_missions_insert ON public.missions
  FOR INSERT TO authenticated
  WITH CHECK (
    tmseg_private.escreve_os()
    OR tmseg_private.cliente_da_os(client)
  );

CREATE POLICY p0_missions_update ON public.missions
  FOR UPDATE TO authenticated
  USING (tmseg_private.escreve_os() OR tmseg_private.escreve_financeiro())
  WITH CHECK (tmseg_private.escreve_os() OR tmseg_private.escreve_financeiro());

CREATE POLICY p0_clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    tmseg_private.le_os()
    OR tmseg_private.le_financeiro()
    OR tmseg_private.tem('clients')
    OR id::text = COALESCE(tmseg_private.app() ->> 'client_id', '')
  );

CREATE POLICY p0_clients_write ON public.clients
  FOR ALL TO authenticated
  USING (tmseg_private.interno() AND (tmseg_private.tem('clients') OR tmseg_private.tem('*')))
  WITH CHECK (tmseg_private.interno() AND (tmseg_private.tem('clients') OR tmseg_private.tem('*')));

CREATE POLICY p0_preco_cliente_select ON public.client_price_tables
  FOR SELECT TO authenticated
  USING (tmseg_private.le_os() OR tmseg_private.le_financeiro() OR tmseg_private.tem('clients'));

CREATE POLICY p0_preco_cliente_write ON public.client_price_tables
  FOR ALL TO authenticated
  USING (tmseg_private.interno() AND (tmseg_private.tem('clients') OR tmseg_private.tem('*')))
  WITH CHECK (tmseg_private.interno() AND (tmseg_private.tem('clients') OR tmseg_private.tem('*')));

CREATE POLICY p0_custo_fornecedor_select ON public.provider_cost_tables
  FOR SELECT TO authenticated
  USING (tmseg_private.le_os() OR tmseg_private.le_financeiro() OR tmseg_private.tem('providers'));

CREATE POLICY p0_custo_fornecedor_write ON public.provider_cost_tables
  FOR ALL TO authenticated
  USING (tmseg_private.interno() AND (tmseg_private.tem('providers') OR tmseg_private.tem('*')))
  WITH CHECK (tmseg_private.interno() AND (tmseg_private.tem('providers') OR tmseg_private.tem('*')));

CREATE POLICY p0_fornecedor_select ON public.providers
  FOR SELECT TO authenticated
  USING (tmseg_private.le_os() OR tmseg_private.le_financeiro() OR tmseg_private.tem('providers'));

CREATE POLICY p0_fornecedor_write ON public.providers
  FOR ALL TO authenticated
  USING (tmseg_private.interno() AND (tmseg_private.tem('providers') OR tmseg_private.tem('*')))
  WITH CHECK (tmseg_private.interno() AND (tmseg_private.tem('providers') OR tmseg_private.tem('*')));

CREATE POLICY p0_lancamento_select ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (tmseg_private.ve_sem_cnpj());

CREATE POLICY p0_lancamento_write ON public.financial_transactions
  FOR ALL TO authenticated
  USING (tmseg_private.escreve_financeiro() AND tmseg_private.ve_sem_cnpj())
  WITH CHECK (tmseg_private.escreve_financeiro() AND tmseg_private.ve_sem_cnpj());

CREATE POLICY p0_categoria_select ON public.financial_categories
  FOR SELECT TO authenticated
  USING (tmseg_private.le_financeiro());

CREATE POLICY p0_categoria_write ON public.financial_categories
  FOR ALL TO authenticated
  USING (tmseg_private.escreve_financeiro())
  WITH CHECK (tmseg_private.escreve_financeiro());

CREATE POLICY p0_conta_select ON public.financial_accounts
  FOR SELECT TO authenticated
  USING (tmseg_private.ve_sem_cnpj());

CREATE POLICY p0_conta_write ON public.financial_accounts
  FOR ALL TO authenticated
  USING (tmseg_private.escreve_financeiro() AND tmseg_private.ve_sem_cnpj())
  WITH CHECK (tmseg_private.escreve_financeiro() AND tmseg_private.ve_sem_cnpj());

CREATE POLICY p0_fatura_select ON public.financial_invoices
  FOR SELECT TO authenticated
  USING (
    tmseg_private.le_financeiro()
    AND tmseg_private.empresa_permitida(issuer_company)
  );

CREATE POLICY p0_fatura_write ON public.financial_invoices
  FOR ALL TO authenticated
  USING (
    tmseg_private.escreve_financeiro()
    AND tmseg_private.empresa_permitida(issuer_company)
  )
  WITH CHECK (
    tmseg_private.escreve_financeiro()
    AND tmseg_private.empresa_permitida(issuer_company)
  );

CREATE POLICY p0_vinculo_select ON public.financial_invoice_missions
  FOR SELECT TO authenticated
  USING (tmseg_private.ve_sem_cnpj());

CREATE POLICY p0_vinculo_write ON public.financial_invoice_missions
  FOR ALL TO authenticated
  USING (tmseg_private.escreve_financeiro() AND tmseg_private.ve_sem_cnpj())
  WITH CHECK (tmseg_private.escreve_financeiro() AND tmseg_private.ve_sem_cnpj());

CREATE INDEX IF NOT EXISTS idx_p0_missions_client ON public.missions (client);
CREATE INDEX IF NOT EXISTS idx_p0_clients_name ON public.clients (name);
CREATE INDEX IF NOT EXISTS idx_p0_faturas_emissora ON public.financial_invoices (issuer_company);

COMMIT;
