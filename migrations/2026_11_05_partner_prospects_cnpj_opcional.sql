-- CNPJ opcional no Radar: permite "Pendente de CNPJ" enquanto o operador contacta.
-- Projeto ajhmmjuewdsukecaimik.

ALTER TABLE public.partner_prospects
  ALTER COLUMN cnpj DROP NOT NULL;

ALTER TABLE public.partner_prospects
  DROP CONSTRAINT IF EXISTS partner_prospects_cnpj_digits;

ALTER TABLE public.partner_prospects
  ADD CONSTRAINT partner_prospects_cnpj_digits
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

COMMENT ON COLUMN public.partner_prospects.cnpj IS
  '14 dígitos quando conhecido; NULL = Pendente de CNPJ (descoberta web sem documento no site).';
