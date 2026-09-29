-- TSP editável no controle de escolta. Contrato permanece gravado, só sai da tela.
-- Catálogo passa a aceitar TSP. Operação e TSP novas ficam restritas ao administrador no servidor.

ALTER TABLE public.ceva_portal_os_campos
  ADD COLUMN IF NOT EXISTS tsp text;

ALTER TABLE public.ceva_portal_catalogo
  DROP CONSTRAINT IF EXISTS ceva_portal_catalogo_campo_check;

ALTER TABLE public.ceva_portal_catalogo
  ADD CONSTRAINT ceva_portal_catalogo_campo_check
  CHECK (campo IN ('solicitante', 'quem_autorizou', 'servico', 'contrato', 'operacao', 'tsp'));
