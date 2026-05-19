-- ============================================================================
-- CORREÇÃO RÁPIDA — provider_id UUID -> TEXT
-- ----------------------------------------------------------------------------
-- Por que rodar isto?
--   A migração anterior criou provider_id como UUID, mas neste sistema
--   providers.id é numérico (ex.: "70"). Isso quebra o INSERT do link DHL com:
--     invalid input syntax for type uuid: "70"
--
-- Como aplicar (uma vez):
--   1. Supabase Studio -> SQL Editor
--   2. Cole TODO este conteúdo
--   3. Clique em "Run"
-- ============================================================================

ALTER TABLE public.dhl_supplier_intakes
  ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;

ALTER TABLE public.provider_escoltistas
  ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;

ALTER TABLE public.provider_intake_vehicles
  ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;

NOTIFY pgrst, 'reload schema';
