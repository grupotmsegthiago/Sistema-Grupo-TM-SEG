-- Observação do Controle Diário: cada gravação é uma linha nova.
-- O texto anterior permanece no histórico, com quem escreveu e quando.

CREATE TABLE IF NOT EXISTS public.controle_diario_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  note text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_controle_diario_notas_mission
  ON public.controle_diario_notas (mission_id, created_at DESC);

COMMENT ON TABLE public.controle_diario_notas IS
  'Histórico de observações do Controle Diário. Cada salvamento acrescenta uma linha; nada é sobrescrito.';

ALTER TABLE public.controle_diario_notas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.controle_diario_notas FROM anon, authenticated;
