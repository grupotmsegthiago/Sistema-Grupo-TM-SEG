-- Ocorrência operacional digitada pelo operador em cada OS.
-- O texto fica na OS (occurrence_count) e o histórico fica em mission_occurrences
-- mais uma cópia em system_logs para a auditoria.

CREATE TABLE IF NOT EXISTS public.mission_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  description text NOT NULL,
  evidence_url text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_occurrences_mission
  ON public.mission_occurrences (mission_id, created_at DESC);

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 0;

COMMENT ON TABLE public.mission_occurrences IS
  'Histórico de problemas registrados pelo operador em uma OS, com texto e evidência.';

COMMENT ON COLUMN public.missions.occurrence_count IS
  'Quantidade de ocorrências salvas nesta OS. Acima de zero, o cartão avisa para verificar.';

ALTER TABLE public.mission_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for mission_occurrences" ON public.mission_occurrences;
CREATE POLICY "Allow all for mission_occurrences"
  ON public.mission_occurrences FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_occurrences TO anon, authenticated;
