-- Libera uma nova entrada do agente depois da chegada a 500 m.
-- Não mexe na OS, no status cadastral nem no nome do fornecedor.
-- Aplicar no projeto Grupo TMSEG (ajhmmjuewdsukecaimik).

ALTER TABLE public.mission_live_tracks
  ADD COLUMN IF NOT EXISTS reentrada_liberada_em timestamptz;

COMMENT ON COLUMN public.mission_live_tracks.reentrada_liberada_em IS
  'Quando o operador liberou o agente a abrir o link de novo depois da chegada no destino. Nulo bloqueia a reentrada.';
