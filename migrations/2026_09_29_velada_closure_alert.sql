-- Alerta fixo do operador após finalizar missão velada ATIVA / TM SEG.
-- Sai somente com KM final, hora final e pedágio confirmado.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS velada_closure_operator text;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS velada_closure_opened_at timestamptz;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS velada_closure_notified_at timestamptz;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS velada_closure_escalated_at timestamptz;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS velada_toll_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.missions.velada_closure_operator IS
  'Operador que finalizou a velada ATIVA/TM SEG e deve informar KM final, hora final e pedágio.';
