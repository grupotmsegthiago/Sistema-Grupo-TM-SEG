-- Troca obrigatória da senha do portal a cada 30 dias.
-- Quem já entra (inclusive a Lara na CEVA) começa a contar a partir desta migration,
-- sem apagar o hash que já funciona.

ALTER TABLE public.ceva_portal_usuarios
  ADD COLUMN IF NOT EXISTS senha_alterada_em timestamptz;

ALTER TABLE public.ibl_portal_usuarios
  ADD COLUMN IF NOT EXISTS senha_alterada_em timestamptz;

UPDATE public.ceva_portal_usuarios
SET senha_alterada_em = now()
WHERE senha_alterada_em IS NULL
  AND senha_hash IS NOT NULL
  AND trocar_senha = false;

UPDATE public.ibl_portal_usuarios
SET senha_alterada_em = now()
WHERE senha_alterada_em IS NULL
  AND senha_hash IS NOT NULL
  AND trocar_senha = false;
