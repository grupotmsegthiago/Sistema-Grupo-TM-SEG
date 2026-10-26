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

const LIMITE_URL_MAPA = 7500;

const ESTILOS_MAPA_ESTATICO = [
  'element:geometry|color:0x0f172a',
  'element:labels.text.fill|color:0xcbd5e1',
  'element:labels.text.stroke|color:0x0f172a',
  'feature:road|element:geometry|color:0x1e293b',
  'feature:road.highway|element:geometry|color:0x334155',
  'feature:water|element:geometry|color:0x0c4a6e',
  'feature:landscape|element:geometry|color:0x111827',
  'feature:poi|visibility:off',
  'feature:transit|visibility:off',
];

function amostrarPontos(pontos: PontoMapa[], maximo: number): PontoMapa[] {
  const validos = pontos.map((item) => pontoUtil(item)).filter((item): item is PontoMapa => item != null);
  const teto = Math.max(2, maximo);
  if (validos.length <= teto) return validos;
  const passo = (validos.length - 1) / (teto - 1);
  const saida: PontoMapa[] = [];
  const vistos = new Set<number>();
  for (let i = 0; i < teto; i++) {
    const indice = Math.round(i * passo);
    if (vistos.has(indice)) continue;
    vistos.add(indice);
    saida.push(validos[indice]);
  }
  return saida;
}

function camadasDoTrajeto(miolo: string): string[] {
  return [
    `color:0x7dd3fc99|weight:14|${miolo}`,
    `color:0x38bdf8ff|weight:6|${miolo}`,
    `color:0xf8fafcff|weight:2|${miolo}`,
  ];
}

function montarUrlMapa(chave: string, trechos: string[], entrada: {
  inicio?: PontoMapa | null;
  fim?: PontoMapa | null;
  paradas?: PontoMapa[];
}): string {
  const base = new URLSearchParams({ size: '640x360', scale: '2', maptype: 'roadmap', key: chave });
  let url = `https://maps.googleapis.com/maps/api/staticmap?${base.toString()}`;
  for (const estilo of ESTILOS_MAPA_ESTATICO) url += `&style=${encodeURIComponent(estilo)}`;
  for (const trecho of trechos) url += `&path=${encodeURIComponent(trecho)}`;
  const marcar = (spec: string, ponto: PontoMapa | null) => {
    if (!ponto) return;
    url += `&markers=${encodeURIComponent(`${spec}|${ponto.lat.toFixed(5)},${ponto.lng.toFixed(5)}`)}`;
  };
  marcar('size:mid|color:green|label:A', pontoUtil(entrada.inicio));
  for (const parada of (entrada.paradas || []).slice(0, 6)) marcar('size:small|color:yellow', pontoUtil(parada));
  marcar('size:mid|color:red|label:B', pontoUtil(entrada.fim));
  return url;
}

/**
 * Mapa estático do Google, 640×360 com scale 2 (o máximo do lado é 640).
 * A polilinha longa vira uma sequência de pontos para a URL não estourar.
 * Não inventa rua.
 */
export function urlMapaEstatico(entrada: {
  polyline: string;
  chave: string;
  inicio?: PontoMapa | null;
  fim?: PontoMapa | null;
  paradas?: PontoMapa[];
  pontos?: PontoMapa[];
}): string | null {
  const chave = String(entrada.chave || '').trim();
  if (!chave) return null;
  const linha = polylineUtil(entrada.polyline);
  if (linha) {
    const url = montarUrlMapa(chave, camadasDoTrajeto(`enc:${linha}`), entrada);
    if (url.length <= LIMITE_URL_MAPA) return url;
  }
  let pontos = amostrarPontos(entrada.pontos || [], 80);
  while (pontos.length >= 2) {
    const miolo = pontos.map((ponto) => `${ponto.lat.toFixed(5)},${ponto.lng.toFixed(5)}`).join('|');
    const url = montarUrlMapa(chave, camadasDoTrajeto(miolo), entrada);
    if (url.length <= LIMITE_URL_MAPA) return url;
    const proximo = Math.max(2, Math.floor(pontos.length * 0.65));
    if (proximo >= pontos.length) return null;
    pontos = amostrarPontos(pontos, proximo);
  }
  return null;
}
