-- Homologação isolada da edição total. Só em PostgreSQL local, nunca no Grupo TMSEG.
-- Dados fictícios. O script falha com RAISE se alguma trava não segurar.
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
  client text,
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
  displacement_value numeric,
  displacement_value_provider numeric,
  start_km numeric,
  end_km numeric,
  provider_start_km double precision,
  provider_end_km double precision,
  total_distance numeric,
  traveled_distance numeric,
  start_time timestamptz,
  end_time timestamptz,
  provider_start_time timestamptz,
  provider_end_time timestamptz,
  estimated_time text,
  provider_ops_edited boolean,
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
\ir ../migrations/propostas/2026_10_16_edicao_total_financeira.sql

INSERT INTO missions (
  id, client, status, billing_approved, billing_verified_by, snapshot_approved_by, snapshot_approved_at,
  snapshot_data, negative_margin_locked, revenue_value, cost_value, toll_value, toll_value_provider,
  start_km, end_km, start_time, end_time, provider_ops_edited, comissao, estimated_time
) VALUES
  ('HOMOLOG-EDICAO', 'Cliente Ficticio', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40,"franchiseHours":4}'::jsonb, false, 100, 80, 12, 11, 10, 50,
   '2026-10-16 11:00:00+00', '2026-10-16 15:00:00+00', false, 7, '04:00'),
  ('HOMOLOG-ED-FATURA', 'Cliente Ficticio', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 12, 11, 10, 50, '2026-10-16 11:00:00+00', '2026-10-16 15:00:00+00', false, 7, '04:00'),
  ('HOMOLOG-ED-PAGA', 'Cliente Ficticio', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 12, 11, 10, 50, '2026-10-16 11:00:00+00', '2026-10-16 15:00:00+00', false, 7, '04:00'),
  ('HOMOLOG-ED-ENCERRADA', 'Cliente Ficticio', 'Encerrada', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, false, 100, 80, 12, 11, 10, 50, '2026-10-16 11:00:00+00', '2026-10-16 15:00:00+00', false, 7, '04:00'),
  ('HOMOLOG-ED-PREJUIZO', 'Cliente Ficticio', 'Concluída', true, 'Conferente Ficticio', 'Aprovador Ficticio', '2026-10-01 12:00:00+00',
   '{"franchiseKm":40}'::jsonb, true, 100, 80, 12, 11, 10, 50, '2026-10-16 11:00:00+00', '2026-10-16 15:00:00+00', false, 7, '04:00');

UPDATE missions SET invoice_number = 'NF-FICTICIA' WHERE id = 'HOMOLOG-ED-FATURA';
INSERT INTO financial_invoices (id, status) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PAGA');
INSERT INTO financial_invoice_missions (invoice_id, mission_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HOMOLOG-ED-PAGA');
INSERT INTO mission_logs (mission_id, updated_by, created_at)
VALUES ('HOMOLOG-EDICAO', 'Operador Ficticio', '2026-10-01 10:00:00+00');

DO $$
DECLARE
  v jsonb;
  n int;
  snap jsonb;
  aprovado boolean;
  v_comissao numeric;
BEGIN
  v := public.editar_os_total_financeira(
    '44444444-4444-4444-8444-444444444444', 'HOMOLOG-EDICAO',
    '[]'::jsonb, 'curta', 'Giovanna Marsili', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'ok' IS DISTINCT FROM 'false' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-EDICAO') <> 100 THEN
    RAISE EXCEPTION 'justificativa curta gravou: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '44444444-4444-4444-8444-444444444445', 'HOMOLOG-EDICAO',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '150')),
    'Ajuste conferido na edição total da OS', 'Giovanna Marsili', '', 'b.jpg', now()
  );
  IF v->>'ok' IS DISTINCT FROM 'false' OR (SELECT count(*) FROM reaprovacao_financeira) <> 0 THEN
    RAISE EXCEPTION 'sem captura gravou: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '55555555-5555-4555-8555-555555555555', 'HOMOLOG-EDICAO',
    jsonb_build_array(
      jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '150'),
      jsonb_build_object('campo', 'cost_value', 'antes', '80', 'depois', '90'),
      jsonb_build_object('campo', 'toll_value', 'antes', '12', 'depois', '18'),
      jsonb_build_object('campo', 'start_time', 'antes', '2026-10-16T11:00:00+00', 'depois', '2026-10-16T12:00:00+00'),
      jsonb_build_object('campo', 'tabela_cliente', 'antes', '', 'depois', 'Tabela Norte'),
      jsonb_build_object('campo', 'franquia_km', 'antes', '40', 'depois', '80')
    ),
    'Ajuste conferido na edição total da OS', 'ANA.FERNANDES',
    'HOMOLOG-EDICAO/antes.jpg', 'HOMOLOG-EDICAO/depois.jpg', '2026-10-16 18:00:00+00'
  );
  IF v->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'edição autorizada falhou: %', v;
  END IF;

  SELECT snapshot_data, billing_approved, missions.comissao
  INTO snap, aprovado, v_comissao
  FROM missions WHERE id = 'HOMOLOG-EDICAO';
  IF snap->>'franchiseKm' IS DISTINCT FROM '40' OR aprovado IS NOT TRUE OR v_comissao IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'snapshot, aprovação ou comissão mudou';
  END IF;
  IF (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-EDICAO') <> 150
     OR (SELECT cost_value FROM missions WHERE id = 'HOMOLOG-EDICAO') <> 90
     OR (SELECT toll_value FROM missions WHERE id = 'HOMOLOG-EDICAO') <> 18
     OR (SELECT start_time FROM missions WHERE id = 'HOMOLOG-EDICAO') <> '2026-10-16T12:00:00Z'::timestamptz
     OR (SELECT parametros_edicao_total->>'tabela_cliente' FROM missions WHERE id = 'HOMOLOG-EDICAO') IS DISTINCT FROM 'Tabela Norte'
     OR (SELECT (parametros_edicao_total->>'franquia_km')::numeric FROM missions WHERE id = 'HOMOLOG-EDICAO') IS DISTINCT FROM 80 THEN
    RAISE EXCEPTION 'cliente ou fornecedor não gravou: receita % custo % pedagio % hora % params %',
      (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-EDICAO'),
      (SELECT cost_value FROM missions WHERE id = 'HOMOLOG-EDICAO'),
      (SELECT toll_value FROM missions WHERE id = 'HOMOLOG-EDICAO'),
      (SELECT start_time AT TIME ZONE 'UTC' FROM missions WHERE id = 'HOMOLOG-EDICAO'),
      (SELECT parametros_edicao_total FROM missions WHERE id = 'HOMOLOG-EDICAO');
  END IF;
  IF (SELECT resumo->>'origem' FROM reaprovacao_diretoria) IS DISTINCT FROM 'edicao_total'
     OR (SELECT resumo->>'aprovacaoFinanceiraAlterada' FROM reaprovacao_diretoria) IS DISTINCT FROM 'false'
     OR (SELECT situacao FROM reaprovacao_diretoria) IS DISTINCT FROM 'pendente' THEN
    RAISE EXCEPTION 'aviso à diretoria incompleto';
  END IF;

  v := public.editar_os_total_financeira(
    '55555555-5555-4555-8555-555555555555', 'HOMOLOG-EDICAO',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '150', 'depois', '999')),
    'Ajuste conferido na edição total da OS', 'ANA.FERNANDES', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'ok' IS DISTINCT FROM 'true' OR v->>'repetida' IS DISTINCT FROM 'true'
     OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-EDICAO') <> 150 THEN
    RAISE EXCEPTION 'idempotência falhou: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '66666666-6666-4666-8666-666666666666', 'HOMOLOG-EDICAO',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '200')),
    'Ajuste conferido na edição total da OS', 'Giovanna Marsili', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'conflito' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-EDICAO') <> 150 THEN
    RAISE EXCEPTION 'concorrência não segurou o valor: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '77777777-7777-4777-8777-777777777771', 'HOMOLOG-ED-FATURA',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '150')),
    'Ajuste conferido na edição total da OS', 'Diretoria Ficticia', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-ED-FATURA') <> 100 THEN
    RAISE EXCEPTION 'faturada foi alterada: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '77777777-7777-4777-8777-777777777772', 'HOMOLOG-ED-PAGA',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '150')),
    'Ajuste conferido na edição total da OS', 'Diretoria Ficticia', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-ED-PAGA') <> 100 THEN
    RAISE EXCEPTION 'paga foi alterada: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '77777777-7777-4777-8777-777777777773', 'HOMOLOG-ED-ENCERRADA',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '150')),
    'Ajuste conferido na edição total da OS', 'Diretoria Ficticia', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-ED-ENCERRADA') <> 100 THEN
    RAISE EXCEPTION 'encerrada foi alterada: %', v;
  END IF;

  v := public.editar_os_total_financeira(
    '77777777-7777-4777-8777-777777777774', 'HOMOLOG-ED-PREJUIZO',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '100', 'depois', '150')),
    'Ajuste conferido na edição total da OS', 'Diretoria Ficticia', 'a.jpg', 'b.jpg', now()
  );
  IF v->>'codigo' IS DISTINCT FROM 'trava' OR (SELECT revenue_value FROM missions WHERE id = 'HOMOLOG-ED-PREJUIZO') <> 100 THEN
    RAISE EXCEPTION 'prejuízo foi alterado: %', v;
  END IF;

  SELECT count(*) INTO n FROM reaprovacao_financeira WHERE status = 'concluida';
  IF n <> 1 THEN
    RAISE EXCEPTION 'histórico deveria ter 1 evento concluído, tem %', n;
  END IF;
END $$;

CREATE ROLE anon_homolog NOLOGIN;
GRANT anon_homolog TO CURRENT_USER;
SET ROLE anon_homolog;
DO $$
BEGIN
  PERFORM public.editar_os_total_financeira(
    '88888888-8888-4888-8888-888888888888', 'HOMOLOG-EDICAO',
    jsonb_build_array(jsonb_build_object('campo', 'revenue_value', 'antes', '150', 'depois', '1')),
    'Ajuste conferido na edição total da OS', 'anon', 'a.jpg', 'b.jpg', now()
  );
  RAISE EXCEPTION 'anon conseguiu executar a edição total';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

DO $$
BEGIN
  CREATE TABLE rls_prova (id int primary key, revenue_value numeric);
  ALTER TABLE rls_prova ENABLE ROW LEVEL SECURITY;
  CREATE POLICY aberta ON rls_prova FOR ALL TO anon_homolog USING (true) WITH CHECK (true);
  GRANT SELECT, UPDATE ON rls_prova TO anon_homolog;
  INSERT INTO rls_prova VALUES (1, 100);
END $$;

SET ROLE anon_homolog;
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM rls_prova;
  IF n <> 1 THEN
    RAISE EXCEPTION 'a política aberta deveria deixar o anon ler, leu %', n;
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  DROP POLICY aberta ON rls_prova;
  CREATE POLICY fechada ON rls_prova FOR ALL TO anon_homolog USING (false);
END $$;

SET ROLE anon_homolog;
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM rls_prova;
  IF n <> 0 THEN
    RAISE EXCEPTION 'a política fechada deveria esconder a linha do anon';
  END IF;
END $$;
RESET ROLE;
