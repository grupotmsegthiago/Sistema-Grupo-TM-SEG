-- NÃO EXECUTAR como estado final.
-- Devolve só o que o pacote reconciliado retira, no projeto ajhmmjuewdsukecaimik.
-- Não recria a RLS antiga de JWT e não mexe em public_access_missions.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.system_users') IS NULL
     OR to_regclass('public.missions') IS NULL
     OR to_regclass('public.financial_invoices') IS NULL THEN
    RAISE EXCEPTION 'Banco errado.';
  END IF;
  IF current_setting('tmseg.p0_reverter', true) IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION 'NÃO EXECUTAR. Reabertura só com autorização explícita.';
  END IF;
END
$$;

GRANT SELECT ON TABLE public.financial_transactions TO anon;
GRANT SELECT ON TABLE public.financial_accounts TO anon;
GRANT SELECT ON TABLE public.financial_invoices TO anon;

CREATE POLICY public_access_fin_trans
  ON public.financial_transactions
  FOR SELECT TO anon
  USING (true);

CREATE POLICY public_access_fin_acc
  ON public.financial_accounts
  FOR SELECT TO anon
  USING (true);

CREATE POLICY financial_invoices_anon_select
  ON public.financial_invoices
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS system_users_tela_select ON public.system_users;
GRANT SELECT ON TABLE public.system_users TO anon;
CREATE POLICY public_access_users
  ON public.system_users
  FOR SELECT TO anon
  USING (true);

COMMIT;
