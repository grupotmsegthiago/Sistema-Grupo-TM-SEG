-- Decisão do cliente sobre a medição da OS. Uma tabela para CEVA, IBL e portal genérico.
-- Aprovar deixa a linha verde. Conferir deixa amarela. Gravar a OS depois da conferência
-- marca "modificado" para o cliente ver "Modificação realizada" e poder aprovar.
-- Não altera o cálculo da OS. Se esta função falhar, a gravação da OS continua.

CREATE TABLE IF NOT EXISTS public.portal_medicao_cliente (
  mission_id text PRIMARY KEY,
  client_id bigint,
  status text NOT NULL,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  justificativa text,
  anexo_caminho text,
  anexo_nome text,
  pedido_em timestamptz,
  pedido_por text,
  aprovado_em timestamptz,
  aprovado_por text,
  modificado_em timestamptz,
  CONSTRAINT portal_medicao_cliente_status_check CHECK (status IN ('aprovado', 'conferir', 'modificado'))
);

ALTER TABLE public.portal_medicao_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_medicao_cliente FROM anon, authenticated;
GRANT ALL ON TABLE public.portal_medicao_cliente TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.portal_medicao_apos_gravar_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.portal_medicao_cliente
     SET status = 'modificado',
         modificado_em = now()
   WHERE mission_id = NEW.id
     AND status = 'conferir';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_medicao_apos_gravar_os ON public.missions;
CREATE TRIGGER portal_medicao_apos_gravar_os
AFTER UPDATE ON public.missions
FOR EACH ROW
WHEN (OLD IS DISTINCT FROM NEW)
EXECUTE FUNCTION public.portal_medicao_apos_gravar_os();
