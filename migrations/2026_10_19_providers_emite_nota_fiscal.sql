-- Cadastro do fornecedor: se emite nota fiscal.
-- Aplicada no projeto Grupo TM SEG (ajhmmjuewdsukecaimik).
-- Não altera OS, pedágio, Asaas nem comissão.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS emite_nota_fiscal text DEFAULT 'nao_informado';

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_emite_nota_fiscal_check;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_emite_nota_fiscal_check
  CHECK (emite_nota_fiscal IN ('sim', 'nao', 'nao_informado'));
