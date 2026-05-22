-- Task #58: move o motor automático de fornecedor (antiga linha
-- __AUTO_MASTER__ em provider_cost_tables) para colunas dedicadas
-- em providers. Rode UMA VEZ no Supabase SQL Editor.
--
-- Comportamento:
--   * auto_calc_enabled: liga/desliga o motor para o fornecedor.
--   * auto_base_value:   "Valor Base (Acionamento)" da faixa-base.
--   * auto_base_km:      KM da faixa-base (ex: 100).
--   * auto_base_hr:      Horas da faixa-base (ex: 3).
--   * auto_extra_km:     R$/km excedente.
--   * auto_extra_hr:     R$/hora excedente.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS auto_calc_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_base_value   numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_base_km      numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_base_hr      numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_extra_km     numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_extra_hr     numeric(12,2);

COMMENT ON COLUMN providers.auto_calc_enabled IS 'Task #58: motor automático ligado para o fornecedor.';
COMMENT ON COLUMN providers.auto_base_value   IS 'Task #58: valor base (acionamento) da faixa-base.';
COMMENT ON COLUMN providers.auto_base_km      IS 'Task #58: KM da faixa-base (ex: 100).';
COMMENT ON COLUMN providers.auto_base_hr      IS 'Task #58: horas da faixa-base (ex: 3).';
COMMENT ON COLUMN providers.auto_extra_km     IS 'Task #58: R$/km excedente.';
COMMENT ON COLUMN providers.auto_extra_hr     IS 'Task #58: R$/hora excedente.';

-- Backfill: copia a linha __AUTO_MASTER__ existente em provider_cost_tables
-- para as novas colunas em providers. Casamento por nome (case/trim-insensível).
WITH masters AS (
  SELECT DISTINCT ON (UPPER(TRIM(provider)))
    UPPER(TRIM(provider))            AS provider_key,
    activation_cost                  AS base_value,
    franchise_km                     AS base_km,
    franchise_hours                  AS base_hr,
    cost_per_extra_km                AS extra_km,
    cost_per_extra_hour              AS extra_hr
  FROM provider_cost_tables
  WHERE UPPER(TRIM(operation_type)) = '__AUTO_MASTER__'
  ORDER BY UPPER(TRIM(provider)), id
)
UPDATE providers p
SET auto_calc_enabled = true,
    auto_base_value   = COALESCE(p.auto_base_value, m.base_value),
    auto_base_km      = COALESCE(p.auto_base_km,    m.base_km),
    auto_base_hr      = COALESCE(p.auto_base_hr,    m.base_hr),
    auto_extra_km     = COALESCE(p.auto_extra_km,   m.extra_km),
    auto_extra_hr     = COALESCE(p.auto_extra_hr,   m.extra_hr)
FROM masters m
WHERE UPPER(TRIM(p.name)) = m.provider_key;

-- As linhas __AUTO_MASTER__ existentes em provider_cost_tables são
-- preservadas como fallback durante a transição: o motor financeiro ainda
-- as consulta enquanto callers não passarem a lista de providers para
-- `calculateMissionFinancials`. A partir desta migration, porém, providers
-- têm a fonte canônica nas colunas dedicadas — ProviderForm grava nos dois
-- lados (write-through) para manter os snapshots financeiros consistentes.
-- Uma task subsequente vai remover as linhas legadas depois que todas as
-- chamadas do engine passarem `providers`.
-- (Sem DELETE intencional aqui.)
