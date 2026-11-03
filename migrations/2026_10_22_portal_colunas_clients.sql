-- Só as colunas do site, logotipo e cores no cadastro do cliente.
-- Aplicado em 2026-10-22 no projeto ajhmmjuewdsukecaimik, com autorização.
-- O restante de migrations/2026_10_21_portal_cliente.sql não foi executado.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_slug text,
  ADD COLUMN IF NOT EXISTS portal_site text,
  ADD COLUMN IF NOT EXISTS portal_logo_url text,
  ADD COLUMN IF NOT EXISTS portal_cor text,
  ADD COLUMN IF NOT EXISTS portal_cor_acao text;

CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_slug_key
  ON public.clients (portal_slug)
  WHERE portal_slug IS NOT NULL AND portal_slug <> '';
