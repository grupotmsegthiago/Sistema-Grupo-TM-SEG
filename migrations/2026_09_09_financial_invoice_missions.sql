-- Vínculo auditável Fatura ↔ OS. Aditivo: não altera missions nem financial_invoices.
-- App usa chave anon (não auth.uid). RLS permissiva igual ao padrão operacional.

BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_invoice_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.financial_invoices(id) ON DELETE CASCADE,
  mission_id text NOT NULL REFERENCES public.missions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_invoice_missions_mission
  ON public.financial_invoice_missions (mission_id);

CREATE INDEX IF NOT EXISTS idx_financial_invoice_missions_invoice
  ON public.financial_invoice_missions (invoice_id);

ALTER TABLE public.financial_invoice_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for financial_invoice_missions" ON public.financial_invoice_missions;
CREATE POLICY "Allow all for financial_invoice_missions"
  ON public.financial_invoice_missions FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_invoice_missions TO anon, authenticated;

COMMIT;
