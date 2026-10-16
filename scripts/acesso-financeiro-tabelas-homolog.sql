-- PostgreSQL isolado. Não aponta para produção.
-- Prova sessão, corte das tabelas financeiras e rollback sem apagar a linha.
CREATE SCHEMA IF NOT EXISTS public;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;

CREATE TABLE IF NOT EXISTS public.financial_invoices (id text PRIMARY KEY, valor numeric);
CREATE TABLE IF NOT EXISTS public.comissoes (id text PRIMARY KEY, valor_comissao numeric);
CREATE TABLE IF NOT EXISTS public.system_logs (id text PRIMARY KEY, entity text, details text);
GRANT ALL ON public.financial_invoices, public.comissoes, public.system_logs TO anon, authenticated, service_role;
INSERT INTO public.financial_invoices (id, valor) VALUES ('FAT-1', 250);
INSERT INTO public.comissoes (id, valor_comissao) VALUES ('COM-1', 15);
INSERT INTO public.system_logs (id, entity, details) VALUES ('LOG-1', 'Mission', 'operacional');

\ir ../migrations/propostas/2026_10_16_sessoes_financeiras.sql
\ir ../migrations/propostas/2026_10_16_acesso_financeiro_tabelas.sql

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM valor FROM public.financial_invoices;
    RAISE EXCEPTION 'anon leu a fatura';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.comissoes;
    RAISE EXCEPTION 'anon leu a comissão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM details FROM public.system_logs;
    RAISE EXCEPTION 'anon leu o log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET ROLE service_role;
INSERT INTO public.user_sessions (id, user_id, expires_at)
VALUES ('00000000-0000-4000-8000-000000000029', '29', now() + interval '7 days');
DO $$
DECLARE linha public.user_sessions%ROWTYPE;
BEGIN
  SELECT * INTO linha FROM public.user_sessions WHERE id = '00000000-0000-4000-8000-000000000029';
  IF linha.user_id IS DISTINCT FROM '29' OR linha.revoked_at IS NOT NULL OR linha.expires_at < now() THEN
    RAISE EXCEPTION 'a sessão criada não ficou válida';
  END IF;
  IF (SELECT valor FROM public.financial_invoices WHERE id = 'FAT-1') <> 250 THEN
    RAISE EXCEPTION 'o serviço não leu a fatura';
  END IF;
END $$;
UPDATE public.user_sessions SET expires_at = now() - interval '1 minute'
WHERE id = '00000000-0000-4000-8000-000000000029';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE id = '00000000-0000-4000-8000-000000000029' AND expires_at > now() AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a sessão vencida ainda valeria';
  END IF;
END $$;
UPDATE public.user_sessions
SET expires_at = now() + interval '7 days', revoked_at = now()
WHERE id = '00000000-0000-4000-8000-000000000029';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE id = '00000000-0000-4000-8000-000000000029' AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a sessão revogada ainda valeria';
  END IF;
  IF (SELECT count(*) FROM public.financial_invoices) <> 1 THEN
    RAISE EXCEPTION 'o teste apagou a fatura';
  END IF;
END $$;
RESET ROLE;

\ir ../migrations/rollback/2026_10_16_acesso_financeiro_tabelas.sql
SET ROLE anon;
DO $$
BEGIN
  IF (SELECT valor FROM public.financial_invoices WHERE id = 'FAT-1') <> 250 THEN
    RAISE EXCEPTION 'o rollback alterou a fatura';
  END IF;
END $$;
RESET ROLE;
