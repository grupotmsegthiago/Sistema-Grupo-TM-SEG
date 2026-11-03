-- NÃO EXECUTAR no projeto ajhmmjuewdsukecaimik.
-- Depósito compartilhado da sessão HTTP da ponte.
-- Guarda só hashes. Não guarda senha, token nem CSRF em claro.
-- Não altera system_users e não mexe em senha nesta fase.
--
-- A migração futura da senha, quando for autorizada, é outra etapa:
-- acrescentar password_hash nulo, preencher só depois de um login bem-sucedido
-- e só então deixar de aceitar o texto antigo. Não há ALTER aqui.

BEGIN;

DO $$
BEGIN
  IF current_setting('tmseg.p0_teste_isolado', true) IS DISTINCT FROM 'ligado' THEN
    RAISE EXCEPTION
      'NÃO EXECUTAR. A tabela de sessão da ponte só pode nascer em Postgres isolado, com a marca de teste.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS tmseg_private;
REVOKE ALL ON SCHEMA tmseg_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS tmseg_private.ponte_sessoes (
  id text PRIMARY KEY,
  usuario_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  criada_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  revogada_em timestamptz,
  ultima_atividade timestamptz NOT NULL
);

REVOKE ALL ON tmseg_private.ponte_sessoes FROM PUBLIC;
REVOKE ALL ON tmseg_private.ponte_sessoes FROM anon;
REVOKE ALL ON tmseg_private.ponte_sessoes FROM authenticated;

COMMENT ON TABLE tmseg_private.ponte_sessoes IS
  'Sessão opaca da ponte HTTP. Sem token em claro. Ainda não usada pela aplicação.';

COMMIT;
