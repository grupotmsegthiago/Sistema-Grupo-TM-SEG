-- Rastro do e-mail automático da fatura (boleto + NF) ao responsável financeiro.

ALTER TABLE public.financial_invoices
  ADD COLUMN IF NOT EXISTS billing_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email_error TEXT,
  ADD COLUMN IF NOT EXISTS billing_email_recipients TEXT,
  ADD COLUMN IF NOT EXISTS billing_email_claim TEXT,
  ADD COLUMN IF NOT EXISTS billing_email_sending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.financial_invoices.billing_email_sent_at IS
  'Quando a cobrança (boleto + NF) foi aceita pelo SMTP para o e-mail do responsável financeiro.';

CREATE INDEX IF NOT EXISTS idx_financial_invoices_billing_email_pending
  ON public.financial_invoices (created_at)
  WHERE billing_email_sent_at IS NULL
    AND status IN ('EMITIDA', 'VENCIDA', 'PAGA');
