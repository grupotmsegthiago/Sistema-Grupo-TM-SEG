-- Folha de ponto CLT — tabela time_clock + assinatura digital em rh_employees
-- Executar no Supabase SQL Editor

ALTER TABLE rh_employees
  ADD COLUMN IF NOT EXISTS digital_signature_url TEXT;

CREATE TABLE IF NOT EXISTS time_clock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_time_clock_user_ts ON time_clock (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_employee_ts ON time_clock (employee_id, timestamp DESC);

COMMENT ON TABLE time_clock IS 'Registros de ponto CLT — entrada, almoço, retorno e saída';
COMMENT ON COLUMN rh_employees.digital_signature_url IS 'Assinatura digital cadastrada no primeiro ponto';

-- RLS: sem policy a tabela fica invisível no app (chave anon)
ALTER TABLE time_clock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for time_clock" ON time_clock;
CREATE POLICY "Allow all for time_clock" ON time_clock
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Realtime (postgres_changes no frontend)
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
