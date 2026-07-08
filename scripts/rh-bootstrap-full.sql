-- Bootstrap RH TM SEG — executar uma vez no Supabase SQL Editor

-- ============================================================================
-- DHL Supplier Intake — Migração única para o Supabase
-- ============================================================================
-- Como aplicar (só precisa rodar UMA vez):
--   1. Abra o Supabase Studio → SQL Editor
--   2. Cole TODO o conteúdo deste arquivo
--   3. Clique em "Run"
-- ----------------------------------------------------------------------------
-- Após esta execução, todas as migrações automáticas do servidor passam a
-- funcionar (porque criamos a função exec_sql que o backend já espera).
-- ============================================================================

-- 1) Função utilitária usada pelas migrações automáticas do backend
CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Departamentos
CREATE TABLE IF NOT EXISTS rh_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  manager_employee_id UUID,
  cost_center TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rh_departments_name ON rh_departments (name) WHERE deleted_at IS NULL;

-- Cargos
CREATE TABLE IF NOT EXISTS rh_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department_id UUID REFERENCES rh_departments(id),
  description TEXT,
  cbo_code TEXT,
  base_salary NUMERIC(12,2) DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rh_positions_department ON rh_positions (department_id) WHERE deleted_at IS NULL;

-- Funcionários (dados RH — vinculados opcionalmente a system_users)
CREATE TABLE IF NOT EXISTS rh_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  matricula TEXT UNIQUE,
  full_name TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  cnh TEXT,
  cnh_category TEXT,
  cnh_expiry DATE,
  birth_date DATE,
  marital_status TEXT,
  gender TEXT,
  nationality TEXT DEFAULT 'Brasileira',
  birthplace TEXT,
  mother_name TEXT,
  father_name TEXT,
  photo_url TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  zip_code TEXT,
  street TEXT,
  address_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  admission_date DATE,
  contract_type TEXT DEFAULT 'CLT',
  position_id UUID REFERENCES rh_positions(id),
  department_id UUID REFERENCES rh_departments(id),
  supervisor_employee_id UUID,
  manager_employee_id UUID,
  cost_center TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo',
  probation_end_date DATE,
  dismissal_date DATE,
  dismissal_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_rh_employees_user ON rh_employees (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_employees_status ON rh_employees (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_employees_department ON rh_employees (department_id) WHERE deleted_at IS NULL;

-- Dados bancários
CREATE TABLE IF NOT EXISTS rh_employee_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  bank_name TEXT,
  bank_code TEXT,
  agency TEXT,
  account_number TEXT,
  account_type TEXT DEFAULT 'Corrente',
  pix_key TEXT,
  beneficiary_name TEXT,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Documentos
CREATE TABLE IF NOT EXISTS rh_employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  mime_type TEXT,
  expiry_date DATE,
  notes TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Dependentes
CREATE TABLE IF NOT EXISTS rh_employee_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT,
  birth_date DATE,
  cpf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Contatos de emergência
CREATE TABLE IF NOT EXISTS rh_employee_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Configuração salarial
CREATE TABLE IF NOT EXISTS rh_salary_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  night_shift_bonus NUMERIC(12,2) DEFAULT 0,
  hazard_pay NUMERIC(12,2) DEFAULT 0,
  unhealthy_pay NUMERIC(12,2) DEFAULT 0,
  overtime_hours NUMERIC(8,2) DEFAULT 0,
  overtime_rate_pct NUMERIC(5,2) DEFAULT 50,
  transport_voucher NUMERIC(12,2) DEFAULT 0,
  meal_voucher NUMERIC(12,2) DEFAULT 0,
  food_voucher NUMERIC(12,2) DEFAULT 0,
  health_plan NUMERIC(12,2) DEFAULT 0,
  dental_plan NUMERIC(12,2) DEFAULT 0,
  other_benefits NUMERIC(12,2) DEFAULT 0,
  inss_discount NUMERIC(12,2) DEFAULT 0,
  irrf_discount NUMERIC(12,2) DEFAULT 0,
  fgts_pct NUMERIC(5,2) DEFAULT 8,
  alimony NUMERIC(12,2) DEFAULT 0,
  other_discounts NUMERIC(12,2) DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_rh_salary_employee ON rh_salary_configs (employee_id) WHERE deleted_at IS NULL;

-- Faixas INSS / IRRF (configuráveis)
CREATE TABLE IF NOT EXISTS rh_tax_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type TEXT NOT NULL,
  bracket_from NUMERIC(12,2) NOT NULL DEFAULT 0,
  bracket_to NUMERIC(12,2),
  rate_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  deduction NUMERIC(12,2) DEFAULT 0,
  year INT NOT NULL DEFAULT 2026,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catálogo de benefícios
CREATE TABLE IF NOT EXISTS rh_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  benefit_type TEXT NOT NULL,
  default_value NUMERIC(12,2) DEFAULT 0,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Benefícios por funcionário
CREATE TABLE IF NOT EXISTS rh_employee_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  benefit_id UUID REFERENCES rh_benefits(id),
  benefit_name TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Regras de comissão
CREATE TABLE IF NOT EXISTS rh_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  calc_type TEXT NOT NULL DEFAULT 'fixed',
  fixed_value NUMERIC(12,2) DEFAULT 0,
  percent_value NUMERIC(6,2) DEFAULT 0,
  min_threshold NUMERIC(12,2) DEFAULT 0,
  client_filter TEXT,
  service_filter TEXT,
  vehicle_filter TEXT,
  region_filter TEXT,
  team_filter TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Comissões calculadas
CREATE TABLE IF NOT EXISTS rh_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  rule_id UUID REFERENCES rh_commission_rules(id),
  mission_id TEXT,
  reference_month TEXT,
  description TEXT,
  base_amount NUMERIC(12,2) DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'Pendente',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Premiações
CREATE TABLE IF NOT EXISTS rh_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  award_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  responsible TEXT,
  status TEXT DEFAULT 'Pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Bonificações
CREATE TABLE IF NOT EXISTS rh_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  bonus_type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_month TEXT,
  mission_id TEXT,
  status TEXT DEFAULT 'Pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Jornada de trabalho
CREATE TABLE IF NOT EXISTS rh_work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES rh_employees(id),
  department_id UUID REFERENCES rh_departments(id),
  name TEXT NOT NULL,
  weekly_hours NUMERIC(5,2) DEFAULT 44,
  schedule_json JSONB DEFAULT '[]',
  tolerance_minutes INT DEFAULT 10,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Férias
CREATE TABLE IF NOT EXISTS rh_vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  acquisition_start DATE,
  acquisition_end DATE,
  concession_start DATE,
  concession_end DATE,
  start_date DATE,
  end_date DATE,
  return_date DATE,
  days_sold INT DEFAULT 0,
  abono_days INT DEFAULT 0,
  status TEXT DEFAULT 'Programada',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Afastamentos
CREATE TABLE IF NOT EXISTS rh_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  leave_type TEXT NOT NULL,
  reason TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  document_url TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Advertências
CREATE TABLE IF NOT EXISTS rh_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  warning_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warning_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  responsible TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Exames
CREATE TABLE IF NOT EXISTS rh_medical_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  exam_type TEXT NOT NULL,
  exam_date DATE NOT NULL,
  expiry_date DATE,
  clinic_name TEXT,
  result TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Admissões (workflow)
CREATE TABLE IF NOT EXISTS rh_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES rh_employees(id),
  candidate_name TEXT NOT NULL,
  position_id UUID REFERENCES rh_positions(id),
  department_id UUID REFERENCES rh_departments(id),
  expected_admission DATE,
  status TEXT DEFAULT 'Em andamento',
  checklist_json JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Folha de pagamento (cabeçalho mensal)
CREATE TABLE IF NOT EXISTS rh_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month TEXT NOT NULL,
  status TEXT DEFAULT 'Aberta',
  total_gross NUMERIC(14,2) DEFAULT 0,
  total_net NUMERIC(14,2) DEFAULT 0,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens da folha
CREATE TABLE IF NOT EXISTS rh_payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES rh_payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  base_salary NUMERIC(12,2) DEFAULT 0,
  commission NUMERIC(12,2) DEFAULT 0,
  awards NUMERIC(12,2) DEFAULT 0,
  bonuses NUMERIC(12,2) DEFAULT 0,
  overtime NUMERIC(12,2) DEFAULT 0,
  additions NUMERIC(12,2) DEFAULT 0,
  benefits NUMERIC(12,2) DEFAULT 0,
  discounts NUMERIC(12,2) DEFAULT 0,
  absences NUMERIC(12,2) DEFAULT 0,
  delays NUMERIC(12,2) DEFAULT 0,
  dsr NUMERIC(12,2) DEFAULT 0,
  inss NUMERIC(12,2) DEFAULT 0,
  irrf NUMERIC(12,2) DEFAULT 0,
  fgts NUMERIC(12,2) DEFAULT 0,
  net_salary NUMERIC(12,2) DEFAULT 0,
  total_pay NUMERIC(12,2) DEFAULT 0,
  details_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Holerites
CREATE TABLE IF NOT EXISTS rh_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  payroll_item_id UUID REFERENCES rh_payroll_items(id),
  reference_month TEXT NOT NULL,
  file_url TEXT,
  issued_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LGPD
CREATE TABLE IF NOT EXISTS rh_lgpd_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES rh_employees(id),
  consent_type TEXT NOT NULL,
  accepted BOOLEAN DEFAULT false,
  accepted_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auditoria RH
CREATE TABLE IF NOT EXISTS rh_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  user_name TEXT,
  user_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurações RH
CREATE TABLE IF NOT EXISTS rh_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Faixas INSS/IRRF padrão 2026 (seed via api/rh-init ou script)
INSERT INTO rh_tax_brackets (tax_type, bracket_from, bracket_to, rate_pct, deduction, year)
SELECT v.tax_type, v.bracket_from, v.bracket_to, v.rate_pct, v.deduction, v.year
FROM (VALUES
  ('INSS'::text, 0::numeric, 1518.00::numeric, 7.5::numeric, 0::numeric, 2026::int),
  ('INSS', 1518.01, 2793.60, 9.0, 0, 2026),
  ('INSS', 2793.61, 4190.40, 12.0, 0, 2026),
  ('INSS', 4190.41, 8157.41, 14.0, 0, 2026),
  ('IRRF', 0, 2259.20, 0, 0, 2026),
  ('IRRF', 2259.21, 2826.65, 7.5, 169.44, 2026),
  ('IRRF', 2826.66, 3751.05, 15.0, 381.44, 2026),
  ('IRRF', 3751.06, 4664.68, 22.5, 662.77, 2026),
  ('IRRF', 4664.69, 99999999, 27.5, 896.00, 2026)
) AS v(tax_type, bracket_from, bracket_to, rate_pct, deduction, year)
WHERE NOT EXISTS (SELECT 1 FROM rh_tax_brackets LIMIT 1);
