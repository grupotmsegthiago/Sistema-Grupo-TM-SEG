/** Regras puras da rota da cotação. Não chama o Google. */

import { extrairUf } from '../precificacao/tabela2027';

export type Coordenada = { lat: number; lng: number };

type ComponenteEndereco = { long_name?: string; short_name?: string; types?: string[] };

/**
 * A região da cotação lê a UF no texto. O Google às vezes devolve "Salvador, Bahia, Brazil",
 * e esse texto não tem a sigla. A cidade com a UF continua no campo.
 */
export function enderecoComUf(lugar: {
  formatted_address?: string | null;
  name?: string | null;
  address_components?: ComponenteEndereco[] | null;
} | null | undefined, digitado?: string | null): string {
  const escrito = String(digitado || '').trim();
  if (escrito && extrairUf(escrito, '')) return escrito;
  const formatado = String(lugar?.formatted_address || lugar?.name || '').trim();
  if (formatado && extrairUf(formatado, '')) return formatado;
  const componentes = lugar?.address_components || [];
  const uf = String(componentes.find((item) => (item.types || []).includes('administrative_area_level_1'))?.short_name || '').trim();
  const cidade = String(
    componentes.find((item) => (item.types || []).includes('locality'))?.long_name
    || componentes.find((item) => (item.types || []).includes('administrative_area_level_2'))?.long_name
    || '',
  ).trim();
  if (cidade && extrairUf('', uf)) return `${cidade}, ${uf.toUpperCase()}`;
  return formatado || escrito;
}

const CHAVE_MAPA_ESTAVEL = 'AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k';

export function lerCoordenada(lugar: unknown): Coordenada | null {
  if (lugar == null) return null;
  const candidato = lugar as { lat?: unknown; lng?: unknown };
  const latBruto = candidato.lat;
  const lngBruto = candidato.lng;
  const lat = typeof latBruto === 'function' ? Number(latBruto.call(lugar)) : Number(latBruto);
  const lng = typeof lngBruto === 'function' ? Number(lngBruto.call(lugar)) : Number(lngBruto);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function lugarComGeometria(lugar: {
  formatted_address?: string | null;
  name?: string | null;
  place_id?: string | null;
  address_components?: ComponenteEndereco[] | null;
  geometry?: { location?: unknown } | null;
} | null | undefined, digitado?: string | null): { endereco: string; coordenada: Coordenada; placeId: string | null } | null {
  if (!lugar) return null;
  const endereco = enderecoComUf(lugar, digitado);
  const coordenada = lerCoordenada(lugar.geometry?.location);
  if (!endereco || !coordenada) return null;
  const placeId = String(lugar.place_id || '').trim() || null;
  return { endereco, coordenada, placeId };
}

/** Coordenada fechada vai para o Directions. Sem ela, segue o texto da cidade. */
export function destinoDirections(coordenada: Coordenada | null | undefined, texto: string): Coordenada | string {
  if (coordenada && Number.isFinite(coordenada.lat) && Number.isFinite(coordenada.lng)) {
    return { lat: coordenada.lat, lng: coordenada.lng };
  }
  return String(texto || '').trim();
}

export function lugarPreenchido(valor: Coordenada | string | null | undefined): boolean {
  if (valor == null) return false;
  if (typeof valor === 'string') return Boolean(valor.trim());
  return Number.isFinite(valor.lat) && Number.isFinite(valor.lng);
}

export function polylineCodificada(rota: { overview_polyline?: unknown } | null | undefined): string {
  const bruto = rota?.overview_polyline;
  if (typeof bruto === 'string') return bruto.trim();
  if (bruto && typeof bruto === 'object' && typeof (bruto as { points?: unknown }).points === 'string') {
    return String((bruto as { points: string }).points).trim();
  }
  return '';
}

export function statusDaFalhaDirections(erro: unknown): string {
  if (typeof erro === 'string') return erro;
  if (!erro || typeof erro !== 'object') return '';
  const item = erro as { code?: unknown; status?: unknown; message?: unknown };
  const direto = String(item.code || item.status || '').trim();
  if (direto) return direto;
  const mensagem = String(item.message || '');
  const conhecido = mensagem.match(/ZERO_RESULTS|NOT_FOUND|MAX_ROUTE_LENGTH_EXCEEDED|MAX_WAYPOINTS_EXCEEDED|OVER_QUERY_LIMIT|REQUEST_DENIED|INVALID_REQUEST|UNKNOWN_ERROR/);
  return conhecido ? conhecido[0] : '';
}

export function mensagemFalhaDirections(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'ZERO_RESULTS':
      return 'O Google não encontrou um caminho de carro entre esses pontos.';
    case 'MAX_ROUTE_LENGTH_EXCEEDED':
    case 'MAX_WAYPOINTS_EXCEEDED':
      return 'Essa rota passou do limite do Google. Divida o trecho com uma parada.';
    case 'OVER_QUERY_LIMIT':
    case 'REQUEST_DENIED':
      return 'O Google recusou o mapa agora. Tente de novo em instantes.';
    case 'NOT_FOUND':
    case 'INVALID_REQUEST':
      return 'Escolha origem e destino na lista ou confirme a cidade e a UF.';
    default:
      return 'Não foi possível traçar essa rota. Confira a cidade e a UF.';
  }
}

/**
 * A tela administrativa grava origin, destination e distance.
 * Não existe coluna duration_minutes: o tempo só trava o envio quando o cálculo devolveu zero.
 */
export function rotaAdministrativaPronta(entrada: {
  origin?: string | null;
  destination?: string | null;
  distance?: string | number | null;
  durationMinutes?: number | null;
}): { ok: true } | { ok: false; aviso: string } {
  const origem = String(entrada.origin || '').trim();
  const destino = String(entrada.destination || '').trim();
  const km = Number(String(entrada.distance ?? '').replace(',', '.'));
  if (!origem || !destino) return { ok: false, aviso: 'Informe a origem e o destino antes de salvar.' };
  if (!Number.isFinite(km) || km <= 0) {
    return { ok: false, aviso: 'A rota do Google ainda não fechou a distância. Aguarde o cálculo ou informe os km.' };
  }
  if (entrada.durationMinutes != null && (!Number.isFinite(entrada.durationMinutes) || entrada.durationMinutes <= 0)) {
    return { ok: false, aviso: 'A rota do Google ainda não fechou o tempo. Aguarde o cálculo.' };
  }
  return { ok: true };
}

/** Reduz o overview_path para a URL do mapa estático caber no limite do Google. */
export function resumirPontos(pontos: Array<Coordenada | null | undefined>, maximo = 80): Coordenada[] {
  const validos = pontos.map((ponto) => (ponto ? lerCoordenada(ponto) : null)).filter((ponto): ponto is Coordenada => ponto != null);
  const teto = Math.max(2, maximo);
  if (validos.length <= teto) return validos;
  const passo = (validos.length - 1) / (teto - 1);
  const saida: Coordenada[] = [];
  const vistos = new Set<number>();
  for (let i = 0; i < teto; i++) {
    const indice = Math.round(i * passo);
    if (vistos.has(indice)) continue;
    vistos.add(indice);
    saida.push(validos[indice]);
  }
  return saida;
}

export function chaveDoMapaNoServidor(ambiente: Record<string, string | undefined>): string {
  return String(ambiente.GOOGLE_MAPS_API_KEY || ambiente.VITE_GOOGLE_MAPS_API_KEY || CHAVE_MAPA_ESTAVEL).trim();
}

/** O mapa estático sai do servidor. O Referer precisa ser um domínio já liberado na chave. */
export function refererDoMapa(origem: string | undefined): string {
  const texto = String(origem || '').trim();
  if (/^https:\/\/sistema\.grupotmseg\.com\.br(\/|$)/.test(texto)) return 'https://sistema.grupotmseg.com.br/';
  if (/^https:\/\/sistema-grupo-tm-seg\.vercel\.app(\/|$)/.test(texto)) return 'https://sistema-grupo-tm-seg.vercel.app/';
  if (/^http:\/\/localhost(?::\d+)?(\/|$)/.test(texto)) {
    const base = texto.match(/^http:\/\/localhost(?::\d+)?/)?.[0] || 'http://localhost:5000';
    return `${base}/`;
  }
  return 'https://sistema.grupotmseg.com.br/';
}

/** Tema corporativo escuro do mapa ao vivo. O satélite continua no botão. */
export const ESTILO_MAPA_COTACAO: Array<{ featureType?: string; elementType?: string; stylers: Array<Record<string, string>> }> = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c4a6e' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Gota do pin A/B. A ponta fica na coordenada. */
export const TRACO_PIN = 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z';
