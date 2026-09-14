-- Rastreio ao vivo de missão velada (link externo + GPS tempo real).
-- Acesso: somente service_role via API. Anon/authenticated sem policy = fail-closed (LGPD).

CREATE TABLE IF NOT EXISTS public.mission_live_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  consent_at timestamptz,
  consent_ip text,
  consent_user_agent text,
  lgpd_version text,
  sharing_started_at timestamptz,
  last_seen_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_accuracy double precision,
  last_speed double precision,
  last_heading double precision,
  last_battery double precision,
  ended_at timestamptz,
  ended_reason text,
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mission_live_tracks_mission
  ON public.mission_live_tracks (mission_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_live_tracks_one_active
  ON public.mission_live_tracks (mission_id)
  WHERE status IN ('pending', 'consented', 'sharing', 'paused');

CREATE TABLE IF NOT EXISTS public.mission_live_positions (
  id bigserial PRIMARY KEY,
  track_id uuid NOT NULL REFERENCES public.mission_live_tracks(id) ON DELETE CASCADE,
  mission_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  battery double precision
);

CREATE INDEX IF NOT EXISTS idx_mission_live_positions_track
  ON public.mission_live_positions (track_id, recorded_at DESC);

ALTER TABLE public.mission_live_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_live_positions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mission_live_tracks FROM anon, authenticated;
REVOKE ALL ON TABLE public.mission_live_positions FROM anon, authenticated;
GRANT ALL ON TABLE public.mission_live_tracks TO postgres, service_role;
GRANT ALL ON TABLE public.mission_live_positions TO postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.mission_live_positions_id_seq TO postgres, service_role;

COMMENT ON TABLE public.mission_live_tracks IS
  'Sessão de localização ao vivo da OS velada (token público + consentimento LGPD).';
COMMENT ON TABLE public.mission_live_positions IS
  'Trilha GPS da sessão de rastreio ao vivo. Escrita somente via API service_role.';
