-- O financeiro marca a divergência como vista. A linha sai da auditoria.
-- Não altera valor de fatura, OS nem comissão.

BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_invoice_divergencia_vista (
  invoice_id uuid PRIMARY KEY REFERENCES public.financial_invoices(id) ON DELETE CASCADE,
  visto_em timestamptz NOT NULL DEFAULT now(),
  visto_por text
);

ALTER TABLE public.financial_invoice_divergencia_vista ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for financial_invoice_divergencia_vista" ON public.financial_invoice_divergencia_vista;
CREATE POLICY "Allow all for financial_invoice_divergencia_vista"
  ON public.financial_invoice_divergencia_vista FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_invoice_divergencia_vista TO anon, authenticated;

COMMIT;
