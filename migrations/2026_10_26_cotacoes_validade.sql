-- Validade de 30 dias da cotação.
-- NÃO foi executada nesta entrega. Rodar no Supabase ajhmmjuewdsukecaimik.
-- Não altera OS, NF, Asaas nem a tabela contratual de DHL/IBL.
-- quotes.id e missions.id já existem. converted_to_order_id é texto, como o id da OS.
-- Status antigos (Rascunho, Enviada, Aprovada) continuam válidos.

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS converted_to_order_id text;

-- created_at e status já fazem parte de quotes. O default cobre tabela antiga sem a coluna.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_quotes_validade
  ON public.quotes (is_active, created_at);

COMMIT;

-- O bucket mission-evidence guarda logo e evidência.
-- A leitura pública e o CORS (*) precisam ser conferidos no Storage do projeto
-- ajhmmjuewdsukecaimik. Esta sessão não altera o Storage.
