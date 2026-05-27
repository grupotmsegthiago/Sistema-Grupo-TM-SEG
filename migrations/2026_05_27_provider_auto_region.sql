-- Filtro de região do motor automático do fornecedor.
-- Quando preenchido (ex: 'SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE',
-- 'NORTE'), o motor só calcula custo para missões cuja região detectada
-- (UF→região) bate com esse valor. NULL/vazio = aplica a TODAS as regiões.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS auto_region text;

COMMENT ON COLUMN providers.auto_region IS
  'Filtro de regiao do motor auto (SUDESTE/SUL/CENTRO-OESTE/NORDESTE/NORTE). NULL = todas.';

-- Espelha a coluna na tabela legada para que callers do engine financeiro
-- que ainda não passam a lista `providers` continuem respeitando o filtro
-- via linha __AUTO_MASTER__ em provider_cost_tables.
ALTER TABLE provider_cost_tables
  ADD COLUMN IF NOT EXISTS auto_region text;

COMMENT ON COLUMN provider_cost_tables.auto_region IS
  'Compat Task #58: espelho do filtro de regiao do motor auto (apenas para a linha __AUTO_MASTER__).';
