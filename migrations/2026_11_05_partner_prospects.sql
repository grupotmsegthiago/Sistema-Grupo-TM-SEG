-- Radar de Parceiros (prospecção de escolta).
-- Fila isolada: não grava em providers nem em provider_cost_tables até a homologação.
-- NÃO aplicar por conta própria. Rodar no SQL Editor do projeto ajhmmjuewdsukecaimik
-- depois de validar a tela em http://localhost:5000/.
-- App usa chave anon (não auth.uid). RLS permissiva, padrão das demais tabelas operacionais.

BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj varchar(14),
  company_name text NOT NULL,
  trade_name text,
  state_uf varchar(2),
  city text,
  email text,
  phone text,
  website text,
  contact_name text,
  pf_authorization_number text,
  pf_status text NOT NULL DEFAULT 'nao_verificado'
    CHECK (pf_status IN ('regular', 'pendente', 'nao_verificado')),
  status text NOT NULL DEFAULT 'radar'
    CHECK (status IN (
      'radar',
      'email_enviado',
      'em_negociacao',
      'tabela_recebida',
      'homologacao',
      'ativo',
      'descartado'
    )),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('receita_federal', 'policia_federal', 'google', 'csv', 'manual', 'robo_24h')),
  notes text,
  email_sent_at timestamptz,
  email_subject text,
  document_url text,
  alvara_validity date,
  provider_id text,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_prospects_cnpj_digits CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_prospects_cnpj_uk
  ON public.partner_prospects (cnpj);

CREATE INDEX IF NOT EXISTS partner_prospects_status_idx
  ON public.partner_prospects (status);

CREATE INDEX IF NOT EXISTS partner_prospects_uf_idx
  ON public.partner_prospects (state_uf);

CREATE TABLE IF NOT EXISTS public.partner_prospect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_prospect_events_prospect_idx
  ON public.partner_prospect_events (prospect_id, created_at DESC);

ALTER TABLE public.partner_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_prospect_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_prospects_all ON public.partner_prospects;
CREATE POLICY partner_prospects_all ON public.partner_prospects
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS partner_prospect_events_all ON public.partner_prospect_events;
CREATE POLICY partner_prospect_events_all ON public.partner_prospect_events
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_prospects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_prospect_events TO anon, authenticated;

COMMENT ON TABLE public.partner_prospects IS
  'Fila comercial de prospecção de escolta. Só vira providers após homologação (status Bloqueado até liberação).';

COMMIT;
