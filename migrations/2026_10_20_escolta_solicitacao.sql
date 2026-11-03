-- Solicitação de escolta compartilhada entre os operadores.
-- A fila guarda o horário de liberação. O envio continua no WhatsApp de quem clica.
-- O link chat.whatsapp.com fica no fornecedor; o ID interno do bot permanece em whatsapp_group_id.

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT;

COMMENT ON COLUMN public.providers.whatsapp_group_link IS
  'Link chat.whatsapp.com do grupo do fornecedor. Abre o WhatsApp do operador com a mensagem copiada. Não dispara sozinho.';

CREATE TABLE IF NOT EXISTS public.escolta_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem text NOT NULL,
  origem text NOT NULL,
  destino text NOT NULL DEFAULT '',
  cidade text,
  uf text,
  imediata boolean NOT NULL,
  data_servico date,
  hora_servico text,
  status text NOT NULL DEFAULT 'em_andamento',
  fornecedor_confirmado_id text,
  fornecedor_confirmado_nome text,
  confirmado_por text,
  confirmado_em timestamptz,
  criado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escolta_solicitacoes_status_check
    CHECK (status IN ('em_andamento', 'confirmada', 'cancelada'))
);

COMMENT ON TABLE public.escolta_solicitacoes IS
  'Pedido de escolta lido da mensagem do cliente. Todos os operadores veem a mesma fila.';

CREATE INDEX IF NOT EXISTS escolta_solicitacoes_status_created_idx
  ON public.escolta_solicitacoes (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.escolta_solicitacao_alvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.escolta_solicitacoes(id) ON DELETE CASCADE,
  provider_id text,
  provider_nome text NOT NULL,
  custo_100km numeric,
  ordem integer NOT NULL,
  grupo_link text,
  liberar_em timestamptz NOT NULL,
  aberto_em timestamptz,
  aberto_por text,
  status text NOT NULL DEFAULT 'na_fila',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escolta_solicitacao_alvos_status_check
    CHECK (status IN ('na_fila', 'aberto', 'bloqueado', 'confirmado'))
);

CREATE INDEX IF NOT EXISTS escolta_solicitacao_alvos_solicitacao_idx
  ON public.escolta_solicitacao_alvos (solicitacao_id, ordem);

ALTER TABLE public.escolta_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escolta_solicitacao_alvos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for escolta_solicitacoes" ON public.escolta_solicitacoes;
CREATE POLICY "Allow all for escolta_solicitacoes"
  ON public.escolta_solicitacoes FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for escolta_solicitacao_alvos" ON public.escolta_solicitacao_alvos;
CREATE POLICY "Allow all for escolta_solicitacao_alvos"
  ON public.escolta_solicitacao_alvos FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.escolta_solicitacoes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escolta_solicitacao_alvos TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'escolta_solicitacoes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.escolta_solicitacoes;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'escolta_solicitacao_alvos'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.escolta_solicitacao_alvos;
    END IF;
  END IF;
  ALTER TABLE public.escolta_solicitacoes REPLICA IDENTITY FULL;
  ALTER TABLE public.escolta_solicitacao_alvos REPLICA IDENTITY FULL;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;
