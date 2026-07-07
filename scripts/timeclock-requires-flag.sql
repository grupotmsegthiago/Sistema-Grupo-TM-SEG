-- Flag de ponto obrigatório por colaborador (cadastro de usuário / RH)

ALTER TABLE system_users
  ADD COLUMN IF NOT EXISTS requires_time_clock BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rh_employees
  ADD COLUMN IF NOT EXISTS requires_time_clock BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_users.requires_time_clock IS 'Se true, o usuário deve bater ponto ao abrir o sistema';
COMMENT ON COLUMN rh_employees.requires_time_clock IS 'Se true, funcionário RH deve bater ponto (sincroniza com user_id)';
