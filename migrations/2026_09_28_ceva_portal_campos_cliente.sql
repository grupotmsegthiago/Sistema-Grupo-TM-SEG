-- Campos preenchidos pelo cliente no controle de escolta (/ceva).
-- Filtros reutilizáveis ficam no catálogo. PGR guarda histórico e não vira filtro.
-- Anon/authenticated sem acesso (fail-closed).

CREATE TABLE IF NOT EXISTS public.ceva_portal_os_campos (
  mission_id text PRIMARY KEY,
  solicitante text,
  quem_autorizou text,
  servico text,
  atendimento_pgr text,
  contrato text,
  operacao text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ceva_portal_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo text NOT NULL,
  valor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ceva_portal_catalogo_campo_check CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao')),
  CONSTRAINT ceva_portal_catalogo_campo_valor_key UNIQUE (campo, valor)
);

CREATE TABLE IF NOT EXISTS public.ceva_portal_pgr_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  valor text NOT NULL,
  valor_anterior text,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ceva_portal_pgr_historico_os
  ON public.ceva_portal_pgr_historico (mission_id, alterado_em DESC);

ALTER TABLE public.ceva_portal_os_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceva_portal_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceva_portal_pgr_historico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ceva_portal_os_campos FROM anon, authenticated;
REVOKE ALL ON TABLE public.ceva_portal_catalogo FROM anon, authenticated;
REVOKE ALL ON TABLE public.ceva_portal_pgr_historico FROM anon, authenticated;
GRANT ALL ON TABLE public.ceva_portal_os_campos TO postgres, service_role;
GRANT ALL ON TABLE public.ceva_portal_catalogo TO postgres, service_role;
GRANT ALL ON TABLE public.ceva_portal_pgr_historico TO postgres, service_role;
