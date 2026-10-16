-- Rollback da proposta. NÃO executar sem autorização.
-- Apaga o histórico de reaprovação e o bucket privado desta função.

DROP TABLE IF EXISTS reaprovacao_diretoria;
DROP TABLE IF EXISTS reaprovacao_financeira;
DELETE FROM storage.buckets WHERE id = 'reaprovacao-financeira';
