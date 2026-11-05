-- Esteira contínua do Radar (play/pause + atividade ao vivo).
-- Projeto ajhmmjuewdsukecaimik.

ALTER TABLE public.partner_radar_robot_state
  ADD COLUMN IF NOT EXISTS run_status text NOT NULL DEFAULT 'paused';

ALTER TABLE public.partner_radar_robot_state
  DROP CONSTRAINT IF EXISTS partner_radar_robot_state_run_status_check;

ALTER TABLE public.partner_radar_robot_state
  ADD CONSTRAINT partner_radar_robot_state_run_status_check
  CHECK (run_status = ANY (ARRAY['running'::text, 'paused'::text]));

ALTER TABLE public.partner_radar_robot_state
  ADD COLUMN IF NOT EXISTS current_activity text,
  ADD COLUMN IF NOT EXISTS last_city text,
  ADD COLUMN IF NOT EXISTS found_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS found_today_date date,
  ADD COLUMN IF NOT EXISTS cycle_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tick_locked_at timestamptz;

UPDATE public.partner_radar_robot_state
SET run_status = 'paused'
WHERE run_status IS NULL OR run_status = '';

COMMENT ON COLUMN public.partner_radar_robot_state.run_status IS
  'running = esteira contínua ativa (ticks ~1 min); paused = parado.';
COMMENT ON COLUMN public.partner_radar_robot_state.current_activity IS
  'Texto ao vivo para a UI, ex.: Buscando agora: Curitiba/PR';
