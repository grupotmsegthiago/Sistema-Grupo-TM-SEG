-- Lista reutilizável de atendimento PGR no catálogo do portal.
-- Não apaga nome já gravado nas OS. Não aplicar sem autorização.

ALTER TABLE public.ceva_portal_catalogo
  DROP CONSTRAINT IF EXISTS ceva_portal_catalogo_campo_check;

ALTER TABLE public.ceva_portal_catalogo
  ADD CONSTRAINT ceva_portal_catalogo_campo_check
  CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao', 'tsp', 'atendimento_pgr'));

ALTER TABLE public.ibl_portal_catalogo
  DROP CONSTRAINT IF EXISTS ibl_portal_catalogo_campo_check;

ALTER TABLE public.ibl_portal_catalogo
  ADD CONSTRAINT ibl_portal_catalogo_campo_check
  CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao', 'tsp', 'atendimento_pgr'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_cliente_catalogo_campo_check'
  ) THEN
    ALTER TABLE public.portal_cliente_catalogo DROP CONSTRAINT portal_cliente_catalogo_campo_check;
    ALTER TABLE public.portal_cliente_catalogo
      ADD CONSTRAINT portal_cliente_catalogo_campo_check
      CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao', 'tsp', 'atendimento_pgr'));
  END IF;
END $$;
