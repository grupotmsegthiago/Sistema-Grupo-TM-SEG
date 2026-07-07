-- =============================================================================
-- RECUPERAR PATRIMÔNIO A PARTIR DO BACKUP DO SUPABASE
-- Projeto: ajhmmjuewdsukecaimik (Grupo TM SEG)
-- =============================================================================
--
-- ATENÇÃO: NÃO use "Restore" completo na produção se você quer manter
-- missões, RH e financeiro atuais. Restaurar o projeto inteiro volta TUDO
-- para a data escolhida e apaga alterações posteriores.
--
-- CAMINHO SEGURO (recomendado):
-- 1) Supabase Dashboard → projeto TM SEG → Database → Backups
-- 2) Veja se existe aba "Scheduled backups" (plano Pro: últimos 7 dias)
--    ou "Point in Time" / PITR (se estiver ativo)
-- 3) Baixe um backup de ANTES da limpeza de logs (Manutenção → Rotação)
--    ou escolha data em que o patrimônio ainda existia
--
-- OPÇÃO A — Exportar só patrimônio (se tiver acesso a cópia/restauração temporária)
-- Rode no SQL Editor (no banco que contém os dados antigos):

SELECT jsonb_pretty(
  jsonb_build_object(
    'timestamp', now(),
    'version', 'supabase-export',
    'content', jsonb_build_object(
      'equipment_registry', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', id,
              'created_at', created_at,
              'entity', entity,
              'entity_id', entity_id,
              'action_type', action_type,
              'details', details
            )
            ORDER BY created_at DESC
          )
          FROM system_logs
          WHERE entity IN ('EquipmentRegistry', 'UserEquipment')
        ),
        '[]'::jsonb
      )
    )
  )
) AS backup_json;

-- Copie o resultado → salve como patrimonio-recuperado.json
-- No sistema: Patrimônio & Equipamentos → Importar backup

-- -----------------------------------------------------------------------------
-- OPÇÃO B — Verificar se AINDA existe algo no banco atual (produção)
-- -----------------------------------------------------------------------------

SELECT 'EquipmentRegistry' AS fonte, count(*) AS total
FROM system_logs WHERE entity = 'EquipmentRegistry'
UNION ALL
SELECT 'UserEquipment', count(*)
FROM system_logs WHERE entity = 'UserEquipment'
UNION ALL
SELECT 'Vestígios PAT-', count(*)
FROM system_logs
WHERE details ILIKE '%PAT-%' OR details ILIKE '%patrimony_id%';

-- -----------------------------------------------------------------------------
-- OPÇÃO C — Restauração completa (ÚLTIMO RECURSO — afeta todo o sistema)
-- -----------------------------------------------------------------------------
-- Dashboard → Database → Backups → Point in Time (ou Scheduled)
-- Escolha data/hora ANTES da perda (ex.: dia anterior à rotação de logs)
-- O site ficará fora do ar durante a restauração (minutos a horas)
-- Só use se aceitar perder TODAS as alterações feitas depois dessa data.

-- -----------------------------------------------------------------------------
-- OPÇÃO D — Suporte Supabase
-- -----------------------------------------------------------------------------
-- Se não aparecer backup: Settings → Billing (confirmar plano Pro)
-- Abrir ticket pedindo extração pontual da tabela system_logs
-- (entity = EquipmentRegistry) de um backup diário, sem restore completo.
