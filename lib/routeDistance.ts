export type RouteDistanceResult = {
  success: boolean;
  distanceKm?: number;
  durationMin?: number | null;
  source?: string;
  error?: string;
};

const PUBLIC_GOOGLE_MAPS_KEY = 'AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k';

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

async function tryDirectionsApi(origin: string, destination: string, key: string): Promise<RouteDistanceResult | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  const data: any = await resp.json();
  if (data?.status !== 'OK' || !Array.isArray(data.routes) || !data.routes.length) {
    return null;
  }
  const legs = data.routes[0]?.legs || [];
  const totalMeters = legs.reduce((acc: number, leg: any) => acc + (leg?.distance?.value || 0), 0);
  const totalSeconds = legs.reduce((acc: number, leg: any) => acc + (leg?.duration?.value || 0), 0);
  if (totalMeters <= 0) return null;
  return {
    success: true,
    distanceKm: Math.round((totalMeters / 1000) * 100) / 100,
    durationMin: totalSeconds > 0 ? Math.round(totalSeconds / 60) : null,
    source: 'directions',
  };
}

/** Calcula KM rodoviário origem→destino. Tenta Distance Matrix legado e, se falhar, Directions API REST. */
export async function computeRouteDistanceKm(originRaw: string, destinationRaw: string): Promise<RouteDistanceResult> {
  const origin = normalizeRouteAddress(originRaw);
  const destination = normalizeRouteAddress(destinationRaw);
  if (!origin || !destination) {
    return { success: false, error: 'origin e destination são obrigatórios' };
  }

  let lastError = 'NO_RESULT';
  for (const key of googleMapsKeys()) {
    try {
      const matrix = await tryDistanceMatrix(origin, destination, key);
      if (matrix?.success) return matrix;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
    try {
      const directions = await tryDirectionsApi(origin, destination, key);
      if (directions?.success) return directions;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  return { success: false, error: lastError };
}
