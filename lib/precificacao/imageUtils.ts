/** PNG 1x1 transparente. Entra quando a logo original não carrega. */
export const DEFAULT_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function bytesParaBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

/** Baixa a imagem e devolve data:image/...;base64. URL que já é data URL volta igual. */
export async function getBase64ImageFromURL(url: string): Promise<string> {
  const origem = String(url || '').trim();
  if (!origem) throw new Error('URL da imagem vazia.');
  if (origem.startsWith('data:image/')) return origem;
  const absoluta = origem.startsWith('http://') || origem.startsWith('https://')
    ? origem
    : (typeof window !== 'undefined' ? new URL(origem, window.location.origin).toString() : origem);
  const resposta = await fetch(absoluta);
  if (!resposta.ok) throw new Error(`Imagem respondeu ${resposta.status}.`);
  const tipo = (resposta.headers.get('content-type') || 'image/png').split(';')[0].trim() || 'image/png';
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return `data:${tipo};base64,${bytesParaBase64(bytes)}`;
}

async function embutir(origem: string): Promise<string> {
  try {
    return await getBase64ImageFromURL(origem);
  } catch {
    return DEFAULT_LOGO_BASE64;
  }
}

/** Troca src relativo ou remoto por Base64 antes do html2canvas / jsPDF / impressão. */
export async function prepararImagensDoElemento(raiz: ParentNode): Promise<void> {
  const imagens = Array.from(raiz.querySelectorAll('img'));
  const vetores = Array.from(raiz.querySelectorAll('image'));
  await Promise.all([
    ...imagens.map(async (imagem) => {
      const src = imagem.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      imagem.src = await embutir(src);
    }),
    ...vetores.map(async (imagem) => {
      const src = imagem.getAttribute('href') || imagem.getAttribute('xlink:href') || '';
      if (!src || src.startsWith('data:')) return;
      const data = await embutir(src);
      imagem.setAttribute('href', data);
      if (imagem.hasAttribute('xlink:href')) imagem.setAttribute('xlink:href', data);
    }),
  ]);
}
