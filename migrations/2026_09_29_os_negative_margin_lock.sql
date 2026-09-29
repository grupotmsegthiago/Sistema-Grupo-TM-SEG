-- Trava de OS com prejuízo já analisado.
-- Giovanna Marsili, Beatriz Rocha e Thiago Moreira confirmam;
-- depois disso somente o perfil Diretoria altera a OS.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS negative_margin_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS negative_margin_locked_by text;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS negative_margin_locked_at timestamptz;

COMMENT ON COLUMN public.missions.negative_margin_locked IS
  'OS com prejuízo analisado e travada. Somente perfil Diretoria pode alterar.';
