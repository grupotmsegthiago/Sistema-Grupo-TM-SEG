-- Índices críticos pra acabar com o seq_scan da tabela system_logs (~207MB)
-- Rode no Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_system_logs_entity_created
  ON system_logs (entity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_entity_id
  ON system_logs (entity, entity_id);

CREATE INDEX IF NOT EXISTS idx_system_logs_action_type
  ON system_logs (action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON system_logs (created_at DESC);

-- Limpa logs antigos (>90 dias) que não servem mais e ocupam espaço
DELETE FROM system_logs
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND action_type IN ('HEARTBEAT', 'LOGIN', 'LOGOUT', 'OTHER');

-- Recarrega o cache do PostgREST
NOTIFY pgrst, 'reload schema';
