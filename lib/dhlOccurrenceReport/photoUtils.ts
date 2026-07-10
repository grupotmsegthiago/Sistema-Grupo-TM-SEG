/** Verifica se a URL aponta para arquivo de imagem renderizável no relatório. */
export function isImageEvidenceUrl(url: string): boolean {
  const clean = String(url || '').trim().split('?')[0].toLowerCase();
  if (!clean) return false;
  if (/\.(pdf|doc|docx|eml|msg)$/i.test(clean)) return false;
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(clean)) return true;
  return clean.includes('/storage/v1/object/public/');
}
