-- ─────────────────────────────────────────────────────────────────────────────
-- Adiciona colunas na tabela `agents` para receber os dados completos vindos
-- do intake público do fornecedor (página /fornecedor/dhl).
--
-- Idempotente — pode rodar várias vezes sem efeito colateral.
--
-- Execute no SQL Editor do Supabase (Project > SQL Editor > New Query).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE agents ADD COLUMN IF NOT EXISTS orgao_emissor TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cnh_categoria TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rua           TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS numero        TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS complemento   TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS bairro        TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cidade        TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS uf            TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cep           TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS admissao      DATE;

-- Índice por CPF para upsert rápido a partir do intake.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_cpf_unique ON agents (cpf) WHERE cpf IS NOT NULL;
