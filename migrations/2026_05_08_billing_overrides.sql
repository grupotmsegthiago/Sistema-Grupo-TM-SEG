-- Adiciona controles manuais de inclusão/exclusão da OS nos boletins de medição.
-- Rode este SQL no painel do Supabase (SQL Editor) UMA VEZ.
--
-- Comportamento:
--   * billing_period_override: se preenchido, o boletim usa esta data em vez de
--     start_time pra decidir em qual período a OS aparece. Útil pra Cancelada
--     auditada num mês diferente da viagem (ex: GTM-4261 viajou em mar/aud em abr).
--   * exclude_from_billing: se true, a OS NÃO aparece em nenhum boletim de
--     medição. Não afeta o sistema, só esconde do boletim.

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS billing_period_override timestamptz,
  ADD COLUMN IF NOT EXISTS exclude_from_billing boolean DEFAULT false;

COMMENT ON COLUMN missions.billing_period_override IS
  'Data manual usada pelo Boletim de Medição em vez de start_time. NULL = usa start_time.';
COMMENT ON COLUMN missions.exclude_from_billing IS
  'Se true, OS não aparece em nenhum boletim de medição (não afeta o sistema).';
