-- Desfaz só a sequência. As OS já gravadas permanecem.

DROP FUNCTION IF EXISTS public.proximo_numero_gtm();
DROP SEQUENCE IF EXISTS public.os_gtm_seq;
