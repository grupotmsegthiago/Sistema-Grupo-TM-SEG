-- ============================================================================
-- CORREÇÃO — rh_employees.user_id e time_clock.user_id UUID -> TEXT
-- ----------------------------------------------------------------------------
-- system_users.id é INTEGER (ex.: Beatriz = 5). Colunas UUID quebram o vínculo:
--   invalid input syntax for type uuid: "5"
--
-- Como aplicar (uma vez):
--   1. Supabase Studio -> SQL Editor
--   2. Cole TODO este conteúdo
--   3. Clique em "Run"
-- Ou: POST /api/rh-timeclock-init (Vercel com DATABASE_URL)
-- ============================================================================

-- rh_employees.user_id compatível com system_users.id (inteiro como texto)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_employees'
      AND column_name = 'user_id' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.rh_employees
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
  END IF;
END $$;

ALTER TABLE public.rh_employees
  ADD COLUMN IF NOT EXISTS digital_signature_url TEXT;

-- time_clock: criar com user_id TEXT ou corrigir se já existir com UUID
CREATE TABLE IF NOT EXISTS public.time_clock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  employee_id UUID REFERENCES rh_employees(id),
  user_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'BREAK_START', 'BREAK_END', 'OUT')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  signature_url TEXT,
  ai_verification BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'time_clock'
      AND column_name = 'user_id' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.time_clock
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_clock_user_ts ON public.time_clock (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_employee_ts ON public.time_clock (employee_id, timestamp DESC);

COMMENT ON TABLE public.time_clock IS 'Registros de ponto CLT — entrada, almoço, retorno e saída';
COMMENT ON COLUMN public.rh_employees.digital_signature_url IS 'Assinatura digital cadastrada no primeiro ponto';

ALTER TABLE public.time_clock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for time_clock" ON public.time_clock;
CREATE POLICY "Allow all for time_clock" ON public.time_clock
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'time_clock' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'time_clock'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.time_clock;
  END IF;
  ALTER TABLE public.time_clock REPLICA IDENTITY FULL;
END $$;

NOTIFY pgrst, 'reload schema';
