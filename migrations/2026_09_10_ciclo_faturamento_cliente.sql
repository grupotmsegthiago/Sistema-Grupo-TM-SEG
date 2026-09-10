-- Ciclo de faturamento no cadastro do cliente + período do boletim na fatura.
-- Aditivo: não altera motor financeiro, Asaas, eNotas nem valores de OS.

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ciclo_faturamento text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_ciclo_faturamento_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_ciclo_faturamento_check
  CHECK (ciclo_faturamento IS NULL OR ciclo_faturamento IN ('diario', 'quinzenal', 'mensal'));

COMMENT ON COLUMN public.clients.ciclo_faturamento IS
  'Ciclo de faturamento do cliente: diario | quinzenal (1-15 e 16-fim) | mensal (1-ultimo dia). NULL = nao cadastrado (fail-closed).';

ALTER TABLE public.financial_invoices
  ADD COLUMN IF NOT EXISTS period_start date;

ALTER TABLE public.financial_invoices
  ADD COLUMN IF NOT EXISTS period_end date;

COMMENT ON COLUMN public.financial_invoices.period_start IS
  'Inicio civil do periodo do boletim (YYYY-MM-DD).';
COMMENT ON COLUMN public.financial_invoices.period_end IS
  'Fim civil do periodo do boletim (YYYY-MM-DD).';

COMMIT;
