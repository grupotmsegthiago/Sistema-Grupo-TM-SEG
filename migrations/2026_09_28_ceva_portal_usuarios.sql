-- Pessoas do portal CEVA (/ceva). Separadas dos usuários internos do sistema.
-- Anon/authenticated sem acesso. Escrita só pelo servidor, com service role.

CREATE TABLE IF NOT EXISTS public.ceva_portal_usuarios (
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
  CONSTRAINT ceva_portal_usuarios_email_key UNIQUE (email),
  CONSTRAINT ceva_portal_usuarios_perfil_check CHECK (perfil IN ('administrador', 'analista')),
  CONSTRAINT ceva_portal_usuarios_status_check CHECK (status IN ('pendente', 'ativo', 'inativo')),
  CONSTRAINT ceva_portal_usuarios_nome_check CHECK (char_length(nome) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_ceva_portal_usuarios_perfil
  ON public.ceva_portal_usuarios (perfil, status);

ALTER TABLE public.ceva_portal_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ceva_portal_usuarios FROM anon, authenticated;
GRANT ALL ON TABLE public.ceva_portal_usuarios TO postgres, service_role;
REVOKE ALL ON SEQUENCE public.ceva_portal_usuarios_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ceva_portal_usuarios_id_seq TO postgres, service_role;

ALTER TABLE public.ceva_portal_usuarios
  ADD COLUMN IF NOT EXISTS trocar_senha boolean NOT NULL DEFAULT false;
