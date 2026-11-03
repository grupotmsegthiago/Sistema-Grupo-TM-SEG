-- Tabela 2027 e classificação de rota (fixa / esporádica).
-- NÃO foi executada nesta entrega. Rodar no Supabase ajhmmjuewdsukecaimik.
-- missions.id é texto (OS-...), então consumed_in_order_id é text e não uuid.
-- Não altera cálculo de OS, NF, Asaas nem a cotação já publicada do portal.

BEGIN;

ALTER TABLE public.client_routes
  ADD COLUMN IF NOT EXISTS route_type text NOT NULL DEFAULT 'fixa';

ALTER TABLE public.client_routes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.client_routes
  ADD COLUMN IF NOT EXISTS region text;

ALTER TABLE public.client_routes
  ADD COLUMN IF NOT EXISTS consumed_in_order_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_routes_route_type_check'
  ) THEN
    ALTER TABLE public.client_routes
      ADD CONSTRAINT client_routes_route_type_check
      CHECK (route_type IN ('fixa', 'esporadica'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_routes_region_check'
  ) THEN
    ALTER TABLE public.client_routes
      ADD CONSTRAINT client_routes_region_check
      CHECK (
        region IS NULL OR region IN (
          'sudeste_sp_rj', 'sudeste_mg_es', 'sul', 'centro_oeste', 'norte', 'nordeste'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_routes_ativas
  ON public.client_routes (client, is_active);

CREATE TABLE IF NOT EXISTS public.regional_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao text NOT NULL,
  region text NOT NULL,
  nome text NOT NULL,
  estados text NOT NULL,
  valor_km numeric(12,2) NOT NULL,
  franquia_km integer NOT NULL DEFAULT 100,
  franquia_horas integer NOT NULL DEFAULT 3,
  valor_hora_extra numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (versao, region)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'regional_rates_versao_check'
  ) THEN
    ALTER TABLE public.regional_rates
      ADD CONSTRAINT regional_rates_versao_check
      CHECK (versao IN ('2026', '2027'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'regional_rates_region_check'
  ) THEN
    ALTER TABLE public.regional_rates
      ADD CONSTRAINT regional_rates_region_check
      CHECK (region IN (
        'sudeste_sp_rj', 'sudeste_mg_es', 'sul', 'centro_oeste', 'norte', 'nordeste'
      ));
  END IF;
END $$;

INSERT INTO public.regional_rates (
  versao, region, nome, estados, valor_km, franquia_km, franquia_horas, valor_hora_extra
) VALUES
  ('2026', 'sudeste_sp_rj', 'SUDESTE SP/RJ', 'SP, RJ', 6.50, 100, 3, 159.00),
  ('2026', 'sudeste_mg_es', 'SUDESTE MG/ES', 'MG, ES', 7.00, 100, 3, 169.00),
  ('2026', 'sul', 'SUL', 'PR, SC, RS', 7.50, 100, 3, 179.00),
  ('2026', 'centro_oeste', 'CENTRO-OESTE', 'MT, MS, GO, DF', 8.50, 100, 3, 189.00),
  ('2026', 'nordeste', 'NORDESTE', 'BA, SE, AL, PE, PB, RN, CE, PI, MA', 7.30, 100, 3, 169.00),
  ('2026', 'norte', 'NORTE', 'AM, RR, AP, PA, TO, RO, AC', 9.00, 100, 3, 210.00),
  ('2027', 'sudeste_sp_rj', 'SUDESTE SP/RJ', 'SP, RJ', 6.90, 100, 3, 159.00),
  ('2027', 'sudeste_mg_es', 'SUDESTE MG/ES', 'MG, ES', 7.30, 100, 3, 169.00),
  ('2027', 'sul', 'SUL', 'PR, SC, RS', 7.50, 100, 3, 179.00),
  ('2027', 'centro_oeste', 'CENTRO-OESTE', 'MT, MS, GO, DF', 8.50, 100, 3, 189.00),
  ('2027', 'nordeste', 'NORDESTE', 'BA, SE, AL, PE, PB, RN, CE, PI, MA', 8.30, 100, 3, 169.00),
  ('2027', 'norte', 'NORTE', 'AM, RR, AP, PA, TO, RO, AC', 10.00, 100, 3, 210.00)
ON CONFLICT (versao, region) DO NOTHING;

INSERT INTO public.system_settings (key, value, updated_by)
VALUES ('tabela_regional_vigente', '{"versao":"2026"}'::jsonb, 'migration-2026-10-26')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.regional_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for regional_rates" ON public.regional_rates;
CREATE POLICY "Allow all for regional_rates"
  ON public.regional_rates FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.regional_rates TO anon, authenticated;

COMMIT;
