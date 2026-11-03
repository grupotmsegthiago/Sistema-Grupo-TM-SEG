/** Endereço público do portal. CEVA e IBL ficam fora: já têm página própria. */

const RESERVADOS = new Set([
  'api',
  'assets',
  'cadastro-operacional',
  'ceva',
  'dhl',
  'docs',
  'favicon.ico',
  'fornecedor',
  'ibl',
  'icon',
  'index.html',
  'login',
  'manifest.json',
  'rastreio',
  'reset-password',
  'static',
  'sw.js',
  'viaturas',
]);

const PARAR = new Set(['LTDA', 'SA', 'S.A', 'S.A.', 'EIRELI', 'ME', 'EPP', 'DO', 'DA', 'DE', 'DOS', 'DAS', 'E']);

export function limparSlug(valor: string | null | undefined): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .slice(0, 40);
}

export function slugPublico(valor: string | null | undefined): string {
  const slug = limparSlug(valor).replace(/-+$/g, '');
  if (!slug) return '';
  return RESERVADOS.has(slug) ? `${slug}-portal` : slug;
}

export function slugDeNome(nome: string | null | undefined): string {
  const bruto = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const palavras = bruto.split(/[^A-Z0-9]+/).filter((parte) => parte && !PARAR.has(parte));
  let slug = (palavras[0] || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (!slug) slug = 'cliente';
  if (RESERVADOS.has(slug)) slug = `${slug}-portal`;
  return slug;
}

/** Um segmento de URL que pode ser portal. Caminho reservado devolve null. */
export function slugDeCaminho(pathname: string | null | undefined): string | null {
  const path = String(pathname || '').toLowerCase().replace(/\/$/, '');
  const match = path.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (!match) return null;
  const slug = match[1];
  if (RESERVADOS.has(slug)) return null;
  return slug;
}

export function corHex(valor: string | null | undefined): string | null {
  const texto = String(valor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(texto) ? texto.toLowerCase() : null;
}
