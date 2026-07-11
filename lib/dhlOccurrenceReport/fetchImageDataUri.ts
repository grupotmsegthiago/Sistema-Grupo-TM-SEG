const IMAGE_FETCH_TIMEOUT_MS = 12000;

function getPublicBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL
    || process.env.SYSTEM_URL
    || 'https://sistema.grupotmseg.com.br'
  ).replace(/\/$/, '');
}

async function fetchWithTimeout(url: string, timeoutMs = IMAGE_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Carrega imagem remota (Supabase Storage ou site) em data URI — compatível com serverless. */
export async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const raw = String(url || '').trim();
    if (!raw) return null;
    if (raw.startsWith('data:image/')) return raw;

    const fetchUrl = raw.startsWith('/')
      ? `${getPublicBaseUrl()}${raw}`
      : raw;

    const res = await fetchWithTimeout(fetchUrl);
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20) return null;

    const ctype = String(res.headers.get('content-type') || '').toLowerCase();
    if (ctype.includes('svg')) return null;

    let mime = 'image/jpeg';
    if (ctype.includes('png')) mime = 'image/png';
    else if (ctype.includes('webp')) mime = 'image/webp';
    else if (ctype.includes('gif')) mime = 'image/gif';
    else if (/\.png(\?|$)/i.test(fetchUrl)) mime = 'image/png';
    else if (/\.webp(\?|$)/i.test(fetchUrl)) mime = 'image/webp';

    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
