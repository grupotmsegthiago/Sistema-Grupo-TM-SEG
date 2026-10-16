-- Fecha a leitura direta das tabelas financeiras.
-- Aplicar só depois que o sistema novo estiver no ar.
-- Não apaga linha. service_role continua com a tabela inteira.
-- OS operacional segue na migration de colunas, não aqui.

DO $$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'financial_invoices',
    'financial_invoice_missions',
    'financial_invoice_nf_vinculos',
    'financial_invoice_divergencia_vista',
    'financial_transactions',
    'financial_transaction_payments',
    'financial_accounts',
    'financial_categories',
    'account_balance_snapshots',
    'comissoes',
    'regras_comissao',
    'rh_commissions',
    'rh_commission_rules',
    'client_price_regions',
    'system_logs'
  ]
  LOOP
    IF to_regclass('public.' || tabela) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tabela);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tabela);
    END IF;
  END LOOP;
END $$;
