/**
 * Copia as fotos da missão para dentro do relatório.
 * O arquivo original no armazenamento não é alterado.
 * Só aceita o bucket público de evidências desta instalação.
 */
import sharp from 'sharp';

const PREFIXO = 'https://ajhmmjuewdsukecaimik.supabase.co/storage/v1/object/public/mission-evidence/';
const LIMITE_URLS = 12;
const LIMITE_BYTES = 12_000_000;

export function urlDeEvidenciaPermitida(url: string): boolean {
  return url.startsWith(PREFIXO) && !url.includes('..') && !url.includes('\\');
}

async function copiarUma(url: string): Promise<string | null> {
  if (!urlDeEvidenciaPermitida(url)) return null;
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(40000),
    headers: { 'User-Agent': 'TMSEG/1.0 (contato@grupotmseg.com.br)' },
  });
  if (!resposta.ok) return null;
  const tipo = String(resposta.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!tipo.startsWith('image/')) return null;
  const bruto = Buffer.from(await resposta.arrayBuffer());
  if (!bruto.length || bruto.length > LIMITE_BYTES) return null;
  const jpeg = await sharp(bruto, { failOn: 'none' })
    .rotate()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

export async function embutirEvidencias(urls: unknown): Promise<Array<{ url: string; dataUrl: string | null }>> {
  const lista = Array.isArray(urls) ? urls : [];
  const unicas = [...new Set(lista.map((item) => String(item || '').trim()).filter(urlDeEvidenciaPermitida))].slice(0, LIMITE_URLS);
  return Promise.all(unicas.map(async (url) => {
    try {
      return { url, dataUrl: await copiarUma(url) };
    } catch {
      return { url, dataUrl: null };
    }
  }));
}
