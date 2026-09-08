-- Comissões: origem por empresa (TM SEG | TORRES).
-- TORRES não usa fatura_id (FK de financial_invoices da TM SEG) nem cliente_id (IDs distintos).

BEGIN;

ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS empresa_origem text NOT NULL DEFAULT 'TM_SEG',
  ADD COLUMN IF NOT EXISTS origem_fatura_id text,
  ADD COLUMN IF NOT EXISTS cliente_origem_id bigint;

UPDATE public.comissoes
SET origem_fatura_id = fatura_id::text
WHERE origem_fatura_id IS NULL AND fatura_id IS NOT NULL;

ALTER TABLE public.comissoes
  DROP CONSTRAINT IF EXISTS comissoes_empresa_origem_check;

ALTER TABLE public.comissoes
  ADD CONSTRAINT comissoes_empresa_origem_check
  CHECK (empresa_origem IN ('TM_SEG', 'TORRES'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_comissoes_origem_unique
  ON public.comissoes (empresa_origem, origem_fatura_id)
  WHERE origem_fatura_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comissoes_empresa_origem
  ON public.comissoes (empresa_origem, data_faturamento);

CREATE INDEX IF NOT EXISTS idx_comissoes_cliente_nome
  ON public.comissoes (cliente_nome);

COMMIT;
