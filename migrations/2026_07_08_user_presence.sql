-- ============================================================================
-- Presença online via heartbeat no banco (fonte confiável para o quadro)
-- ----------------------------------------------------------------------------
-- Cada cliente logado faz upsert periódico em user_presence.
-- O quadro "Equipe no sistema" lê esta tabela (polling + realtime), sem depender
-- só do broadcast P2P do Supabase Realtime.
--
-- Como aplicar (uma vez):
--   Supabase Studio -> SQL Editor -> colar e RUN
-- Ou: node scripts/apply-user-presence-migration.mjs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Usuário',
  role TEXT NOT NULL DEFAULT 'Online',
  contract_type TEXT,
  is_clt BOOLEAN NOT NULL DEFAULT false,
  on_duty BOOLEAN NOT NULL DEFAULT false,
  on_duty_label TEXT NOT NULL DEFAULT 'Online',
  online_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  minutes_on_duty INTEGER,
  activity_status TEXT CHECK (activity_status IS NULL OR activity_status IN ('active', 'idle')),
  idle_minutes INTEGER,
  punch_marks JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen
  ON public.user_presence (last_seen DESC);

COMMENT ON TABLE public.user_presence IS
  'Heartbeat de presença online — cada sessão logada renova last_seen periodicamente';

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for user_presence" ON public.user_presence;
CREATE POLICY "Allow all for user_presence" ON public.user_presence
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_presence' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
    RAISE NOTICE 'Realtime publication: user_presence adicionada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_presence' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.user_presence REPLICA IDENTITY FULL;
  END IF;
END $$;
