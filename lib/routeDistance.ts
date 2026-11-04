export type RouteDistanceResult = {
  success: boolean;
  distanceKm?: number;
  durationMin?: number | null;
  source?: string;
  error?: string;
};

const PUBLIC_GOOGLE_MAPS_KEY = 'AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k';

/** Detecta "lat,lng" (ex.: -23.55,-46.63) — não anexar ", Brasil". */
export function looksLikeLatLngPair(value: string): boolean {
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(value || '').trim());
}

export function googleMapsKeys(): string[] {
  return Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY,
  ].map((key) => String(key || '').trim()).filter(Boolean)));
}

function normalizeRouteAddress(address: string): string {
  const trimmed = String(address || '').trim();
  if (!trimmed) return '';
  if (looksLikeLatLngPair(trimmed)) return trimmed.replace(/\s+/g, '');
  return /,\s*brasil\s*$/i.test(trimmed) ? trimmed : `${trimmed}, Brasil`;
}

export { normalizeRouteAddress };

async function tryDistanceMatrix(origin: string, destination: string, key: string): Promise<RouteDistanceResult | null> {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&units=metric&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  const data: any = await resp.json();
  const el = data?.rows?.[0]?.elements?.[0];
  if (data?.status === 'OK' && el?.status === 'OK' && el.distance?.value) {
    return {
      success: true,
      distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
      durationMin: el.duration?.value ? Math.round(el.duration.value / 60) : null,
      source: 'distance_matrix',
    };
  }
  return null;
}

type CorpoDirecao = {
  status?: string;
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>;
  }>;
};

async function corpoDaDirecao(origin: string, destination: string, key: string): Promise<CorpoDirecao | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  const data = await resp.json() as CorpoDirecao;
  if (data?.status !== 'OK' || !Array.isArray(data.routes) || !data.routes.length) return null;
  return data;
}

function totaisDaRota(data: CorpoDirecao): { metros: number; segundos: number } | null {
  const legs = data.routes?.[0]?.legs || [];
  const metros = legs.reduce((acc, leg) => acc + (leg?.distance?.value || 0), 0);
  const segundos = legs.reduce((acc, leg) => acc + (leg?.duration?.value || 0), 0);
  if (metros <= 0) return null;
  return { metros, segundos };
}

/** Lê a polyline do Google. Não chama a rede. */
export function pontosDaPolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const texto = String(encoded || '');
  const pontos: Array<{ lat: number; lng: number }> = [];
  let indice = 0;
  let lat = 0;
  let lng = 0;
  while (indice < texto.length && pontos.length < 800) {
    let resultado = 0;
    let deslocamento = 0;
    let byte = 0;
    do {
      if (indice >= texto.length) return pontos;
      byte = texto.charCodeAt(indice) - 63;
      indice += 1;
      resultado |= (byte & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (byte >= 0x20);
    lat += (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1);
    resultado = 0;
    deslocamento = 0;
    do {
      if (indice >= texto.length) return pontos;
      byte = texto.charCodeAt(indice) - 63;
      indice += 1;
      resultado |= (byte & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (byte >= 0x20);
    lng += (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1);
    pontos.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pontos;
}

async function tryDirectionsApi(origin: string, destination: string, key: string): Promise<RouteDistanceResult | null> {
  const data = await corpoDaDirecao(origin, destination, key);
  if (!data) return null;
  const totais = totaisDaRota(data);
  if (!totais) return null;
  return {
    success: true,
    distanceKm: Math.round((totais.metros / 1000) * 100) / 100,
    durationMin: totais.segundos > 0 ? Math.round(totais.segundos / 60) : null,
    source: 'directions',
  };
}

export type RotaRodoviariaServidor = {
  success: boolean;
  metros?: number;
  segundos?: number;
  pontos?: Array<{ lat: number; lng: number }>;
  error?: string;
};

/** Rota de carro com distância, duração e o traçado. A linha reta não entra no lugar. */
export async function computeDrivingRoute(originRaw: string, destinationRaw: string, comPontos = true): Promise<RotaRodoviariaServidor> {
  const origin = normalizeRouteAddress(originRaw);
  const destination = normalizeRouteAddress(destinationRaw);
  if (!origin || !destination) return { success: false, error: 'origin e destination são obrigatórios' };
  let lastError = 'NO_RESULT';
  for (const key of googleMapsKeys()) {
    try {
      const data = await corpoDaDirecao(origin, destination, key);
      const totais = data ? totaisDaRota(data) : null;
      if (data && totais) {
        const pontos = comPontos ? pontosDaPolyline(String(data.routes?.[0]?.overview_polyline?.points || '')) : [];
        if (comPontos && pontos.length < 2) return { success: false, error: 'ROTA_SEM_TRACADO' };
        return { success: true, metros: totais.metros, segundos: totais.segundos, pontos };
      }
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }
  return { success: false, error: lastError };
}

/** Calcula KM rodoviário origem→destino. Prefere Directions (Distance Matrix legado costuma estar desligado). */
export async function computeRouteDistanceKm(originRaw: string, destinationRaw: string): Promise<RouteDistanceResult> {
  const origin = normalizeRouteAddress(originRaw);
  const destination = normalizeRouteAddress(destinationRaw);
  if (!origin || !destination) {
    return { success: false, error: 'origin e destination são obrigatórios' };
  }

  let lastError = 'NO_RESULT';
  for (const key of googleMapsKeys()) {
    // Directions primeiro: Distance Matrix legado retorna LegacyApiNotActivatedMapError no projeto atual.
    try {
      const directions = await tryDirectionsApi(origin, destination, key);
      if (directions?.success) return directions;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
    try {
      const matrix = await tryDistanceMatrix(origin, destination, key);
      if (matrix?.success) return matrix;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  return { success: false, error: lastError };
}

/** Progresso da missão: total = origem→destino, restante = atual→destino. */
export function progressFromRouteLegs(totalKm: number, remainingKm: number): {
  progressPct: number;
  traveledKm: number;
  totalKm: number;
  remainingKm: number;
} {
  const total = Math.max(0, Number(totalKm) || 0);
  const remaining = Math.max(0, Number(remainingKm) || 0);
  const traveled = total > 0 ? Math.min(total, Math.max(0, Math.round((total - remaining) * 10) / 10)) : 0;
  const progressPct = total > 0 ? Math.min(100, Math.max(0, Math.round((traveled / total) * 100))) : 0;
  return {
    progressPct,
    traveledKm: traveled,
    totalKm: Math.round(total * 10) / 10,
    remainingKm: Math.round(Math.min(remaining, total || remaining) * 10) / 10,
  };
}

/** Calcula progresso A→atual→B via Directions API (origem, posição atual, destino). */
export async function computeRouteProgressKm(params: {
  origin: string;
  destination: string;
  current: string;
}): Promise<{
  success: boolean;
  progressPct: number;
  traveledKm: number;
  totalKm: number;
  remainingKm: number;
  etaMinutes: number | null;
  source?: string;
  error?: string;
}> {
  const origin = String(params.origin || '').trim();
  const destination = String(params.destination || '').trim();
  const current = String(params.current || '').trim();
  if (!origin || !destination || !current) {
    return {
      success: false,
      progressPct: 0,
      traveledKm: 0,
      totalKm: 0,
      remainingKm: 0,
      etaMinutes: null,
      error: 'origin, destination e current são obrigatórios',
    };
  }

  const [totalRes, remainRes] = await Promise.all([
    computeRouteDistanceKm(origin, destination),
    computeRouteDistanceKm(current, destination),
  ]);

  if (!totalRes.success || !(totalRes.distanceKm! > 0)) {
    return {
      success: false,
      progressPct: 0,
      traveledKm: 0,
      totalKm: 0,
      remainingKm: 0,
      etaMinutes: null,
      error: totalRes.error || 'ROTA_TOTAL_INDISPONIVEL',
    };
  }

  const remainingKm = remainRes.success && remainRes.distanceKm != null
    ? remainRes.distanceKm
    : totalRes.distanceKm!;
  const legs = progressFromRouteLegs(totalRes.distanceKm!, remainingKm);

  return {
    success: true,
    ...legs,
    etaMinutes: remainRes.durationMin ?? null,
    source: remainRes.source || totalRes.source || 'directions',
  };
}
