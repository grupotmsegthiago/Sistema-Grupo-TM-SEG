-- Aditiva. A sessão liga o login ao perfil no cadastro.
-- Não muda OS, preço, RLS nem GRANT.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_sessions TO service_role;
