-- Turno noturno: Moacir, Cris (Cristiane Aurora) e demais operadores de plantão 20h→08h.
-- Corrige bloqueio de ponto/login à noite quando shift_type estava 'diurno' (default da migration anterior).

UPDATE public.rh_employees
SET
  shift_type = 'noturno',
  requires_timeclock = true,
  updated_at = now()
WHERE deleted_at IS NULL
  AND COALESCE(status, 'Ativo') IN ('Ativo', 'Experiência')
  AND full_name NOT ILIKE '%michelle%'
  AND (
    full_name ILIKE '%moacir%'
    OR full_name ILIKE '%cristiane aurora%'
    OR full_name ILIKE '%aurora da silva%'
    OR full_name ~* '^cris[\s\.]'
    OR full_name ~* '\scris[\s\.]'
  );

-- Conferência (rodar após UPDATE)
-- SELECT matricula, full_name, shift_type, requires_timeclock, email, user_id
-- FROM rh_employees
-- WHERE deleted_at IS NULL
--   AND (full_name ILIKE '%moacir%' OR full_name ILIKE '%cristiane aurora%')
-- ORDER BY full_name;
