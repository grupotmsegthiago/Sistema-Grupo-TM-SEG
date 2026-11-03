-- NÃO EXECUTAR no projeto ajhmmjuewdsukecaimik.
-- Coluna futura para o hash versionado da senha de funcionário.
-- Não copia senha, não apaga texto e não atualiza nenhuma linha.
-- O portal do cliente permanece no hash scrypt$ que já existe.

BEGIN;

DO $$
BEGIN
  IF current_setting('tmseg.p0_teste_isolado', true) IS DISTINCT FROM 'ligado' THEN
    RAISE EXCEPTION
      'NÃO EXECUTAR. A coluna de hash só pode ser proposta em Postgres isolado, com a marca de teste.';
  END IF;
END
$$;

ALTER TABLE public.system_users
  ADD COLUMN IF NOT EXISTS password_hash text;

COMMENT ON COLUMN public.system_users.password_hash IS
  'Hash scrypt versionado. Nulo até a migração autorizada. A coluna password permanece.';

COMMIT;
