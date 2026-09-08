-- Comissões comerciais (vendedores) — TM SEG
-- Aditivo: não altera tabelas financeiras existentes além de clients.responsavel_comercial_id.
-- clients.id é bigint; financial_invoices.id é uuid; missions.id é text.

BEGIN;

CREATE TABLE IF NOT EXISTS public.comerciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  pix_chave text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS responsavel_comercial_id uuid REFERENCES public.comerciais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_responsavel_comercial
  ON public.clients (responsavel_comercial_id);

CREATE TABLE IF NOT EXISTS public.regras_comissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercial_id uuid REFERENCES public.comerciais(id) ON DELETE CASCADE,
  percentual_imposto numeric NOT NULL DEFAULT 16.00,
  percentual_comissao numeric NOT NULL DEFAULT 3.00,
  observacao_regra text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regras_comissao_comercial
  ON public.regras_comissao (comercial_id);

CREATE TABLE IF NOT EXISTS public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid REFERENCES public.financial_invoices(id) ON DELETE SET NULL,
  ordem_servico_id text,
  fatura_numero text,
  cliente_id bigint REFERENCES public.clients(id) ON DELETE SET NULL,
  cliente_nome text,
  comercial_id uuid NOT NULL REFERENCES public.comerciais(id),
  valor_faturamento numeric NOT NULL,
  percentual_imposto_aplicado numeric NOT NULL DEFAULT 16.00,
  valor_base_liquida numeric NOT NULL,
  percentual_comissao_aplicado numeric NOT NULL DEFAULT 3.00,
  valor_comissao numeric NOT NULL,
  status text NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO_CLIENTE'
    CHECK (status IN (
      'AGUARDANDO_PAGAMENTO_CLIENTE',
      'LIBERADO_PARA_PAGAMENTO',
      'PAGO',
      'CANCELADO'
    )),
  data_faturamento date,
  data_recebimento_cliente date,
  data_pagamento_comissao date,
  comprovante_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comissoes_fatura_unique
  ON public.comissoes (fatura_id)
  WHERE fatura_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comissoes_comercial_status
  ON public.comissoes (comercial_id, status);

CREATE INDEX IF NOT EXISTS idx_comissoes_data_faturamento
  ON public.comissoes (data_faturamento);

CREATE INDEX IF NOT EXISTS idx_comissoes_cliente
  ON public.comissoes (cliente_id);

INSERT INTO public.regras_comissao (comercial_id, percentual_imposto, percentual_comissao, observacao_regra)
SELECT NULL, 16.00, 3.00, 'Regra geral: 16% imposto sobre o faturamento; 3% de comissão sobre o líquido.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.regras_comissao WHERE comercial_id IS NULL
);

-- App usa chave anon (não auth.uid). RLS habilitado com policy permissiva, igual ao padrão operacional.
ALTER TABLE public.comerciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_comissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for comerciais" ON public.comerciais;
CREATE POLICY "Allow all for comerciais"
  ON public.comerciais FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for regras_comissao" ON public.regras_comissao;
CREATE POLICY "Allow all for regras_comissao"
  ON public.regras_comissao FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for comissoes" ON public.comissoes;
CREATE POLICY "Allow all for comissoes"
  ON public.comissoes FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('comissoes-comprovantes', 'comissoes-comprovantes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "comissoes_comprovantes_select" ON storage.objects;
CREATE POLICY "comissoes_comprovantes_select"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'comissoes-comprovantes');

DROP POLICY IF EXISTS "comissoes_comprovantes_insert" ON storage.objects;
CREATE POLICY "comissoes_comprovantes_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'comissoes-comprovantes');

DROP POLICY IF EXISTS "comissoes_comprovantes_update" ON storage.objects;
CREATE POLICY "comissoes_comprovantes_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'comissoes-comprovantes')
  WITH CHECK (bucket_id = 'comissoes-comprovantes');

COMMIT;
