-- ============================================================
-- PARTE 1 (SEGURA, NÃO APAGA NADA) — Rode esta primeiro
-- ============================================================
-- Cria 4 índices na tabela system_logs pra acabar com o
-- "scan sequencial" que estava lendo os 207 MB inteiros a cada
-- consulta. Não apaga nada, só organiza. Pode rodar a qualquer hora.

CREATE INDEX IF NOT EXISTS idx_system_logs_entity_created
  ON system_logs (entity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_entity_id
  ON system_logs (entity, entity_id);

CREATE INDEX IF NOT EXISTS idx_system_logs_action_type
  ON system_logs (action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON system_logs (created_at DESC);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PARTE 2 (OPCIONAL, APAGA LIXO TÉCNICO) — Rode depois,
-- só se quiser liberar espaço. NÃO rode junto com a Parte 1.
-- ============================================================
-- Apaga APENAS logs de monitoramento técnico mais antigos que
-- 90 dias (HEARTBEAT/LOGIN/LOGOUT/OTHER). NÃO apaga nada de
-- auditoria operacional, financeira, contratos ou equipamentos.
--
-- Pra rodar: descomente as linhas abaixo (tire os "--" do começo).

-- DELETE FROM system_logs
--   WHERE created_at < NOW() - INTERVAL '90 days'
--     AND action_type IN ('HEARTBEAT', 'LOGIN', 'LOGOUT', 'OTHER');
