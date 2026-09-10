/**
 * Pontos da rota da OS: origem, atualizações, paradas e destino.
 * Só leitura — não grava missão nem recalcula faturamento.
 */
import { calculateDistance, extractCoordinates } from '../utils';

export type RouteKind = 'origem' | 'atualizacao' | 'parada' | 'destino';

export type RoutePoint = {
  kind: RouteKind;
  label: string;
  mapLabel: string;
  lat: number;
  lng: number;
  at: string | null;
  description: string;
  mapLink: string | null;
  stretchKm: number | null;
};

const STOP_RE =
  /\bPARADA\b|\bSTOP\b|\bESPERA\b|\bPAUSA\b|\bPOSTO\b|\bALMOCO\b|\bALMOÇO\b|\bAGUARDANDO\b|\bINTERROMP/;

export function isStopUpdate(text: string | null | undefined): boolean {
  const n = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (!n.trim()) return false;
  if (/\bCHEGADA NO DESTINO\b|\bCHEGOU NO DESTINO\b|\bPONTO B\b/.test(n)) return false;
  return STOP_RE.test(n);
}

export function roundKm(n: number): number {
  return Math.round((Number(n) || 0) * 10) / 10;
}

export function uniqueCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function montarPontosRota(args: {
  origin?: string | null;
  destination?: string | null;
  originCoord?: { lat: number; lng: number } | null;
  destCoord?: { lat: number; lng: number } | null;
  logs: Array<{
    description?: string | null;
    map_link?: string | null;
    created_at?: string | null;
  }>;
  historyMapLinks?: Array<{ new_value?: string | null; changed_at?: string | null }>;
  currentMapLink?: string | null;
}): RoutePoint[] {
  const points: RoutePoint[] = [];
  const seen = new Set<string>();

  const push = (p: Omit<RoutePoint, 'stretchKm' | 'mapLabel'> & { mapLabel?: string }) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const key = uniqueCoordKey(p.lat, p.lng);
    if (seen.has(key) && p.kind !== 'origem' && p.kind !== 'destino') return;
    seen.add(key);
    points.push({
      ...p,
      mapLabel: p.mapLabel || '•',
      stretchKm: null,
    });
  };

  if (args.originCoord) {
    push({
      kind: 'origem',
      label: 'Ponto A — Origem',
      mapLabel: 'A',
      lat: args.originCoord.lat,
      lng: args.originCoord.lng,
      at: null,
      description: String(args.origin || '').trim() || 'Origem',
      mapLink: null,
    });
  }

  const logItems = [...(args.logs || [])].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')),
  );
  let seq = 1;
  for (const log of logItems) {
    const coords = extractCoordinates(String(log.map_link || ''));
    if (!coords) continue;
    const desc = String(log.description || '').trim();
    const stop = isStopUpdate(desc);
    push({
      kind: stop ? 'parada' : 'atualizacao',
      label: stop ? `Parada ${seq}` : `Atualização ${seq}`,
      mapLabel: stop ? 'P' : String(Math.min(seq, 9)),
      lat: coords.lat,
      lng: coords.lng,
      at: log.created_at || null,
      description: desc || 'Posição da viatura',
      mapLink: log.map_link || null,
    });
    seq += 1;
  }

  for (const h of args.historyMapLinks || []) {
    const coords = extractCoordinates(String(h.new_value || ''));
    if (!coords) continue;
    push({
      kind: 'atualizacao',
      label: `GPS ${seq}`,
      mapLabel: String(Math.min(seq, 9)),
      lat: coords.lat,
      lng: coords.lng,
      at: h.changed_at || null,
      description: 'Posição gravada no histórico da OS',
      mapLink: h.new_value || null,
    });
    seq += 1;
  }

  if (args.currentMapLink) {
    const coords = extractCoordinates(args.currentMapLink);
    if (coords) {
      push({
        kind: 'atualizacao',
        label: 'Última posição',
        mapLabel: 'U',
        lat: coords.lat,
        lng: coords.lng,
        at: null,
        description: 'Última posição da viatura na OS',
        mapLink: args.currentMapLink,
      });
    }
  }

  if (args.destCoord) {
    push({
      kind: 'destino',
      label: 'Ponto B — Destino',
      mapLabel: 'B',
      lat: args.destCoord.lat,
      lng: args.destCoord.lng,
      at: null,
      description: String(args.destination || '').trim() || 'Destino',
      mapLink: null,
    });
  }

  for (let i = 1; i < points.length; i += 1) {
    points[i].stretchKm = roundKm(calculateDistance(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    ));
  }
  return points;
}

export function distanciaTotalPontos(points: RoutePoint[]): number {
  return roundKm(points.reduce((s, p) => s + (Number(p.stretchKm) || 0), 0));
}

export function buildStaticMapUrl(points: RoutePoint[], apiKey: string): string | null {
  if (!apiKey || points.length === 0) return null;
  const limited = points.slice(0, 18);
  const markers = limited.map((p) => {
    const color = p.kind === 'origem'
      ? '0x16a34a'
      : p.kind === 'destino'
        ? '0xdc2626'
        : p.kind === 'parada'
          ? '0xf59e0b'
          : '0x2563eb';
    const label = encodeURIComponent((p.mapLabel || '•').slice(0, 1));
    return `markers=color:${color}|label:${label}|${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  });
  const pathPts = limited.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
  const path = limited.length >= 2 ? `&path=color:0x991b1bff|weight:4|${pathPts}` : '';
  return `https://maps.googleapis.com/maps/api/staticmap?size=900x420&scale=2&maptype=roadmap&language=pt-BR&region=BR&${markers.join('&')}${path}&key=${encodeURIComponent(apiKey)}`;
}
