import { CANONICAL_PUBLIC_ORIGIN } from '../publicAppUrl';

export const LIVE_TRACK_PING_MIN_MS = 2000;
export const LIVE_TRACK_WATCH_MS = 2000;
export const LIVE_TRACK_STALE_MS = 12000;
export const LIVE_TRACK_TRAIL_MIN_METERS = 25;
export const LIVE_TRACK_TRAIL_MIN_MS = 8000;
export const LIVE_TRACK_PUBLIC_PATH = '/rastreio';

export type LiveTrackStatus = 'pending' | 'consented' | 'sharing' | 'paused' | 'ended';

export function validateCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shouldInsertTrailPoint(opts: {
  lastTrail: { lat: number; lng: number; at: number } | null;
  next: { lat: number; lng: number };
  now: number;
}): boolean {
  if (!opts.lastTrail) return true;
  const dt = opts.now - opts.lastTrail.at;
  const dist = haversineMeters(opts.lastTrail, opts.next);
  return dist >= LIVE_TRACK_TRAIL_MIN_METERS || dt >= LIVE_TRACK_TRAIL_MIN_MS;
}

export function isLiveTrackStale(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return true;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t > LIVE_TRACK_STALE_MS;
}

export function buildLiveTrackPublicPath(token: string): string {
  return `${LIVE_TRACK_PUBLIC_PATH}?token=${encodeURIComponent(token)}`;
}

export function buildLiveTrackPublicUrl(token: string, origin = CANONICAL_PUBLIC_ORIGIN): string {
  return `${String(origin || CANONICAL_PUBLIC_ORIGIN).replace(/\/$/, '')}${buildLiveTrackPublicPath(token)}`;
}

export function buildLiveTrackWhatsappText(opts: { osNumber: string; url: string }): string {
  const os = String(opts.osNumber || '').trim() || '—';
  return [
    '*TM SEG — Acompanhamento em tempo real*',
    '',
    'A Central TM SEG está realizando o acompanhamento da sua missão.',
    `OS: ${os}`,
    '',
    'Abra o link e clique para compartilhar sua localização em tempo real até o fim da missão.',
    'Depois toque em *Ocultar* para usar o WhatsApp. O GPS segue em segundo plano enquanto esta página existir. Só para se você fechar a aba ou encerrar o Chrome/Safari.',
    '',
    opts.url,
  ].join('\n');
}

export function clampAccuracy(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 5000);
}

export function clampOptionalNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}
