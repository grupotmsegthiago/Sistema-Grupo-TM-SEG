-- Portal genérico do cliente (cópia do modelo IBL).
-- CEVA e IBL continuam nas tabelas próprias.
-- Anon/authenticated sem acesso. Escrita só pelo servidor, com service role.
-- Não aplicar este arquivo sem autorização. O código trata a ausência da coluna.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_slug text,
  ADD COLUMN IF NOT EXISTS portal_site text,
  ADD COLUMN IF NOT EXISTS portal_logo_url text,
  ADD COLUMN IF NOT EXISTS portal_cor text,
  ADD COLUMN IF NOT EXISTS portal_cor_acao text;

CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_slug_key
  ON public.clients (portal_slug)
  WHERE portal_slug IS NOT NULL AND portal_slug <> '';

ALTER TABLE public.ceva_portal_os_campos ADD COLUMN IF NOT EXISTS placa text;
ALTER TABLE public.ibl_portal_os_campos ADD COLUMN IF NOT EXISTS placa text;

CREATE TABLE IF NOT EXISTS public.portal_cliente_usuarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL,
  nome text NOT NULL,
  email text NOT NULL,
  senha_hash text,
  perfil text NOT NULL,
  status text NOT NULL,
  trocar_senha boolean NOT NULL DEFAULT false,
  senha_alterada_em timestamptz,
  criado_por integer,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_cliente_usuarios_email_key UNIQUE (client_id, email),
  CONSTRAINT portal_cliente_usuarios_perfil_check CHECK (perfil IN ('administrador', 'analista')),
  CONSTRAINT portal_cliente_usuarios_status_check CHECK (status IN ('pendente', 'ativo', 'inativo')),
  CONSTRAINT portal_cliente_usuarios_nome_check CHECK (char_length(nome) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_portal_cliente_usuarios_perfil
  ON public.portal_cliente_usuarios (client_id, perfil, status);

ALTER TABLE public.portal_cliente_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_cliente_usuarios FROM anon, authenticated;
GRANT ALL ON TABLE public.portal_cliente_usuarios TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.portal_cliente_usuarios_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.portal_cliente_usuarios_id_seq TO postgres, service_role;

CREATE TABLE IF NOT EXISTS public.portal_cliente_os_campos (
  mission_id text PRIMARY KEY,
  client_id bigint NOT NULL,
  solicitante text,
  quem_autorizou text,
  servico text,
  atendimento_pgr text,
  contrato text,
  operacao text,
  tsp text,
  placa text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portal_cliente_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL,
  campo text NOT NULL,
  valor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_cliente_catalogo_campo_check CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao', 'tsp', 'atendimento_pgr')),
  CONSTRAINT portal_cliente_catalogo_campo_valor_key UNIQUE (client_id, campo, valor)
);

CREATE TABLE IF NOT EXISTS public.portal_cliente_pgr_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL,
  mission_id text NOT NULL,
  valor text NOT NULL,
  valor_anterior text,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_cliente_pgr_historico_os
  ON public.portal_cliente_pgr_historico (mission_id, alterado_em DESC);

ALTER TABLE public.portal_cliente_os_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cliente_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cliente_pgr_historico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.portal_cliente_os_campos FROM anon, authenticated;
REVOKE ALL ON TABLE public.portal_cliente_catalogo FROM anon, authenticated;
REVOKE ALL ON TABLE public.portal_cliente_pgr_historico FROM anon, authenticated;
GRANT ALL ON TABLE public.portal_cliente_os_campos TO postgres, service_role;
GRANT ALL ON TABLE public.portal_cliente_catalogo TO postgres, service_role;
GRANT ALL ON TABLE public.portal_cliente_pgr_historico TO postgres, service_role;

CREATE SEQUENCE IF NOT EXISTS public.portal_cliente_solicitacao_num AS integer;

CREATE TABLE IF NOT EXISTS public.portal_cliente_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL,
  mission_id text,
  numero integer NOT NULL DEFAULT nextval('public.portal_cliente_solicitacao_num'),
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
  CONSTRAINT portal_cliente_solicitacoes_numero_key UNIQUE (numero)
);

ALTER SEQUENCE public.portal_cliente_solicitacao_num OWNED BY public.portal_cliente_solicitacoes.numero;

CREATE INDEX IF NOT EXISTS idx_portal_cliente_solicitacoes_created
  ON public.portal_cliente_solicitacoes (client_id, created_at DESC);

ALTER TABLE public.portal_cliente_solicitacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_cliente_solicitacoes FROM anon, authenticated;
GRANT ALL ON TABLE public.portal_cliente_solicitacoes TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.portal_cliente_solicitacao_num FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.portal_cliente_solicitacao_num TO postgres, service_role;
