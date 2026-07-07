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

-- 5) Legado Replit — patrimônio pode estar em system_settings (não em system_logs)
SELECT key, jsonb_typeof(value) AS tipo, left(value::text, 200) AS preview
FROM system_settings
WHERE key ILIKE '%equip%'
   OR key ILIKE '%patrim%'
   OR key ILIKE '%registry%'
   OR value::text ILIKE '%patrimony_id%'
   OR value::text ILIKE '%"equipments"%'
ORDER BY key;

-- 8) Tabelas dedicadas (padrão atual — fora de system_logs)
SELECT count(*) AS ativos FROM patrimonio_equipments WHERE deleted_at IS NULL;
SELECT id, created_at, source, item_count, storage_path, status
FROM patrimonio_backups ORDER BY created_at DESC LIMIT 10;

-- 7) Detalhe dos 2 UserEquipment (expandir JSON)
SELECT entity_id AS usuario_id, created_at, details
FROM system_logs
WHERE entity = 'UserEquipment'
ORDER BY created_at DESC;
