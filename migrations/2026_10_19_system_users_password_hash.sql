-- Aditiva. Não copia senha, não apaga texto e não mexe em OS, fatura ou Asaas.
-- password_hash recebe o scrypt versionado no próximo login válido.
-- session_epoch sobe na troca de senha e encerra o token anterior.

ALTER TABLE public.system_users
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.system_users
  ADD COLUMN IF NOT EXISTS session_epoch integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.system_users.password_hash IS
  'Hash scrypt versionado. Nulo até o login ou a troca gravar o hash e limpar password.';

COMMENT ON COLUMN public.system_users.session_epoch IS
  'Geração da sessão. A troca de senha incrementa e invalida o token anterior.';
