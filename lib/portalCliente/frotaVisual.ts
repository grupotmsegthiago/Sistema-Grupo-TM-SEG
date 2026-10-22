/** Monta o pedido visual da carreta e o endereço do mapa estático. Não chama rede. */

export type PontoMapa = { lat: number; lng: number };

export type CenaVisual = {
  mapa: string;
  carreta: string;
  logo: string | null;
  sobreporLogo: boolean;
};

export function corSegura(bruto: string | null | undefined): string | null {
  const texto = String(bruto || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(texto) ? texto.toLowerCase() : null;
}

/** Uma carreta por marca. Variações do nome não geram outra imagem. */
export function slugVisual(nome: string): string {
  const chave = nome.toLowerCase();
  if (chave.includes('ceva')) return 'ceva';
  if (chave.includes('dhl')) return 'dhl';
  if (chave.includes('ibl') || chave.includes('intermodal')) return 'ibl';
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'generico';
}

/** Logotipo já publicado no sistema. A IA não redesenha a marca. */
export function logoConhecido(nome: string): string | null {
  const chave = nome.toLowerCase();
  if (chave.includes('ceva')) return '/logo_ceva_portal.png';
  if (chave.includes('dhl')) return '/proposta-tmseg/clientes/dhl.png';
  if (chave.includes('ibl') || chave.includes('intermodal')) return '/logo_ibl_portal.png';
  return null;
}

export function logoSeguro(bruto: string | null | undefined): string | null {
  const texto = String(bruto || '').trim();
  if (!texto || texto.length > 200_000) return null;
  if (texto.startsWith('/') && !texto.startsWith('//') && !texto.includes('..') && !texto.includes('\\')) return texto;
  if (texto.startsWith('data:image/svg+xml')) return texto;
  try {
    const url = new URL(texto);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * A imagem pedida não leva nome nem marca.
 * O logotipo oficial entra depois, como camada separada.
 */
export function pedidoDaCarreta(cor: string | null): string {
  const tinta = corSegura(cor) || '#d9dde3';
  return [
    'Caminhão carreta realista, cavalo mecânico moderno e baú fechado, vista de três quartos pela frente esquerda, enquadramento horizontal.',
    'Iluminação de estúdio, sombra suave, fundo branco puro, acabamento premium.',
    'O baú fica branco, liso e vazio, para receber o logotipo oficial depois.',
    `A cor ${tinta} pode aparecer só numa faixa fina. Não pinte o baú inteiro com ela.`,
    'Não desenhe texto, letra, número, logotipo, marca, placa, estrada, céu nem pessoa.',
  ].join(' ');
}

export function polylineUtil(bruto: string | null | undefined): string | null {
  const texto = String(bruto || '').trim();
  if (texto.length < 8 || texto.length > 4000) return null;
  if (!/^[\x20-\x7E]+$/.test(texto)) return null;
  return texto;
}

function pontoUtil(ponto: PontoMapa | null | undefined): PontoMapa | null {
  if (!ponto) return null;
  const lat = Number(ponto.lat);
  const lng = Number(ponto.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Mapa híbrido do Google com o traçado já calculado. Não inventa rua. */
export function urlMapaEstatico(entrada: {
  polyline: string;
  chave: string;
  inicio?: PontoMapa | null;
  fim?: PontoMapa | null;
  paradas?: PontoMapa[];
}): string | null {
  const linha = polylineUtil(entrada.polyline);
  const chave = String(entrada.chave || '').trim();
  if (!linha || !chave) return null;
  const base = new URLSearchParams({ size: '640x400', scale: '2', maptype: 'hybrid', key: chave });
  const brilho = `color:0x7dd3fc55|weight:18|enc:${linha}`;
  const rota = `color:0x38bdf8ff|weight:8|enc:${linha}`;
  const nucleo = `color:0xe0f2feff|weight:3|enc:${linha}`;
  let url = `https://maps.googleapis.com/maps/api/staticmap?${base.toString()}&path=${encodeURIComponent(brilho)}&path=${encodeURIComponent(rota)}&path=${encodeURIComponent(nucleo)}`;
  const marcar = (cor: string, ponto: PontoMapa | null) => {
    if (!ponto) return;
    url += `&markers=${encodeURIComponent(`size:mid|color:${cor}|${ponto.lat.toFixed(5)},${ponto.lng.toFixed(5)}`)}`;
  };
  marcar('green', pontoUtil(entrada.inicio));
  for (const parada of (entrada.paradas || []).slice(0, 6)) marcar('yellow', pontoUtil(parada));
  marcar('red', pontoUtil(entrada.fim));
  return url;
}
