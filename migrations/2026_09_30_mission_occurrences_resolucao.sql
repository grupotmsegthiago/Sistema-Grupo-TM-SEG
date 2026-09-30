-- Resolução da ocorrência. A linha original permanece.
-- Enquanto resolved_at estiver vazio, a ocorrência está em aberto.

ALTER TABLE public.mission_occurrences
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text,
  ADD COLUMN IF NOT EXISTS resolution_note text;

COMMENT ON COLUMN public.mission_occurrences.resolved_at IS
  'Quando a ocorrência foi marcada como resolvida. Vazio significa em aberto.';

COMMENT ON COLUMN public.mission_occurrences.resolution_note IS
  'O que foi resolvido, gravado por quem marcou a ocorrência.';

CREATE INDEX IF NOT EXISTS idx_mission_occurrences_open
  ON public.mission_occurrences (created_at DESC)
  WHERE resolved_at IS NULL;
