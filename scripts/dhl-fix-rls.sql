-- ============================================================================
-- CORREÇÃO RÁPIDA — Desabilita RLS nas tabelas DHL
-- ----------------------------------------------------------------------------
-- Por que rodar isto?
--   O Supabase liga RLS automaticamente em tabelas novas. Como estas tabelas
--   só são acessadas via API autenticada do backend (nunca pelo cliente),
--   o INSERT falha com:
--     new row violates row-level security policy for table "dhl_supplier_intakes"
--
-- Como aplicar (uma vez):
--   1. Supabase Studio -> SQL Editor
--   2. Cole TODO este conteúdo
--   3. Clique em "Run"
-- ============================================================================

ALTER TABLE public.dhl_supplier_intakes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhl_supplier_intake_resends DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_escoltistas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_intake_vehicles DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
