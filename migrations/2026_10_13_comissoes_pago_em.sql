-- Hora do pagamento da comissão, além da data já gravada.
-- Não altera valor, status nem comprovante existentes.

ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS pago_em timestamptz;
