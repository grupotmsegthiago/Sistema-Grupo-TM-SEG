-- Robô autónomo do Radar (descoberta web + Gemini).
-- Depende de partner_prospects. Projeto: ajhmmjuewdsukecaimik.
-- Autorizado na sessão 05/11/2026 (descoberta ativa web via IA).

ALTER TABLE public.partner_prospects DROP CONSTRAINT IF EXISTS partner_prospects_source_check;
ALTER TABLE public.partner_prospects ADD CONSTRAINT partner_prospects_source_check
  CHECK (source = ANY (ARRAY[
    'receita_federal'::text,
    'policia_federal'::text,
    'google'::text,
    'csv'::text,
    'manual'::text,
    'robo_24h'::text
  ]));

CREATE TABLE IF NOT EXISTS public.partner_radar_robot_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  last_uf_index integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_ufs text[] DEFAULT '{}',
  last_inserted integer NOT NULL DEFAULT 0,
  last_skipped integer NOT NULL DEFAULT 0,
  last_error text,
  last_queries text[] DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.partner_radar_robot_state (id, enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.partner_radar_robot_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_radar_robot_state_all ON public.partner_radar_robot_state;
CREATE POLICY partner_radar_robot_state_all ON public.partner_radar_robot_state
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_radar_robot_state TO anon, authenticated;

COMMENT ON TABLE public.partner_radar_robot_state IS
  'Cursor e telemetria do cron noturno de descoberta web do Radar de Parceiros.';
