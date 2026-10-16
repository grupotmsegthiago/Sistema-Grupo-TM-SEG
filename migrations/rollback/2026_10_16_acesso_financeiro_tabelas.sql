-- Devolve a leitura direta das tabelas financeiras. Não apaga linha nem sessão.

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
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated',
        tabela
      );
    END IF;
  END LOOP;
END $$;
