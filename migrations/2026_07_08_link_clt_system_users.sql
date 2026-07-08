-- Vincula funcionários CLT ao login (system_users) por e-mail ou nome
-- Execute no Supabase SQL Editor após rh_employees e system_users populados

-- 1) Vínculo por e-mail (case-insensitive)
UPDATE rh_employees e
SET
  user_id = u.id::TEXT,
  email = COALESCE(NULLIF(TRIM(e.email), ''), u.email),
  updated_at = now()
FROM system_users u
WHERE e.deleted_at IS NULL
  AND e.user_id IS NULL
  AND UPPER(TRIM(COALESCE(e.contract_type, ''))) = 'CLT'
  AND e.status IN ('Ativo', 'Experiência')
  AND u.status = 'Ativo'
  AND LOWER(TRIM(COALESCE(e.email, ''))) = LOWER(TRIM(u.email))
  AND TRIM(COALESCE(u.email, '')) <> '';

-- 2) Vínculo por nome (quando e-mail do RH ainda não foi preenchido)
UPDATE rh_employees e
SET
  user_id = u.id::TEXT,
  email = COALESCE(NULLIF(TRIM(e.email), ''), u.email),
  updated_at = now()
FROM system_users u
WHERE e.deleted_at IS NULL
  AND e.user_id IS NULL
  AND UPPER(TRIM(COALESCE(e.contract_type, ''))) = 'CLT'
  AND e.status IN ('Ativo', 'Experiência')
  AND u.status = 'Ativo'
  AND (
    LOWER(TRIM(e.full_name)) = LOWER(TRIM(u.name))
    OR LOWER(e.full_name) LIKE '%' || LOWER(TRIM(u.name)) || '%'
    OR LOWER(TRIM(u.name)) LIKE '%' || LOWER(SPLIT_PART(e.full_name, ' ', 1)) || '%'
  );

-- Conferência
SELECT e.matricula, e.full_name, e.contract_type, e.status, e.email, e.user_id, u.name AS login_name, u.email AS login_email
FROM rh_employees e
LEFT JOIN system_users u ON u.id = e.user_id
WHERE UPPER(COALESCE(e.contract_type, '')) = 'CLT'
  AND e.deleted_at IS NULL
ORDER BY e.full_name;
