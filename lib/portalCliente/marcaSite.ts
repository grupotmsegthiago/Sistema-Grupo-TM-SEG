/** Lê favicon e cor pública do site do cliente. Não segue rede interna. */

import { corHex } from './slug';

const HOST_BLOQUEADO = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.0\.0\.0|metadata\.google|169\.254\.)/i;

export function urlDeSitePublico(bruto: string | null | undefined): URL | null {
  let texto = String(bruto || '').trim();
  if (!texto) return null;
  if (!/^https?:\/\//i.test(texto)) texto = `https://${texto}`;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || HOST_BLOQUEADO.test(host) || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  return url;
}

export type MarcaLida = {
  logo: string | null;
  cor: string | null;
  corAcao: string | null;
};

function absoluto(base: URL, caminho: string | null | undefined): string | null {
  const texto = String(caminho || '').trim();
  if (!texto || texto.startsWith('data:')) return null;
  try {
    const url = new URL(texto, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function meta(html: string, atributo: string, nome: string): string | null {
  const re = new RegExp(`<meta[^>]*${atributo}=["']${nome}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0] || '';
  const content = tag.match(/content=["']([^"']+)["']/i)?.[1] || '';
  return content.trim() || null;
}

function rgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminancia(hex: string): number {
  const { r, g, b } = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturacao(hex: string): number {
  const { r, g, b } = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function clarear(hex: string, quanto: number): string {
  const { r, g, b } = rgb(hex);
  const subir = (canal: number) => Math.max(0, Math.min(255, Math.round(canal + (255 - canal) * quanto)));
  return `#${[subir(r), subir(g), subir(b)].map((canal) => canal.toString(16).padStart(2, '0')).join('')}`;
}

function corUtil(hex: string | null): string | null {
  const cor = corHex(hex);
  if (!cor) return null;
  if (luminancia(cor) > 0.94) return null;
  if (saturacao(cor) < 0.08 && luminancia(cor) > 0.2) return null;
  return cor;
}

/** A cor mais escura vira a marca. A mais viva vira o botão. Branco e cinza ficam de fora. */
export function escolherPaleta(cores: Array<string | null | undefined>): { cor: string; corAcao: string } | null {
  const unicas: string[] = [];
  for (const item of cores) {
    const cor = corUtil(item);
    if (cor && !unicas.includes(cor)) unicas.push(cor);
  }
  if (unicas.length === 0) return null;
  const marca = [...unicas].sort((a, b) => luminancia(a) - luminancia(b))[0];
  const viva = [...unicas].filter((cor) => cor !== marca).sort((a, b) => saturacao(b) - saturacao(a))[0];
  return { cor: marca, corAcao: viva || (luminancia(marca) < 0.45 ? clarear(marca, 0.35) : marca) };
}

export function svgSemFundo(svg: string): string {
  return svg.replace(/<rect\b[^>]*\/?>/gi, (tag) => {
    const fill = tag.match(/\bfill=["']([^"']+)["']/i)?.[1] || '';
    const branco = /^#f{3}(?:f{3})?$|^white$|^#ffffff$/i.test(fill.trim()) || /rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(fill);
    const tela = /width=["']100%["']/i.test(tag) && /height=["']100%["']/i.test(tag);
    return branco && tela ? '' : tag;
  }).replace(/(<svg\b[^>]*?)\sstyle=["'][^"']*background(?:-color)?:[^"']*["']/i, '$1');
}

export function svgSeguro(bruto: string): string | null {
  const texto = String(bruto || '').trim();
  if (!/<svg[\s>]/i.test(texto) || texto.length > 200_000) return null;
  const limpo = svgSemFundo(texto)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+=["'][^"']*["']/gi, '');
  return /<svg[\s>]/i.test(limpo) ? limpo : null;
}

function ehSvg(endereco: string | null): boolean {
  return Boolean(endereco && /\.svg(?:$|\?)/i.test(endereco));
}

function candidatosLogo(html: string, base: URL): string[] {
  const achados: string[] = [];
  for (const tag of html.match(/<(?:link|img)\b[^>]*>/gi) || []) {
    const rel = /rel=["'][^"']*(?:icon|logo|mask-icon)[^"']*["']/i.test(tag);
    const pareceLogo = /logo/i.test(tag);
    if (!rel && !pareceLogo) continue;
    const href = tag.match(/\b(?:href|src)=["']([^"']+)["']/i)?.[1];
    const url = absoluto(base, href);
    if (url && ehSvg(url)) achados.push(url);
  }
  return [...new Set(achados)];
}

export function lerMarcaDoHtml(html: string, base: URL): MarcaLida {
  const tema = corHex(meta(html, 'name', 'theme-color')) || corHex(meta(html, 'name', 'msapplication-TileColor'));
  const paleta = escolherPaleta([tema, ...html.match(/#[0-9a-fA-F]{6}\b/g) || []]);
  const logos = candidatosLogo(html, base);
  return {
    logo: logos[0] || null,
    cor: paleta?.cor || null,
    corAcao: paleta?.corAcao || null,
  };
}

export async function buscarMarcaDoSite(bruto: string): Promise<MarcaLida | { error: string }> {
  const url = urlDeSitePublico(bruto);
  if (!url) return { error: 'Informe um site público, com endereço válido.' };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 6000);
  try {
    let atual = url;
    let resposta: Response | null = null;
    for (let salto = 0; salto < 3; salto += 1) {
      resposta = await fetch(atual, {
        signal: controle.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'TMSEG-portal-marca', Accept: 'text/html' },
      });
      if (resposta.status < 300 || resposta.status >= 400) break;
      const proxima = urlDeSitePublico(resposta.headers.get('location') || '');
      if (!proxima) return { error: 'O site redirecionou para um endereço que não pode ser lido.' };
      atual = proxima;
    }
    if (!resposta || !resposta.ok) return { error: 'O site não respondeu a leitura do logotipo.' };
    const html = (await resposta.text()).slice(0, 400_000);
    const marca = lerMarcaDoHtml(html, atual);
    if (!marca.logo) return marca;
    const arquivo = await fetch(marca.logo, {
      signal: controle.signal,
      headers: { 'User-Agent': 'TMSEG-portal-marca', Accept: 'image/svg+xml,text/plain' },
    });
    if (!arquivo.ok) return { ...marca, logo: null };
    const svg = svgSeguro(await arquivo.text());
    if (!svg) return { ...marca, logo: null };
    return { ...marca, logo: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
  } catch {
    return { error: 'Não foi possível ler o site. Envie o logotipo e escolha as cores.' };
  } finally {
    clearTimeout(timer);
  }
}
