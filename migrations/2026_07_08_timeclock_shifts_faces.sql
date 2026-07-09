-- Turno, obrigatoriedade de ponto e cadastro facial unificado (login + batida).

ALTER TABLE public.rh_employees
  ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'diurno',
  ADD COLUMN IF NOT EXISTS requires_timeclock BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS face_registered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.rh_employees.shift_type IS 'diurno (entrada após 07:30) ou noturno (entrada após 19:30)';
COMMENT ON COLUMN public.rh_employees.requires_timeclock IS 'Funcionário deve bater ponto (CLT e PJ operacional)';
COMMENT ON COLUMN public.rh_employees.face_photo_url IS 'Foto facial cadastrada — usada no login e nas batidas';

-- CLT ativos passam a exigir ponto
UPDATE public.rh_employees
SET requires_timeclock = true
WHERE UPPER(COALESCE(contract_type, '')) = 'CLT'
  AND COALESCE(status, 'Ativo') IN ('Ativo', 'Experiência')
  AND deleted_at IS NULL;

-- Daniel PJ (RH002) — coordenador/auditor: isento de batida obrigatória no login
UPDATE public.rh_employees
SET requires_timeclock = false,
    shift_type = COALESCE(NULLIF(shift_type, ''), 'diurno')
WHERE deleted_at IS NULL
  AND (
    matricula = 'RH002'
    OR full_name ILIKE '%DANIEL%PINTO%'
  );

-- Default diurno onde vazio
UPDATE public.rh_employees
SET shift_type = 'diurno'
WHERE shift_type IS NULL OR TRIM(shift_type) = '';
