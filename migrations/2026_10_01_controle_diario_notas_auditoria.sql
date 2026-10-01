-- Lembrete da ocorrência de auditoria nas pendências do Controle Diário.
-- A observação do plantão continua com kind = observacao.
-- Nada é sobrescrito: cada lembrete é uma linha nova no mesmo histórico.

ALTER TABLE public.controle_diario_notas
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'observacao';

ALTER TABLE public.controle_diario_notas
  DROP CONSTRAINT IF EXISTS controle_diario_notas_kind_check;

ALTER TABLE public.controle_diario_notas
  ADD CONSTRAINT controle_diario_notas_kind_check
  CHECK (kind IN ('observacao', 'auditoria'));

COMMENT ON COLUMN public.controle_diario_notas.kind IS
  'observacao = texto do plantão; auditoria = lembrete da ocorrência de auditoria nas pendências.';
