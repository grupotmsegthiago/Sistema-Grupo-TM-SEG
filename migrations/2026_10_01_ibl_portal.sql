-- Portal externo IBL (/ibl). Mesma estrutura do portal CEVA, tabelas separadas.
-- Cliente: INTERMODAL BRASIL LOGISTICA S.A.
-- Anon/authenticated sem acesso. Escrita só pelo servidor, com service role.

CREATE TABLE IF NOT EXISTS public.ibl_portal_usuarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  email text NOT NULL,
  senha_hash text,
  perfil text NOT NULL,
  status text NOT NULL,
  trocar_senha boolean NOT NULL DEFAULT false,
  criado_por integer,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ibl_portal_usuarios_email_key UNIQUE (email),
  CONSTRAINT ibl_portal_usuarios_perfil_check CHECK (perfil IN ('administrador', 'analista')),
  CONSTRAINT ibl_portal_usuarios_status_check CHECK (status IN ('pendente', 'ativo', 'inativo')),
  CONSTRAINT ibl_portal_usuarios_nome_check CHECK (char_length(nome) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_ibl_portal_usuarios_perfil
  ON public.ibl_portal_usuarios (perfil, status);

ALTER TABLE public.ibl_portal_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ibl_portal_usuarios FROM anon, authenticated;
GRANT ALL ON TABLE public.ibl_portal_usuarios TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.ibl_portal_usuarios_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ibl_portal_usuarios_id_seq TO postgres, service_role;

CREATE TABLE IF NOT EXISTS public.ibl_portal_os_campos (
  mission_id text PRIMARY KEY,
  solicitante text,
  quem_autorizou text,
  servico text,
  atendimento_pgr text,
  contrato text,
  operacao text,
  tsp text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibl_portal_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo text NOT NULL,
  valor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ibl_portal_catalogo_campo_check CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao', 'tsp')),
  CONSTRAINT ibl_portal_catalogo_campo_valor_key UNIQUE (campo, valor)
);

CREATE TABLE IF NOT EXISTS public.ibl_portal_pgr_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  valor text NOT NULL,
  valor_anterior text,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ibl_portal_pgr_historico_os
  ON public.ibl_portal_pgr_historico (mission_id, alterado_em DESC);

ALTER TABLE public.ibl_portal_os_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibl_portal_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibl_portal_pgr_historico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ibl_portal_os_campos FROM anon, authenticated;
REVOKE ALL ON TABLE public.ibl_portal_catalogo FROM anon, authenticated;
REVOKE ALL ON TABLE public.ibl_portal_pgr_historico FROM anon, authenticated;
GRANT ALL ON TABLE public.ibl_portal_os_campos TO postgres, service_role;
GRANT ALL ON TABLE public.ibl_portal_catalogo TO postgres, service_role;
GRANT ALL ON TABLE public.ibl_portal_pgr_historico TO postgres, service_role;

CREATE SEQUENCE IF NOT EXISTS public.ibl_escolta_solicitacao_num AS integer;

CREATE TABLE IF NOT EXISTS public.ibl_escolta_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.ibl_escolta_solicitacao_num'),
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
  CONSTRAINT ibl_escolta_solicitacoes_numero_key UNIQUE (numero)
);

ALTER SEQUENCE public.ibl_escolta_solicitacao_num OWNED BY public.ibl_escolta_solicitacoes.numero;

CREATE INDEX IF NOT EXISTS idx_ibl_escolta_solicitacoes_created
  ON public.ibl_escolta_solicitacoes (created_at DESC);

ALTER TABLE public.ibl_escolta_solicitacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ibl_escolta_solicitacoes FROM anon, authenticated;
GRANT ALL ON TABLE public.ibl_escolta_solicitacoes TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.ibl_escolta_solicitacao_num FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ibl_escolta_solicitacao_num TO postgres, service_role;
