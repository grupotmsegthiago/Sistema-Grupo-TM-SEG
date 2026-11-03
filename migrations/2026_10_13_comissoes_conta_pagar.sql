-- Liga cada comissão ao lançamento próprio em Contas a Pagar.
-- Não altera cálculo de comissão nem lançamentos financeiros já existentes.

ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS conta_pagar_id uuid
  REFERENCES public.financial_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comissoes_conta_pagar
  ON public.comissoes (conta_pagar_id)
  WHERE conta_pagar_id IS NOT NULL;
