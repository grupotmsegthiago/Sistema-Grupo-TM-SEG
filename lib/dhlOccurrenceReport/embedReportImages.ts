import { fetchImageDataUri } from './fetchImageDataUri.js';
import { isImageEvidenceUrl } from './photoUtils.js';

/** URLs únicas de imagens usadas no relatório (etapas + galeria 3.4). */
export function collectReportImageUrls(input: {
  phasePhotos: Array<{ url: string | null }>;
  allEvidencePhotos?: Array<{ url: string | null }>;
}): string[] {
  const urls = new Set<string>();
  for (const photo of input.phasePhotos) {
    const url = String(photo.url || '').trim();
    if (url && isImageEvidenceUrl(url)) urls.add(url);
  }
  for (const photo of input.allEvidencePhotos || []) {
    const url = String(photo.url || '').trim();
    if (url && isImageEvidenceUrl(url)) urls.add(url);
  }
  return [...urls];
}

/**
 * Substitui URLs remotas por data URIs no HTML — garante fotos no PDF (impressão)
 * e no HTML baixado, sem depender de CORS ou tempo de carregamento no browser.
 */
export async function embedRemoteImagesInHtml(html: string, urls: string[]): Promise<string> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return html;

  const replacements = new Map<string, string>();
  await Promise.all(
    unique.map(async (url) => {
      const dataUri = await fetchImageDataUri(url);
      if (dataUri) replacements.set(url, dataUri);
    }),
  );

  if (!replacements.size) return html;

  let result = html;
  for (const [url, dataUri] of replacements) {
    result = result.split(url).join(dataUri);
  }
  return result;
}
