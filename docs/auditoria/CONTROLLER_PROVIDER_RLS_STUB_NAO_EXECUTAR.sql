-- =============================================================================
-- STUB RLS — perfil controller (somente fornecedor) — NÃO EXECUTAR
-- =============================================================================
-- Contexto TM SEG: login customizado; o browser usa role Postgres `anon`.
-- Policies baseadas em auth.uid()/JWT de perfil NÃO se aplicam ao modelo atual.
-- Escopo controller/Plínio é enforced no front (MissionFinancialModal /
-- UpdateMissionModal) e deve migrar para API autenticada antes de RLS real.
--
-- Este arquivo documenta a intenção futura. NÃO aplicar no Supabase agora.
-- Ver também: docs/auditoria/F4_P0_RLS_PLANO_SQL_NAO_EXECUTAR.md
-- =============================================================================

-- NÃO EXECUTAR
-- BEGIN;

-- Exemplo ilustrativo (inválido no modelo atual sem claim de role no JWT):
-- CREATE POLICY missions_controller_provider_only_update
--   ON public.missions
--   FOR UPDATE
--   TO authenticated
--   USING (auth.jwt() ->> 'role' = 'controller')
--   WITH CHECK (
--     -- Apenas colunas de fornecedor podem mudar; lado cliente imutável.
--     revenue_value IS NOT DISTINCT FROM (SELECT m.revenue_value FROM public.missions m WHERE m.id = missions.id)
--     AND toll_value IS NOT DISTINCT FROM (SELECT m.toll_value FROM public.missions m WHERE m.id = missions.id)
--     AND displacement_value IS NOT DISTINCT FROM (SELECT m.displacement_value FROM public.missions m WHERE m.id = missions.id)
--     AND billing_approved IS NOT DISTINCT FROM (SELECT m.billing_approved FROM public.missions m WHERE m.id = missions.id)
--     AND billing_verified_by IS NOT DISTINCT FROM (SELECT m.billing_verified_by FROM public.missions m WHERE m.id = missions.id)
--   );

-- COMMIT;

-- Pré-requisitos antes de qualquer tentativa real:
-- 1) Autenticação Supabase Auth (ou JWT custom com claim `role`)
-- 2) Remover policy ampla FOR ALL TO anon USING (true)
-- 3) Rotas de mutação financeira via service_role no backend
-- 4) Smoke de login + salvar custo com motivo + tentativa de mutar receita
