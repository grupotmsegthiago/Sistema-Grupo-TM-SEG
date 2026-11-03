-- Número atômico da OS GTM. Não aplica sozinho.
-- O formato vivo é GTM- e dígitos (GTM-7714). Não junta dígitos de um id com mais de um traço.
-- Sem linha GTM, a próxima chamada devolve 1.

CREATE SEQUENCE IF NOT EXISTS public.os_gtm_seq AS integer;

SELECT setval(
  'public.os_gtm_seq',
  GREATEST(COALESCE((
    SELECT MAX(CAST(substring(id FROM '^GTM-([0-9]+)$') AS integer))
    FROM public.missions
    WHERE id ~ '^GTM-[0-9]+$'
  ), 0), 1),
  COALESCE((
    SELECT MAX(CAST(substring(id FROM '^GTM-([0-9]+)$') AS integer))
    FROM public.missions
    WHERE id ~ '^GTM-[0-9]+$'
  ), 0) > 0
);

CREATE OR REPLACE FUNCTION public.proximo_numero_gtm()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.os_gtm_seq')::integer;
$$;

REVOKE ALL ON FUNCTION public.proximo_numero_gtm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proximo_numero_gtm() TO service_role;

REVOKE ALL ON SEQUENCE public.os_gtm_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.os_gtm_seq TO service_role;
