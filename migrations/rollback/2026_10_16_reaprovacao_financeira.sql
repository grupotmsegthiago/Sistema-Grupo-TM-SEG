-- Rollback operacional. NÃO executar sem autorização.
-- Só retira a função que grava. O histórico, as notificações e as capturas ficam.
-- Não há DROP TABLE nem exclusão de arquivo neste script.

DROP FUNCTION IF EXISTS public.reaprovar_os_financeira(
  text, text, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz
);

-- A exclusão do histórico e das capturas fica de fora de propósito.
-- Descomentar apagaria eventos, avisos da Diretoria e os arquivos privados.
-- Não fazer isso sem backup e sem autorização explícita.
-- DROP TABLE IF EXISTS reaprovacao_diretoria;
-- DROP TABLE IF EXISTS reaprovacao_financeira;
-- DELETE FROM storage.objects WHERE bucket_id = 'reaprovacao-financeira';
-- DELETE FROM storage.buckets WHERE id = 'reaprovacao-financeira';
