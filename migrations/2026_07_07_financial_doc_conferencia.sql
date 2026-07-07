-- Conferência de documentos em Contas a Pagar (padrão Torres)
-- Boleto/Medição, NF e Comprovante por lançamento

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS doc_boleto_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_boleto_status TEXT DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS doc_nf_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_nf_status TEXT DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS doc_comprovante_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_comprovante_status TEXT DEFAULT 'empty';

COMMENT ON COLUMN public.financial_transactions.doc_boleto_status IS 'empty | pending | ok | issue';
COMMENT ON COLUMN public.financial_transactions.doc_nf_status IS 'empty | pending | ok | issue';
COMMENT ON COLUMN public.financial_transactions.doc_comprovante_status IS 'empty | pending | ok | issue';
