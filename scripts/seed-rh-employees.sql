-- Importação planilha TM SEGURANÇA — 12 funcionários
-- Executar no Supabase → SQL Editor (uma vez)
-- Idempotente por matrícula (RH001–RH012)

BEGIN;

-- Departamento
INSERT INTO rh_departments (name, code, active)
SELECT 'TM SEGURANÇA', 'TMSEG', true
WHERE NOT EXISTS (
  SELECT 1 FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL
);

-- Cargos
INSERT INTO rh_positions (name, department_id, active)
SELECT v.name, d.id, true
FROM (VALUES
  ('SUPERVISOR FINANCEIRO'),
  ('COORDENADOR OPERACIONAL'),
  ('AUXILIAR OPERACIONAL'),
  ('COORDENADOR ADMINISTRATIVO'),
  ('SUPORTE OPERACIONAL'),
  ('AUX. DE LIMPEZA'),
  ('COMERCIAL RJ')
) AS v(name)
CROSS JOIN (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1) d
WHERE NOT EXISTS (
  SELECT 1 FROM rh_positions p WHERE p.name = v.name AND p.deleted_at IS NULL
);

-- Funcionários
INSERT INTO rh_employees (
  matricula, full_name, admission_date, probation_end_date, contract_type,
  position_id, department_id, status, notes, cost_center, created_by, updated_by
) VALUES
('RH001', 'BÁRBARA SGARLATA', '2025-01-08', '2025-04-08', 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'SUPERVISOR FINANCEIRO' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2025-02-22 | Experiência 90d: 2025-04-08', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH002', 'DANIEL LUIZ LIMA PINTO', '2025-07-01', '2025-09-29', 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'COORDENADOR OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2025-08-15 | Experiência 90d: 2025-09-29', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH003', 'BEATRIZ DE CARVALHO SIMÕES', '2026-01-16', '2026-04-16', 'CLT',
  (SELECT id FROM rh_positions WHERE name = 'AUXILIAR OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2026-03-02 | Experiência 90d: 2026-04-16', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH004', 'MICHELLE CRISTIANE MONTEIRO', '2026-01-30', '2026-04-30', 'CLT',
  (SELECT id FROM rh_positions WHERE name = 'AUXILIAR OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2026-03-16 | Experiência 90d: 2026-04-30', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH005', 'CRISTIANE AURORA DA SILVA', '2026-06-29', '2026-09-27', 'CLT',
  (SELECT id FROM rh_positions WHERE name = 'AUXILIAR OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2026-08-13 | Experiência 90d: 2026-09-27', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH006', 'FABRÍCIO HONORATO', '2026-07-06', '2026-10-04', 'CLT',
  (SELECT id FROM rh_positions WHERE name = 'AUXILIAR OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2026-08-20 | Experiência 90d: 2026-10-04', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH007', 'BEATRIZ ROCHA MACHADO', '2026-05-10', '2026-08-08', 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'COORDENADOR ADMINISTRATIVO' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | CNPJ: 67.802.600/0001-44 | Experiência 45d: 2026-06-24 | Experiência 90d: 2026-08-08', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH008', 'EULANIA APARECIDA MOREIRA SANTOS', NULL, NULL, 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'SUPORTE OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH009', 'PLINIO ALVES PRADOS DOS SANTOS', NULL, NULL, 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'SUPORTE OPERACIONAL' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH010', 'MIRIAM ALVES DOS SANTOS', '2025-07-22', '2025-10-20', 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'AUX. DE LIMPEZA' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Modalidade contratual: FREE LANCER | Experiência 45d: 2025-09-05 | Experiência 90d: 2025-10-20', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH011', 'THIAGO ARRUDA', '2026-05-29', '2026-08-27', 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'COMERCIAL RJ' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Ativo', 'Empresa: TM SEGURANÇA | Experiência 45d: 2026-07-13 | Experiência 90d: 2026-08-27', 'TM SEGURANÇA', 'sql-seed', 'sql-seed'),
('RH012', 'GIOVANNA MARSILI ANDRÉ', '2026-07-20', '2026-10-18', 'PJ',
  (SELECT id FROM rh_positions WHERE name = 'SUPERVISOR FINANCEIRO' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM rh_departments WHERE name = 'TM SEGURANÇA' AND deleted_at IS NULL LIMIT 1),
  'Experiência', 'Empresa: TM SEGURANÇA | Experiência 45d: 2026-09-03 | Experiência 90d: 2026-10-18', 'TM SEGURANÇA', 'sql-seed', 'sql-seed')
ON CONFLICT (matricula) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  admission_date = EXCLUDED.admission_date,
  probation_end_date = EXCLUDED.probation_end_date,
  contract_type = EXCLUDED.contract_type,
  position_id = EXCLUDED.position_id,
  department_id = EXCLUDED.department_id,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  updated_by = 'sql-seed',
  updated_at = now();

-- Salários
INSERT INTO rh_salary_configs (employee_id, base_salary, effective_from, created_by, updated_by)
SELECT e.id, v.salary, COALESCE(e.admission_date, CURRENT_DATE), 'sql-seed', 'sql-seed'
FROM (VALUES
  ('RH001', 2000::numeric),
  ('RH002', 2500),
  ('RH003', 4000),
  ('RH004', 4000),
  ('RH005', 2000),
  ('RH006', 2000),
  ('RH007', 4000),
  ('RH008', 1100),
  ('RH009', 3000),
  ('RH010', 2000),
  ('RH011', 4000),
  ('RH012', 5000)
) AS v(matricula, salary)
JOIN rh_employees e ON e.matricula = v.matricula
WHERE NOT EXISTS (
  SELECT 1 FROM rh_salary_configs s WHERE s.employee_id = e.id AND s.deleted_at IS NULL
);

-- Premiações
INSERT INTO rh_awards (employee_id, name, amount, description, award_date, reason, responsible, status)
SELECT e.id, 'Premiação', v.amount, v.description, COALESCE(e.admission_date, CURRENT_DATE), 'Importação planilha TM SEG', 'Sistema', 'Pendente'
FROM (VALUES
  ('RH001', 3000::numeric, 'Premiação mensal (planilha)'),
  ('RH002', 2500::numeric, 'Premiação mensal (planilha)'),
  ('RH005', 1500::numeric, 'Premiação mensal (planilha)'),
  ('RH006', 1000::numeric, 'Premiação mensal (planilha)'),
  ('RH011', 0::numeric, 'Premiação variável (planilha)')
) AS v(matricula, amount, description)
JOIN rh_employees e ON e.matricula = v.matricula
WHERE NOT EXISTS (
  SELECT 1 FROM rh_awards a WHERE a.employee_id = e.id AND a.name = 'Premiação' AND a.deleted_at IS NULL
);

COMMIT;

-- Conferência
SELECT e.matricula, e.full_name, e.admission_date, p.name AS cargo, e.contract_type, s.base_salary, a.amount AS premio
FROM rh_employees e
LEFT JOIN rh_positions p ON p.id = e.position_id
LEFT JOIN rh_salary_configs s ON s.employee_id = e.id AND s.deleted_at IS NULL
LEFT JOIN rh_awards a ON a.employee_id = e.id AND a.name = 'Premiação' AND a.deleted_at IS NULL
WHERE e.matricula LIKE 'RH%'
ORDER BY e.matricula;
