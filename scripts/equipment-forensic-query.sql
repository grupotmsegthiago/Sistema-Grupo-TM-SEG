-- Diagnóstico de patrimônio apagado (rodar no SQL Editor do Supabase)
-- Se todas as consultas retornarem 0, os dados foram apagados de forma definitiva.

-- 1) Registros centrais de patrimônio
SELECT id, created_at, action_type, entity, entity_id, left(details, 120) AS preview
FROM system_logs
WHERE entity = 'EquipmentRegistry'
ORDER BY created_at DESC
LIMIT 20;

-- 2) Cadastros legados por usuário
SELECT id, created_at, entity_id, left(details, 120) AS preview
FROM system_logs
WHERE entity = 'UserEquipment'
ORDER BY created_at DESC
LIMIT 50;

-- 3) Qualquer vestígio em details (PAT- ou patrimony_id)
SELECT id, created_at, entity, entity_id, left(details, 160) AS preview
FROM system_logs
WHERE details ILIKE '%patrimony_id%'
   OR details ILIKE '%"equipments"%'
   OR details ILIKE '%PAT-%'
ORDER BY created_at DESC
LIMIT 50;

-- 4) Histórico de backups gerados pelo sistema
SELECT id, created_at, file_name, file_size, record_count, status
FROM backup_history
ORDER BY created_at DESC
LIMIT 10;
