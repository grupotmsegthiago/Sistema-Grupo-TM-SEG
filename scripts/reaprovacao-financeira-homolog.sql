-- Homologação isolada. Rode só em PostgreSQL local, nunca no Grupo TMSEG.
-- O esquema mínimo imita as colunas reais. missions não tem created_by.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean
);

CREATE TABLE IF NOT EXISTS missions (
  id text PRIMARY KEY,
  status text,
  invoice_number text,
  billing_approved boolean,
  billing_verified_by text,
  snapshot_approved_by text,
  snapshot_approved_at timestamptz,
  snapshot_data jsonb,
  negative_margin_locked boolean,
  revenue_value numeric,
  cost_value numeric,
  revenue_edit_reason text,
  cost_edit_reason text,
  last_update timestamptz,
  toll_value numeric,
  toll_value_provider numeric,
  comissao numeric
);

CREATE TABLE IF NOT EXISTS mission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  description text
);

CREATE TABLE IF NOT EXISTS financial_invoices (
  id uuid PRIMARY KEY,
  status text
);

CREATE TABLE IF NOT EXISTS financial_invoice_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES financial_invoices (id),
  mission_id text NOT NULL
);

\ir ../migrations/propostas/2026_10_16_reaprovacao_financeira.sql

INSERT INTO missions (
  id, status, billing_approved, billing_verified_by, snapshot_approved_by, snapshot_approved_at,
  snapshot_data, negative_margin_locked, revenue_value, cost_value, revenue_edit_reason,
  toll_value, toll_value_provider, comissao
) VALUES
  ('HOMOLOG-OK', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40,"franchiseHours":4}'::jsonb, false, 100, 80, 'motivo antigo', 12, 11, 7),
  ('HOMOLOG-FATURA', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 'motivo antigo', 12, 11, 7),
  ('HOMOLOG-PAGA', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 'motivo antigo', 12, 11, 7),
  ('HOMOLOG-ENCERRADA', 'Encerrada', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 'motivo antigo', 12, 11, 7),
  ('HOMOLOG-PREJUIZO', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, true, 100, 80, 'motivo antigo', 12, 11, 7),
  ('HOMOLOG-SEM-APROVACAO', 'Concluída', false, null, 'Sistema (Recalcular e Comparar)', null,
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 'motivo antigo', 12, 11, 7);

UPDATE missions SET invoice_number = 'NF-FICTICIA' WHERE id = 'HOMOLOG-FATURA';

INSERT INTO financial_invoices (id, status)
VALUES ('10000000-0000-4000-8000-000000000001', 'PAGA');
INSERT INTO financial_invoice_missions (invoice_id, mission_id)
VALUES ('10000000-0000-4000-8000-000000000001', 'HOMOLOG-PAGA');

INSERT INTO mission_logs (mission_id, updated_by, created_at, description)
VALUES ('HOMOLOG-OK', 'Operador Ficticio', '2026-09-01 10:00:00+00', 'abertura ficticia');

DO $$
DECLARE
  v jsonb;
  r missions%ROWTYPE;
  n int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'missions' AND column_name = 'created_by'
  ) THEN
    RAISE EXCEPTION 'o esquema de homologação não pode ter missions.created_by';
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111111', 'HOMOLOG-OK', 150, 80, 100, 80,
    'curta', 'Giovanna Marsili', 'HOMOLOG-OK/antes.jpg', 'HOMOLOG-OK/depois.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'banco' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-OK') <> 100 THEN
    RAISE EXCEPTION 'justificativa curta alterou a OS: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111112', 'HOMOLOG-OK', 150, 80, 100, 80,
    'Correcao ficticia do valor', 'Giovanna Marsili', '', 'HOMOLOG-OK/depois.jpg', now()
  );
  IF (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-OK') <> 100 THEN
    RAISE EXCEPTION 'captura ausente alterou a OS: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111113', 'HOMOLOG-FATURA', 150, 80, 100, 80,
    'Correcao ficticia do valor', 'ANA.FERNANDES', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-FATURA') <> 100 THEN
    RAISE EXCEPTION 'OS faturada não bloqueou: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111114', 'HOMOLOG-PAGA', 150, 80, 100, 80,
    'Correcao ficticia do valor', 'ANA.FERNANDES', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-PAGA') <> 100 THEN
    RAISE EXCEPTION 'OS paga não bloqueou: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111115', 'HOMOLOG-ENCERRADA', 150, 80, 100, 80,
    'Correcao ficticia do valor', 'Giovanna Marsili', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' THEN
    RAISE EXCEPTION 'OS encerrada não bloqueou: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111116', 'HOMOLOG-PREJUIZO', 150, 80, 100, 80,
    'Correcao ficticia do valor', 'Giovanna Marsili', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT negative_margin_locked FROM missions WHERE id = 'HOMOLOG-PREJUIZO') IS NOT TRUE THEN
    RAISE EXCEPTION 'prejuízo analisado não bloqueou: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111117', 'HOMOLOG-SEM-APROVACAO', 150, 80, 100, 80,
    'Correcao ficticia do valor', 'Giovanna Marsili', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' THEN
    RAISE EXCEPTION 'OS sem aprovação não bloqueou: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111111', 'HOMOLOG-OK', 150, 80, 100, 80,
    'Correcao ficticia do valor conferido', 'ANA.FERNANDES',
    'HOMOLOG-OK/11111111-1111-4111-8111-111111111111/antes.jpg',
    'HOMOLOG-OK/11111111-1111-4111-8111-111111111111/depois.jpg',
    '2026-10-16 15:00:00+00'
  );
  IF v->>'ok' IS DISTINCT FROM 'true' OR coalesce(v->>'repetida', 'false') = 'true' THEN
    RAISE EXCEPTION 'reaprovação fictícia não concluiu: %', v;
  END IF;
  IF (v->'evento'->>'captura_antes_path') IS NULL OR (v->'evento'->>'captura_depois_path') IS NULL OR (v->'evento'->>'notificacao_id') IS NULL THEN
    RAISE EXCEPTION 'evento sem as duas capturas ou sem notificação: %', v;
  END IF;
  IF (v->'evento'->>'incluido_por') IS DISTINCT FROM 'Operador Ficticio' THEN
    RAISE EXCEPTION 'quem incluiu não veio do histórico: %', v->'evento'->>'incluido_por';
  END IF;

  SELECT * INTO r FROM missions WHERE id = 'HOMOLOG-OK';
  IF r.revenue_value <> 150 OR r.cost_value <> 80 OR r.toll_value <> 12 OR r.toll_value_provider <> 11 OR r.comissao <> 7 THEN
    RAISE EXCEPTION 'valor preservado foi alterado: receita % custo % pedagio % comissao %', r.revenue_value, r.cost_value, r.toll_value, r.comissao;
  END IF;
  IF r.snapshot_data <> '{"franchiseKm":40,"franchiseHours":4}'::jsonb
     OR r.snapshot_approved_by <> 'Aprovador Ficticio'
     OR r.billing_approved IS NOT TRUE THEN
    RAISE EXCEPTION 'snapshot ou aprovação original mudou';
  END IF;

  SELECT count(*) INTO n FROM reaprovacao_financeira;
  IF n <> 1 THEN
    RAISE EXCEPTION 'histórico deveria ter 1 evento, tem %', n;
  END IF;
  SELECT count(*) INTO n FROM reaprovacao_diretoria;
  IF n <> 1 THEN
    RAISE EXCEPTION 'diretoria deveria ter 1 aviso, tem %', n;
  END IF;

  v := public.reaprovar_os_financeira(
    '11111111-1111-4111-8111-111111111111', 'HOMOLOG-OK', 999, 80, 150, 80,
    'Correcao ficticia do valor conferido', 'ANA.FERNANDES',
    'HOMOLOG-OK/11111111-1111-4111-8111-111111111111/antes.jpg',
    'HOMOLOG-OK/11111111-1111-4111-8111-111111111111/depois.jpg',
    '2026-10-16 15:00:00+00'
  );
  IF v->>'ok' IS DISTINCT FROM 'true' OR v->>'repetida' IS DISTINCT FROM 'true' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-OK') <> 150 THEN
    RAISE EXCEPTION 'tentativa duplicada não foi idempotente: %', v;
  END IF;

  v := public.reaprovar_os_financeira(
    '22222222-2222-4222-8222-222222222222', 'HOMOLOG-OK', 180, 80, 100, 80,
    'Outra correcao ficticia simultanea', 'Giovanna Marsili', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'conflito' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-OK') <> 150 THEN
    RAISE EXCEPTION 'conflito de versão não segurou o valor: %', v;
  END IF;

  UPDATE reaprovacao_diretoria
  SET situacao = 'lido',
      historico = historico || jsonb_build_array(jsonb_build_object('acao', 'LIDO', 'por', 'Diretoria Ficticia', 'em', now())),
      resumo = resumo || jsonb_build_object('aprovacaoFinanceiraAlterada', false);
  UPDATE reaprovacao_diretoria
  SET situacao = 'questionado',
      historico = historico || jsonb_build_array(jsonb_build_object('acao', 'QUESTIONAR', 'por', 'Diretoria Ficticia', 'em', now(), 'observacao', 'Pergunta ficticia da homologação'));
  UPDATE reaprovacao_diretoria
  SET situacao = 'encerrado',
      historico = historico || jsonb_build_array(jsonb_build_object('acao', 'ENCERRAR', 'por', 'Diretoria Ficticia', 'em', now()));

  IF (SELECT billing_approved FROM missions WHERE id = 'HOMOLOG-OK') IS NOT TRUE
     OR (SELECT jsonb_array_length(historico) FROM reaprovacao_diretoria) <> 3 THEN
    RAISE EXCEPTION 'ações da diretoria mexeram na aprovação ou perderam histórico';
  END IF;

  IF (SELECT public FROM storage.buckets WHERE id = 'reaprovacao-financeira') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'bucket não ficou privado';
  END IF;
END $$;

CREATE ROLE anon_homolog NOLOGIN;
GRANT anon_homolog TO homolog;
SET ROLE anon_homolog;
DO $$
BEGIN
  PERFORM public.reaprovar_os_financeira(
    '33333333-3333-4333-8333-333333333333', 'HOMOLOG-OK', 10, 10, 150, 80,
    'Correcao ficticia do valor conferido', 'anon', 'a.jpg', 'b.jpg', now()
  );
  RAISE EXCEPTION 'anon conseguiu executar a função';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;
