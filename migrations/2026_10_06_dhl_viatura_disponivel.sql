-- Painel fixo de viaturas finalizadas fora de SP e RJ, para comunicar à DHL.
-- O texto do WhatsApp não usa estas colunas de fornecedor/cliente.

CREATE TABLE IF NOT EXISTS public.dhl_viatura_disponivel (
  mission_id text PRIMARY KEY,
  provider_name text,
  cliente text,
  posicao text NOT NULL,
  cidade text,
  uf text,
  regiao text NOT NULL,
  finalizada_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  copiado_em timestamptz,
  copiado_por text,
  confirmado_em timestamptz,
  confirmado_por text,
  expirado_em timestamptz,
  motivo_bloqueio text,
  observacao_diretoria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dhl_viatura_disponivel_status_check
    CHECK (status IN ('pendente', 'copiado', 'confirmado', 'expirado'))
);

COMMENT ON TABLE public.dhl_viatura_disponivel IS
  'OS concluída fora de SP/RJ aguardando o operador copiar o aviso de viatura disponível para o grupo da DHL.';

CREATE INDEX IF NOT EXISTS dhl_viatura_disponivel_status_finalizada_idx
  ON public.dhl_viatura_disponivel (status, finalizada_em DESC);

ALTER TABLE public.dhl_viatura_disponivel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for dhl_viatura_disponivel" ON public.dhl_viatura_disponivel;
CREATE POLICY "Allow all for dhl_viatura_disponivel"
  ON public.dhl_viatura_disponivel FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dhl_viatura_disponivel TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dhl_viatura_disponivel'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dhl_viatura_disponivel;
  END IF;
  ALTER TABLE public.dhl_viatura_disponivel REPLICA IDENTITY FULL;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;
