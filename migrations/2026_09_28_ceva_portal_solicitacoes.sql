-- Portal externo CEVA (/ceva): lado do cliente (colunas A–N da planilha de escolta).
-- Quem preencheu fica gravado no servidor. Anon/authenticated sem acesso (fail-closed).

CREATE SEQUENCE IF NOT EXISTS public.ceva_escolta_solicitacao_num AS integer;

CREATE TABLE IF NOT EXISTS public.ceva_escolta_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.ceva_escolta_solicitacao_num'),
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz,
  solicitante text NOT NULL,
  quem_autorizou text,
  servico text NOT NULL,
  atendimento_pgr text,
  contrato text,
  operacao text,
  tsp text,
  placa text,
  motorista text,
  franquia_hora text,
  franquia_km text,
  filled_by_user_id text NOT NULL,
  filled_by_name text NOT NULL,
  filled_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ceva_escolta_solicitacoes_numero_key UNIQUE (numero)
);

ALTER SEQUENCE public.ceva_escolta_solicitacao_num OWNED BY public.ceva_escolta_solicitacoes.numero;

CREATE INDEX IF NOT EXISTS idx_ceva_escolta_solicitacoes_created
  ON public.ceva_escolta_solicitacoes (created_at DESC);

ALTER TABLE public.ceva_escolta_solicitacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ceva_escolta_solicitacoes FROM anon, authenticated;
GRANT ALL ON TABLE public.ceva_escolta_solicitacoes TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.ceva_escolta_solicitacao_num FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ceva_escolta_solicitacao_num TO postgres, service_role;
