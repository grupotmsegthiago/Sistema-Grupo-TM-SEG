-- NÃO EXECUTAR como estado definitivo.
-- Emergência temporária: devolve a leitura anônima só para religar a operação
-- se o corte do P0 tirar OS, faturamento ou financeiro do ar.
-- Não é a correção. Depois de estabilizar, o acesso anônimo precisa sair de novo.
--
-- Exige tmseg.p0_emergencia = autorizada na mesma sessão.

BEGIN;

DO $$
BEGIN
  IF current_setting('tmseg.p0_emergencia', true) IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION
      'NÃO EXECUTAR. Reabertura anônima só com autorização explícita de emergência.';
  END IF;
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
      AND policyname LIKE 'p0_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.policyname, item.tablename);
  END LOOP;
END
$$;

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'missions', 'clients', 'client_price_tables', 'provider_cost_tables',
    'financial_transactions', 'financial_categories', 'financial_invoices',
    'financial_invoice_missions', 'providers', 'financial_accounts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for %I" ON public.%I', tabela, tabela);
    EXECUTE format(
      'CREATE POLICY "Allow all for %I" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      tabela, tabela
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated',
      tabela
    );
  END LOOP;
END
$$;

COMMIT;
