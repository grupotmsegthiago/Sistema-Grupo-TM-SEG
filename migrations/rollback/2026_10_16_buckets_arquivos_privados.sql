-- Devolve a leitura pública dos três buckets.
-- Não apaga, não move e não renomeia arquivo.

UPDATE storage.buckets
SET public = true
WHERE id IN ('mission-evidence', 'documents', 'comissoes-comprovantes');

DROP POLICY IF EXISTS "Allow read" ON storage.objects;
CREATE POLICY "Allow read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'mission-evidence');

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Public Access Documents" ON storage.objects;
CREATE POLICY "Public Access Documents"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "comissoes_comprovantes_select" ON storage.objects;
CREATE POLICY "comissoes_comprovantes_select"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'comissoes-comprovantes');
