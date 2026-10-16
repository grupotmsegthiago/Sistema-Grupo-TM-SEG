-- PostgreSQL isolado. Não aponta para produção.
-- Prova a janela entre o código novo e o corte, e a volta pelo rollback.
CREATE SCHEMA IF NOT EXISTS public;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.missions (
  id text PRIMARY KEY,
  status text,
  client text,
  revenue_value numeric NOT NULL,
  cost_value numeric NOT NULL
);
GRANT ALL ON public.missions TO anon, authenticated, service_role;
INSERT INTO public.missions (id, status, client, revenue_value, cost_value)
VALUES ('HOMOLOG-JANELA', 'Pendente', 'Cliente Ficticio', 100, 40);

-- Janela: o código novo já pede só o status, mas o banco antigo ainda entrega a receita.
SET ROLE anon;
DO $$
BEGIN
  IF (SELECT status FROM public.missions WHERE id = 'HOMOLOG-JANELA') IS DISTINCT FROM 'Pendente' THEN
    RAISE EXCEPTION 'o código novo não leu a OS antes do corte';
  END IF;
  IF (SELECT revenue_value FROM public.missions WHERE id = 'HOMOLOG-JANELA') <> 100 THEN
    RAISE EXCEPTION 'a janela não reproduziu a exposição atual';
  END IF;
END $$;
RESET ROLE;

\ir ../migrations/propostas/2026_10_16_sessoes_financeiras.sql
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'provider','origin','destination','vehicle_type','client_vehicle','last_update','updated_by','created_at',
    'agent1','agent2','total_distance','traveled_distance','progress','current_location','map_link',
    'start_km','start_time','end_km','end_time','estimated_time','driver_name','driver_phone','mission_type',
    'vehicle_id','client_vehicle_id','gr_espelhamento','special_operation_type','is_same_os','billing_approved',
    'client_vehicle_2','driver_name_2','driver_phone_2','provider_start_km','provider_end_km',
    'provider_start_time','provider_end_time','provider_ops_edited','vendor_os_number','invoice_number',
    'payment_date','verified_by','verified_at','release_date','mirroring_evidence_url','parent_mission_id',
    'email_pending_client','email_pending_provider','email_message_id','valor_zero_motivo','reference_number',
    'billing_release','billing_period_override','exclude_from_billing','dhl_se_number','dhl_sm_number',
    'dhl_deslocamento_km','dhl_deslocamento_approval_url','negative_margin_locked','negative_margin_locked_by',
    'negative_margin_locked_at','velada_closure_operator','velada_closure_opened_at','velada_closure_notified_at',
    'velada_closure_escalated_at','velada_toll_confirmed','occurrence_count','end_trip_evidence_url',
    'end_km_evidence_url','end_photo_time_confirmed','end_evidence_pending','end_evidence_operator'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS %I text', col);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS public.client_price_tables (id int PRIMARY KEY, client text, price numeric);
CREATE TABLE IF NOT EXISTS public.provider_cost_tables (id int PRIMARY KEY, provider text, cost numeric);
GRANT ALL ON public.client_price_tables, public.provider_cost_tables TO anon, authenticated, service_role;
\ir ../migrations/propostas/2026_10_16_acesso_financeiro_colunas.sql

-- Depois do corte, a OS operacional continua e a receita some da chave anônima.
SET ROLE anon;
DO $$
BEGIN
  IF (SELECT status FROM public.missions WHERE id = 'HOMOLOG-JANELA') IS DISTINCT FROM 'Pendente' THEN
    RAISE EXCEPTION 'o corte derrubou a OS operacional';
  END IF;
  BEGIN
    PERFORM revenue_value FROM public.missions;
    RAISE EXCEPTION 'depois do corte a chave anônima ainda leu a receita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.missions;
    RAISE EXCEPTION 'depois do corte a leitura inteira ainda passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- No Supabase, service_role ignora RLS. O papel local precisa do mesmo comportamento.
ALTER ROLE service_role BYPASSRLS;
SET ROLE service_role;
INSERT INTO public.user_sessions (id, user_id, expires_at)
VALUES ('00000000-0000-4000-8000-000000000024', '24', now() + interval '7 days');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE id = '00000000-0000-4000-8000-000000000024'
      AND user_id = '24'
      AND revoked_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'a sessão fictícia não ficou válida para o serviço';
  END IF;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.user_sessions;
    RAISE EXCEPTION 'a chave anônima leu a sessão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Rollback devolve a leitura e não apaga a OS.
\ir ../migrations/rollback/2026_10_16_acesso_financeiro_colunas.sql
SET ROLE anon;
DO $$
BEGIN
  IF (SELECT revenue_value FROM public.missions WHERE id = 'HOMOLOG-JANELA') <> 100 THEN
    RAISE EXCEPTION 'o rollback alterou a receita';
  END IF;
  IF (SELECT count(*) FROM public.missions) <> 1 THEN
    RAISE EXCEPTION 'o rollback apagou a OS';
  END IF;
END $$;
RESET ROLE;
