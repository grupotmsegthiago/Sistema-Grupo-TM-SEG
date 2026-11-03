-- Antecipação de pagamento: uma operação vincula N títulos/NFs do contas a receber.

CREATE TABLE IF NOT EXISTS public.payment_anticipations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_number TEXT DEFAULT '',
  operation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  average_rate_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
  net_anticipated NUMERIC(14,2) NOT NULL DEFAULT 0,
  offered_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  title_id TEXT DEFAULT '',
  item_id TEXT DEFAULT '',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  saldo_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  juros NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_liquido NUMERIC(14,2) NOT NULL DEFAULT 0,
  residual NUMERIC(14,2) NOT NULL DEFAULT 0,
  residual_due_date DATE,
  settlement TEXT NOT NULL DEFAULT 'PAGO' CHECK (settlement IN ('PAGO', 'SALDO_A_RECEBER')),
  entity_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  email_sent BOOLEAN DEFAULT FALSE,
  email_error TEXT DEFAULT '',
  residual_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_anticipations_created
  ON public.payment_anticipations (created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_anticipation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anticipation_id UUID NOT NULL REFERENCES public.payment_anticipations(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.financial_invoices(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'SOURCE' CHECK (role IN ('SOURCE', 'RESIDUAL')),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  nf_ref TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_anticipation_links_ant
  ON public.payment_anticipation_links (anticipation_id);
CREATE INDEX IF NOT EXISTS idx_payment_anticipation_links_tx
  ON public.payment_anticipation_links (transaction_id);

ALTER TABLE public.payment_anticipations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_anticipation_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for payment_anticipations" ON public.payment_anticipations;
CREATE POLICY "Allow all for payment_anticipations"
  ON public.payment_anticipations
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for payment_anticipation_links" ON public.payment_anticipation_links;
CREATE POLICY "Allow all for payment_anticipation_links"
  ON public.payment_anticipation_links
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.payment_anticipations IS 'Operação de antecipação de pagamento (manual) no contas a receber';
COMMENT ON TABLE public.payment_anticipation_links IS 'Títulos/NFs vinculados a uma antecipação (origem ou ressalva)';
