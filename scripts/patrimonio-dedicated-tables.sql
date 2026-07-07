-- Patrimônio TM SEG — tabelas dedicadas (NÃO usar system_logs)
-- Rodar no SQL Editor do Supabase (projeto ajhmmjuewdsukecaimik)

-- Equipamentos (um registro por item)
CREATE TABLE IF NOT EXISTS patrimonio_equipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patrimony_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'outro',
  brand TEXT DEFAULT '',
  model TEXT DEFAULT '',
  serial_number TEXT DEFAULT '',
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  assigned_to TEXT DEFAULT '',
  assigned_to_name TEXT DEFAULT '',
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsibility_term JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS patrimonio_equipments_patrimony_id_uidx
  ON patrimonio_equipments (patrimony_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS patrimonio_equipments_assigned_to_idx
  ON patrimonio_equipments (assigned_to) WHERE deleted_at IS NULL;

-- Tipos customizados de equipamento
CREATE TABLE IF NOT EXISTS patrimonio_custom_types (
  value TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backups automáticos (6h) — separado de system_logs e system_settings
CREATE TABLE IF NOT EXISTS patrimonio_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'cron_6h',
  item_count INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  payload JSONB,
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'ok',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS patrimonio_backups_created_at_idx
  ON patrimonio_backups (created_at DESC);

-- Conformidade do colaborador (autodeclaração + termo assinado)
CREATE TABLE IF NOT EXISTS patrimonio_employee_compliance (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  declared_at TIMESTAMPTZ,
  contract_signed_at TIMESTAMPTZ,
  items_count INTEGER NOT NULL DEFAULT 0,
  declared_items JSONB,
  contract JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE patrimonio_employee_compliance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patrimonio_compliance_all ON patrimonio_employee_compliance;
CREATE POLICY patrimonio_compliance_all ON patrimonio_employee_compliance
  FOR ALL USING (true) WITH CHECK (true);

-- RLS: leitura/escrita para anon autenticado via app (mesmo padrão de outras tabelas)
ALTER TABLE patrimonio_equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio_custom_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patrimonio_equipments_all ON patrimonio_equipments;
CREATE POLICY patrimonio_equipments_all ON patrimonio_equipments
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS patrimonio_custom_types_all ON patrimonio_custom_types;
CREATE POLICY patrimonio_custom_types_all ON patrimonio_custom_types
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS patrimonio_backups_select ON patrimonio_backups;
CREATE POLICY patrimonio_backups_select ON patrimonio_backups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS patrimonio_backups_insert ON patrimonio_backups;
CREATE POLICY patrimonio_backups_insert ON patrimonio_backups
  FOR INSERT WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
