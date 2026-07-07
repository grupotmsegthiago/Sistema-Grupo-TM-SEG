import { authFetch } from './authFetch';

export type ResolvedRouteDistance = {
  distKm: number;
  durationMin: number;
  source?: string;
};

/** Calcula KM rodoviário — servidor primeiro (Directions API), depois Google no browser. */
export async function resolveRouteDistanceClient(
  origin: string,
  destination: string,
  browserGoogle?: (origin: string, destination: string) => Promise<{ distKm: number; durationMin: number } | null>,
): Promise<ResolvedRouteDistance | null> {
  const originT = String(origin || '').trim();
  const destT = String(destination || '').trim();
  if (!originT || !destT) return null;

  try {
    const qs = new URLSearchParams({ origin: originT, destination: destT });
    const resp = await authFetch(`/api/distance-matrix?${qs}`);
    const data = await resp.json().catch(() => ({}));
    if (data?.success && Number(data.distanceKm) > 0) {
      return {
        distKm: Math.round(Number(data.distanceKm)),
        durationMin: Number(data.durationMin) || 0,
        source: data.source || 'server',
      };
    }
  } catch (e) {
    console.error('Falha ao consultar distância no servidor:', e);
  }

  if (browserGoogle) {
    try {
      const clientResult = await browserGoogle(originT, destT);
      if (clientResult && clientResult.distKm > 0) {
        return { ...clientResult, source: 'google-client' };
      }
    } catch (e) {
      console.error('Falha Google Maps no browser:', e);
    }
  }

  return null;
}

export function pickRouteEndpoints(
  route: { origin?: string; destination?: string },
  formOrigin?: string,
  formDestination?: string,
): { origin: string; destination: string } {
  const routeOrigin = String(route.origin || '').trim();
  const routeDest = String(route.destination || '').trim();
  const formO = String(formOrigin || '').trim();
  const formD = String(formDestination || '').trim();
  return {
    origin: routeOrigin.length >= formO.length ? routeOrigin || formO : formO || routeOrigin,
    destination: routeDest.length >= formD.length ? routeDest || formD : formD || routeDest,
  };
}
