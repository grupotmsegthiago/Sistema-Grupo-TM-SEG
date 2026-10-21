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

export function lerMarcaDoHtml(html: string, base: URL): MarcaLida {
  const icone = html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i)?.[0] || '';
  const hrefIcone = icone.match(/href=["']([^"']+)["']/i)?.[1] || '';
  const og = meta(html, 'property', 'og:image') || meta(html, 'name', 'og:image');
  const cor = corHex(meta(html, 'name', 'theme-color')) || corHex(meta(html, 'name', 'msapplication-TileColor'));
  return {
    logo: absoluto(base, og) || absoluto(base, hrefIcone),
    cor,
    corAcao: cor,
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
    return lerMarcaDoHtml(html, atual);
  } catch {
    return { error: 'Não foi possível ler o site. Envie o logotipo e escolha as cores.' };
  } finally {
    clearTimeout(timer);
  }
}
