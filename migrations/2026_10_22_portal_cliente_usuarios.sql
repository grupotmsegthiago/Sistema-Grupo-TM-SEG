-- Acesso do portal genérico. CEVA e IBL continuam nas tabelas próprias.
-- O primeiro administrador nasce com e-mail portal@domínio e senha igual ao CNPJ.
-- No primeiro acesso ele troca o e-mail e a senha. A equipe interna entra com o login do sistema.

CREATE TABLE IF NOT EXISTS public.portal_cliente_usuarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL,
  nome text NOT NULL,
  email text NOT NULL,
  senha_hash text,
  perfil text NOT NULL,
  status text NOT NULL,
  trocar_senha boolean NOT NULL DEFAULT false,
  trocar_email boolean NOT NULL DEFAULT false,
  senha_alterada_em timestamptz,
  criado_por integer,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_cliente_usuarios_email_key UNIQUE (client_id, email),
  CONSTRAINT portal_cliente_usuarios_perfil_check CHECK (perfil IN ('administrador', 'analista')),
  CONSTRAINT portal_cliente_usuarios_status_check CHECK (status IN ('pendente', 'ativo', 'inativo')),
  CONSTRAINT portal_cliente_usuarios_nome_check CHECK (char_length(nome) BETWEEN 2 AND 120)
);

ALTER TABLE public.portal_cliente_usuarios
  ADD COLUMN IF NOT EXISTS trocar_email boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_portal_cliente_usuarios_perfil
  ON public.portal_cliente_usuarios (client_id, perfil, status);

ALTER TABLE public.portal_cliente_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_cliente_usuarios FROM anon, authenticated;
GRANT ALL ON TABLE public.portal_cliente_usuarios TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.portal_cliente_usuarios_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.portal_cliente_usuarios_id_seq TO postgres, service_role;
