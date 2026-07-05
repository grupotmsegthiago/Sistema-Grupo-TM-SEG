import { authFetch } from './authFetch';

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
