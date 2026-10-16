-- Aplicar somente depois que o código com link assinado estiver no ar
-- e a operação das fotos, documentos e comprovantes tiver sido conferida.
-- Não apaga, não move e não renomeia arquivo.
-- Um link assinado já emitido continua válido até expirar.
-- Uma cópia já baixada não é recolhida por esta migration.

UPDATE storage.buckets
SET public = false
WHERE id IN ('mission-evidence', 'documents', 'comissoes-comprovantes');

DROP POLICY IF EXISTS "Allow read" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Documents" ON storage.objects;
DROP POLICY IF EXISTS "comissoes_comprovantes_select" ON storage.objects;
