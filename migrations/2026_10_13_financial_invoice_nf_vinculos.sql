-- Liga duas NFs do mesmo cliente quando o CNPJ foi separado.
-- Não altera valor de fatura, OS nem comissão. Só a auditoria de divergência usa o par.

BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_invoice_nf_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.financial_invoices(id) ON DELETE CASCADE,
  outra_invoice_id uuid NOT NULL REFERENCES public.financial_invoices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_invoice_nf_vinculos_par_ck CHECK (invoice_id <> outra_invoice_id),
  CONSTRAINT financial_invoice_nf_vinculos_par_uk UNIQUE (invoice_id, outra_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_invoice_nf_vinculos_outra
  ON public.financial_invoice_nf_vinculos (outra_invoice_id);

ALTER TABLE public.financial_invoice_nf_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for financial_invoice_nf_vinculos" ON public.financial_invoice_nf_vinculos;
CREATE POLICY "Allow all for financial_invoice_nf_vinculos"
  ON public.financial_invoice_nf_vinculos FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_invoice_nf_vinculos TO anon, authenticated;

COMMIT;
