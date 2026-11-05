-- Enriquecimento profundo do Radar de Parceiros.
-- Projeto: ajhmmjuewdsukecaimik. Não incluiir .env / segredos.

BEGIN;

ALTER TABLE public.partner_prospects
  ADD COLUMN IF NOT EXISTS emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_district text,
  ADD COLUMN IF NOT EXISTS address_cep varchar(8),
  ADD COLUMN IF NOT EXISTS address_full text,
  ADD COLUMN IF NOT EXISTS cnpj_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'partial', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS last_enrichment_at timestamptz;

COMMENT ON COLUMN public.partner_prospects.emails IS
  'Até 5 e-mails capturados (comercial/operacional/contato). email = principal.';
COMMENT ON COLUMN public.partner_prospects.instagram IS
  'URL ou @ do Instagram corporativo.';
COMMENT ON COLUMN public.partner_prospects.enrichment_status IS
  'pending | partial | complete | failed — ciclo de deep search do robô.';

-- Backfill: e-mail singular → array
UPDATE public.partner_prospects
SET emails = ARRAY[lower(trim(email))]
WHERE email IS NOT NULL
  AND trim(email) <> ''
  AND (emails IS NULL OR cardinality(emails) = 0);

COMMIT;
