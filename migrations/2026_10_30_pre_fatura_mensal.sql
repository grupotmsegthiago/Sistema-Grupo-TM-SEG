-- Pré-fatura mensal (postos). Aditivo.
-- Não altera missions, client_price_tables, financial_invoices nem financial_transactions.
-- clients.id é bigint. financial_invoices.id é uuid. system_users.id é bigint.
--
-- NÃO aplicar por conta própria. O proprietário roda este arquivo no SQL Editor
-- do projeto ajhmmjuewdsukecaimik depois de ver a tela no localhost.
-- App usa chave anon (não auth.uid). RLS permissiva igual a financial_invoice_missions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_monthly_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  short_name text NOT NULL,
  description text NOT NULL,
  post_count integer NOT NULL DEFAULT 1 CHECK (post_count > 0),
  schedule_type text NOT NULL DEFAULT '',
  work_hours text NOT NULL DEFAULT '',
  monthly_amount numeric(12,2) NOT NULL CHECK (monthly_amount >= 0),
  start_date date NOT NULL,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_by text,
  created_by_user_id bigint REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_monthly_services_vigencia_ok CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_client_monthly_services_client
  ON public.client_monthly_services (client_id);

CREATE TABLE IF NOT EXISTS public.client_pre_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  competence char(7) NOT NULL,
  status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'APROVADA', 'FATURADA', 'CANCELADA')),
  total_contractual_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_invoiced_amount numeric(12,2) NOT NULL DEFAULT 0,
  financial_invoice_id uuid REFERENCES public.financial_invoices(id) ON DELETE SET NULL,
  emission_ref text,
  cancel_reason text,
  created_by text,
  created_by_user_id bigint REFERENCES public.system_users(id) ON DELETE SET NULL,
  approved_by text,
  approved_by_user_id bigint REFERENCES public.system_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_pre_invoices_competence_ok CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

-- Uma pré-fatura viva por cliente e mês. Cancelada libera outro rascunho.
CREATE UNIQUE INDEX IF NOT EXISTS client_pre_invoices_aberta_uk
  ON public.client_pre_invoices (client_id, competence)
  WHERE status <> 'CANCELADA';

CREATE INDEX IF NOT EXISTS idx_client_pre_invoices_client
  ON public.client_pre_invoices (client_id, competence);

CREATE TABLE IF NOT EXISTS public.client_pre_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_invoice_id uuid NOT NULL REFERENCES public.client_pre_invoices(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.client_monthly_services(id) ON DELETE SET NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('SERVICO', 'EXTRAORDINARIO', 'REEMBOLSO', 'DESCONTO', 'COMPLEMENTAR')),
  billing_reference text NOT NULL,
  short_name text,
  description text NOT NULL,
  service_start_date date,
  contractual_amount numeric(12,2) NOT NULL DEFAULT 0,
  calculated_amount numeric(12,2) NOT NULL DEFAULT 0,
  invoiced_amount numeric(12,2) NOT NULL DEFAULT 0,
  excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_pre_invoice_items_fatura
  ON public.client_pre_invoice_items (pre_invoice_id, sort_order);

CREATE TABLE IF NOT EXISTS public.client_pre_invoice_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.client_pre_invoice_items(id) ON DELETE CASCADE,
  pre_invoice_id uuid NOT NULL REFERENCES public.client_pre_invoices(id) ON DELETE CASCADE,
  previous_amount numeric(12,2) NOT NULL,
  new_amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  adjustment_kind text NOT NULL,
  user_name text NOT NULL,
  user_id bigint REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_pre_invoice_adjustments_item
  ON public.client_pre_invoice_adjustments (item_id, created_at);

ALTER TABLE public.client_monthly_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_pre_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_pre_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_pre_invoice_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for client_monthly_services" ON public.client_monthly_services;
CREATE POLICY "Allow all for client_monthly_services"
  ON public.client_monthly_services FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for client_pre_invoices" ON public.client_pre_invoices;
CREATE POLICY "Allow all for client_pre_invoices"
  ON public.client_pre_invoices FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for client_pre_invoice_items" ON public.client_pre_invoice_items;
CREATE POLICY "Allow all for client_pre_invoice_items"
  ON public.client_pre_invoice_items FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for client_pre_invoice_adjustments" ON public.client_pre_invoice_adjustments;
CREATE POLICY "Allow all for client_pre_invoice_adjustments"
  ON public.client_pre_invoice_adjustments FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_monthly_services TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_pre_invoices TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_pre_invoice_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_pre_invoice_adjustments TO anon, authenticated;

COMMIT;
