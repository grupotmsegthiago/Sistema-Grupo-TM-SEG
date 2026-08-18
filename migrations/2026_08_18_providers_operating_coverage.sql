-- Estados de atuação do fornecedor (sede + filiais) e valor 100 km por UF.
-- Usado no cadastro e no mapa de acionamento. Ausência = ranking legado pelas tabelas.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS operating_coverage jsonb;

COMMENT ON COLUMN providers.operating_coverage IS
  'Cobertura de atuação: [{ "uf": "SP", "city": "São Paulo", "cost100km": 430, "isHq": true }]. NULL = usa tabelas 100 km.';
