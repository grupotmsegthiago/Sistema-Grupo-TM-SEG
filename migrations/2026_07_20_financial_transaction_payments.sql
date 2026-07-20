-- Pagamentos recebidos vinculados a títulos (Contas a Receber — parcial / em aberto)

CREATE TABLE IF NOT EXISTS public.financial_transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_payments_tx
  ON public.financial_transaction_payments (transaction_id, payment_date DESC);

ALTER TABLE public.financial_transaction_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for financial_transaction_payments" ON public.financial_transaction_payments;
CREATE POLICY "Allow all for financial_transaction_payments" ON public.financial_transaction_payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_open NUMERIC(14,2);

COMMENT ON TABLE public.financial_transaction_payments IS 'Histórico de pagamentos recebidos por título (suporta parcial)';
COMMENT ON COLUMN public.financial_transactions.amount_paid IS 'Soma dos pagamentos recebidos';
COMMENT ON COLUMN public.financial_transactions.amount_open IS 'Saldo em aberto (amount - amount_paid)';
