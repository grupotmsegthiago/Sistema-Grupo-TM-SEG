-- Pendência do operador ao fechar a finalização sem as fotos do fim.
-- Não altera valor, KM nem status da OS.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS end_trip_evidence_url text;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS end_km_evidence_url text;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS end_photo_time_confirmed boolean NOT NULL DEFAULT false;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS end_evidence_pending boolean NOT NULL DEFAULT false;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS end_evidence_operator text;

COMMENT ON COLUMN public.missions.end_evidence_pending IS
  'Operador fechou a finalização sem as fotos do fim da viagem e do KM. A cobrança volta no Painel de OS.';
