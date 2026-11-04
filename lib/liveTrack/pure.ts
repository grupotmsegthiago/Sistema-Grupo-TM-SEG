import { CANONICAL_PUBLIC_ORIGIN } from '../publicAppUrl';

export const LIVE_TRACK_PING_MIN_MS = 2000;
export const LIVE_TRACK_WATCH_MS = 2000;
export const LIVE_TRACK_STALE_MS = 12000;
/** Aba oculta envia a cada 60s. Abaixo disso o cliente marcaria o agente como ausente mesmo com a página aberta. */
export const LIVE_TRACK_SINAL_FRESCO_MS = 150000;

export function agenteEstaLogado(opts: {
  status?: string | null;
  ended?: boolean;
  vistoEm?: string | number | null;
  now?: number;
}): boolean {
  if (opts.ended) return false;
  if (opts.status !== 'sharing') return false;
  const t = typeof opts.vistoEm === 'number' ? opts.vistoEm : opts.vistoEm ? new Date(opts.vistoEm).getTime() : 0;
  if (!Number.isFinite(t) || t <= 0) return false;
  return (opts.now ?? Date.now()) - t < LIVE_TRACK_SINAL_FRESCO_MS;
}
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

/** Etapas da timeline: origem do GPS, paradas relevantes e a última posição. */
export function etapasDaTrilha(
  trail: Array<{ lat: number; lng: number; recorded_at?: string; at?: string }>,
): Array<{ lat: number; lng: number; at: string }> {
  const pts = trail
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), at: String(p.recorded_at || p.at || '') }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.at);
  if (!pts.length) return [];
  const kept: Array<{ lat: number; lng: number; at: string }> = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = kept[kept.length - 1];
    const cur = pts[i];
    const ultimo = i === pts.length - 1;
    const dt = new Date(cur.at).getTime() - new Date(prev.at).getTime();
    const dist = haversineMeters(prev, cur);
    if (ultimo || dist >= 2000 || dt >= 10 * 60 * 1000) {
      if (cur.at !== prev.at || dist >= 30) kept.push(cur);
    }
  }
  const max = 12;
  if (kept.length <= max) return kept;
  const meio = kept.slice(1, -1);
  const passo = Math.ceil(meio.length / (max - 2));
  const amostra = meio.filter((_, i) => i % passo === 0).slice(0, max - 2);
  return [kept[0], ...amostra, kept[kept.length - 1]];
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

/** Link só de leitura. A credencial não é o token com que o agente transmite. */
export function buildLiveTrackClientUrl(credential: string, origin = CANONICAL_PUBLIC_ORIGIN): string {
  const base = String(origin || CANONICAL_PUBLIC_ORIGIN).replace(/\/$/, '');
  return `${base}${LIVE_TRACK_PUBLIC_PATH}?c=${encodeURIComponent(credential)}`;
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
