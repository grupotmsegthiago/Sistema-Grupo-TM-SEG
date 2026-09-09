-- Piso regional mínimo para cotação comercial rápida.
-- NÃO entra no cálculo de OS/NF: faturamento continua em client_price_tables.
-- RLS permissiva (anon + authenticated), igual a comerciais/comissoes:
-- o app usa chave anon, sem auth.uid().

BEGIN;

CREATE TABLE IF NOT EXISTS public.tabela_precos_regioes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  regiao text NOT NULL,
  estados text NOT NULL,
  valor_acionamento numeric(12,2) NOT NULL,
  valor_km_extra numeric(12,2) NOT NULL,
  valor_hora_extra numeric(12,2) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tabela_precos_regioes (
  codigo, regiao, estados, valor_acionamento, valor_km_extra, valor_hora_extra, ordem
) VALUES
  ('sudeste-sp-rj', 'Sudeste - SP/RJ', 'SP, RJ', 6.50, 6.50, 159.00, 1),
  ('sudeste-mg-es', 'Sudeste - MG/ES', 'MG, ES', 7.00, 7.00, 169.00, 2),
  ('nordeste', 'Nordeste', 'AL, BA, CE, MA, PB, PE, PI, RN, SE', 7.30, 7.30, 169.00, 3),
  ('norte', 'Norte', 'AC, AP, AM, PA, RO, RR, TO', 9.00, 9.00, 210.00, 4),
  ('centro-oeste', 'Centro-Oeste', 'DF, GO, MT, MS', 8.50, 8.50, 189.00, 5),
  ('sul', 'Sul', 'PR, RS, SC', 7.50, 7.50, 179.00, 6)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_source text NOT NULL DEFAULT 'ROTA';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS closed_price_table_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_quote_source_check'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_quote_source_check
      CHECK (quote_source IN ('ROTA', 'RAPIDA_REGIONAL'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_closed_price_table_fk'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_closed_price_table_fk
      FOREIGN KEY (closed_price_table_id)
      REFERENCES public.client_price_tables(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotes_quote_source
  ON public.quotes (quote_source);

ALTER TABLE public.tabela_precos_regioes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for tabela_precos_regioes" ON public.tabela_precos_regioes;
CREATE POLICY "Allow all for tabela_precos_regioes"
  ON public.tabela_precos_regioes FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabela_precos_regioes TO anon, authenticated;

COMMIT;
