-- PostgreSQL isolado. Não aponta para produção.
CREATE SCHEMA IF NOT EXISTS public;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon_homolog') THEN CREATE ROLE anon_homolog NOLOGIN; END IF;
END $$;
GRANT anon TO anon_homolog;
GRANT anon_homolog TO CURRENT_USER;

CREATE TABLE IF NOT EXISTS public.missions (
  id text PRIMARY KEY,
  status text,
  client text,
  revenue_value numeric NOT NULL,
  cost_value numeric NOT NULL,
  toll_value numeric,
  toll_value_provider numeric,
  displacement_value numeric,
  displacement_value_provider numeric,
  snapshot_data jsonb,
  parametros_edicao_total jsonb,
  revenue_edit_reason text,
  cost_edit_reason text,
  billing_verified_by text,
  snapshot_approved_by text,
  snapshot_approved_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.client_price_tables (id int PRIMARY KEY, client text, price numeric);
CREATE TABLE IF NOT EXISTS public.provider_cost_tables (id int PRIMARY KEY, provider text, cost numeric);
GRANT ALL ON public.missions, public.client_price_tables, public.provider_cost_tables TO anon, authenticated;
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

\ir ../migrations/propostas/2026_10_16_sessoes_financeiras.sql
\ir ../migrations/propostas/2026_10_16_acesso_financeiro_colunas.sql

INSERT INTO public.missions (id, status, client, revenue_value, cost_value)
VALUES ('HOMOLOG-ACESSO', 'Pendente', 'Cliente Ficticio', 100, 40);

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM revenue_value FROM public.missions;
    RAISE EXCEPTION 'anon leu a receita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT status FROM public.missions WHERE id = 'HOMOLOG-ACESSO') IS DISTINCT FROM 'Pendente' THEN
    RAISE EXCEPTION 'anon perdeu a OS operacional';
  END IF;
  BEGIN
    PERFORM * FROM public.missions;
    RAISE EXCEPTION 'anon leu a linha inteira';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.missions SET status = 'Em Viagem' WHERE id = 'HOMOLOG-ACESSO';
  BEGIN
    UPDATE public.missions SET revenue_value = 1 WHERE id = 'HOMOLOG-ACESSO';
    RAISE EXCEPTION 'anon alterou a receita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.missions (id, status, revenue_value, cost_value) VALUES ('X', 'Pendente', 1, 1);
    RAISE EXCEPTION 'anon criou OS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.client_price_tables;
    RAISE EXCEPTION 'anon leu a tabela de preço';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.provider_cost_tables;
    RAISE EXCEPTION 'anon leu a tabela de custo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT status FROM public.missions WHERE id = 'HOMOLOG-ACESSO') IS DISTINCT FROM 'Em Viagem' THEN
    RAISE EXCEPTION 'o status operacional não gravou';
  END IF;
  IF (SELECT revenue_value FROM public.missions WHERE id = 'HOMOLOG-ACESSO') <> 100 THEN
    RAISE EXCEPTION 'a receita mudou';
  END IF;
END $$;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM revenue_value FROM public.missions;
    RAISE EXCEPTION 'autenticado leu a receita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.missions;
    RAISE EXCEPTION 'autenticado leu a linha inteira';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT status FROM public.missions WHERE id = 'HOMOLOG-ACESSO') IS DISTINCT FROM 'Em Viagem' THEN
    RAISE EXCEPTION 'autenticado perdeu a OS operacional';
  END IF;
  BEGIN
    UPDATE public.missions SET revenue_value = 9 WHERE id = 'HOMOLOG-ACESSO';
    RAISE EXCEPTION 'autenticado alterou a receita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.client_price_tables;
    RAISE EXCEPTION 'autenticado leu a tabela de preço';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.provider_cost_tables;
    RAISE EXCEPTION 'autenticado leu a tabela de custo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.user_sessions;
    RAISE EXCEPTION 'autenticado leu a sessão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.user_sessions;
    RAISE EXCEPTION 'anon leu a sessão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET ROLE service_role;
DO $$
BEGIN
  IF (SELECT revenue_value FROM public.missions WHERE id = 'HOMOLOG-ACESSO') <> 100 THEN
    RAISE EXCEPTION 'o serviço não leu a receita';
  END IF;
END $$;
BEGIN;
UPDATE public.missions SET revenue_value = 777 WHERE id = 'HOMOLOG-ACESSO';
ROLLBACK;
DO $$
BEGIN
  IF (SELECT revenue_value FROM public.missions WHERE id = 'HOMOLOG-ACESSO') <> 100 THEN
    RAISE EXCEPTION 'a falha de transação alterou a receita';
  END IF;
  IF (SELECT status FROM public.missions WHERE id = 'HOMOLOG-ACESSO') IS DISTINCT FROM 'Em Viagem' THEN
    RAISE EXCEPTION 'a OS operacional sumiu depois da transação';
  END IF;
END $$;
RESET ROLE;
