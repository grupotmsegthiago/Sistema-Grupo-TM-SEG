import { authFetch } from './authFetch';
import { extractCoordinates } from './utils';

const DEST_UNDEFINED_RE = /DESTINO\s+A\s+DEFINIR/i;

/** Normaliza destino para cálculo de rota (VTC/CEVA e sufixo "a definir"). */
export function normalizeProgressDestination(
  destination: string,
  options?: { applyVtc02h?: boolean; applyCeva200km?: boolean; client?: string },
): string {
  let dest = (destination || '')
    .trim()
    .replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '')
    .trim();
  const clientUpper = (options?.client || '').toUpperCase();
  if (options?.applyVtc02h && clientUpper.includes('VTC')) {
    dest = '02 HORAS DE ACOMPANHAMENTO';
  } else if (options?.applyCeva200km) {
    dest = '200KM DE ACOMPANHAMENTO';
  }
  if (!dest || DEST_UNDEFINED_RE.test(dest)) return '';
  return dest;
}

/** Progresso A→atual→B via Google Distance Matrix (origem + destino + posição atual). */
export async function resolveRouteProgressPct(params: {
  origin: string;
  destination: string;
  mapLink?: string;
  applyVtc02h?: boolean;
  applyCeva200km?: boolean;
  client?: string;
}): Promise<{ progressPct: number; traveledKm: number; totalKm: number } | null> {
  const origin = (params.origin || '').trim();
  const destination = normalizeProgressDestination(params.destination, params);
  if (!origin || !destination) return null;

  const coords = extractCoordinates(params.mapLink || '');
  if (!coords) return null;

  try {
    const result = await fetchRouteProgress({
      origin,
      destination,
      current: `${coords.lat},${coords.lng}`,
    });
    if (!result.success) return null;
    return {
      progressPct: result.progressPct,
      traveledKm: result.traveledKm,
      totalKm: result.totalKm,
    };
  } catch {
    return null;
  }
}

export interface RouteProgressResult {
  success: boolean;
  progressPct: number;
  traveledKm: number;
  totalKm: number;
  remainingKm: number;
  etaMinutes: number | null;
  etaLabel: string;
  source: 'google' | 'fallback';
  error?: string;
}

const cache = new Map<string, { ts: number; data: RouteProgressResult }>();
const CACHE_MS = 90_000;

export function formatRouteEta(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '—';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

export async function fetchRouteProgress(params: {
  origin: string;
  destination: string;
  current: string;
}): Promise<RouteProgressResult> {
  const key = `${params.origin}|${params.destination}|${params.current}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;

  const qs = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    current: params.current,
  });
  const resp = await authFetch(`/api/route-progress?${qs.toString()}`);
  const data = (await resp.json()) as RouteProgressResult;
  if (data.success) cache.set(key, { ts: Date.now(), data });
  return data;
}
