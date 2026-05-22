import type { ClientPriceTable } from '../types';
import { UF_TO_REGION, extractUF, extractCityFromAddress } from './financialUtils';

export const DHL_CLIENT_NAME = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';

const normalize = (s?: string | null): string => {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
};

export const isDhlSupplyClient = (clientName?: string | null): boolean => {
  const n = normalize(clientName);
  if (!n) return false;
  return n.includes('DHL SUPPLY CHAIN') && n.includes('BRAZIL');
};

export const computeDhlBand = (km: number): number => {
  const k = Math.max(0, Number(km) || 0);
  if (k <= 150) return 100;
  return Math.ceil((k - 50) / 100) * 100;
};

const VALID_REGIONS = new Set(['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE', 'BRASIL']);

export interface DhlOpParts {
  region: string | null;
  desc: string;
  km: number | null;
}

export const stripDhlOpDescription = (op?: string | null): DhlOpParts => {
  if (!op) return { region: null, desc: '', km: null };
  const raw = op.trim();
  let region: string | null = null;
  let rest = raw;

  const m = raw.match(/^REGI[ÃA]O\s*-\s*([A-ZÀ-Ú\- ]+?)\s*-\s*(.+)$/i);
  if (m) {
    const candidate = normalize(m[1]);
    if (VALID_REGIONS.has(candidate)) {
      region = candidate;
      rest = m[2];
    }
  }

  let km: number | null = null;
  const kmMatch = rest.match(/\s+(\d{2,5})\s*KM\s*$/i);
  if (kmMatch) {
    km = parseInt(kmMatch[1], 10);
    rest = rest.slice(0, kmMatch.index).trim();
  }

  return { region, desc: normalize(rest), km };
};

export const regionFromDhlOperationType = (op?: string | null): string | null => {
  return stripDhlOpDescription(op).region;
};

const extractEmbeddedKms = (desc: string): number[] => {
  const matches = desc.matchAll(/(\d{2,5})(?!\d)/g);
  const out: number[] = [];
  for (const m of matches) out.push(parseInt(m[1], 10));
  return out;
};

export type DhlMatchLevel = 'exact_route' | 'region_band' | 'none';

export interface DhlSelectionResult {
  table: ClientPriceTable | null;
  matchLevel: DhlMatchLevel;
  detectedRegion: string;
  band: number;
  reason: string;
}

export const selectDhlClientTable = (
  tables: ClientPriceTable[],
  mission: { origin?: string | null; destination?: string | null },
  googleKm: number,
): DhlSelectionResult => {
  const originUF = extractUF(mission.origin || '');
  const detectedRegion = UF_TO_REGION[originUF] || '';
  const band = computeDhlBand(googleKm);
  const originCity = normalize(extractCityFromAddress(mission.origin || ''));
  const destCity = normalize(extractCityFromAddress(mission.destination || ''));

  const dhlTables = (tables || []).filter(t => isDhlSupplyClient(t.client));

  if (!detectedRegion) {
    return {
      table: null,
      matchLevel: 'none',
      detectedRegion: '',
      band,
      reason: `Origem sem UF identificada (faixa ${band}km) — selecione manualmente`,
    };
  }

  if (originCity && destCity) {
    const routeKey = `${originCity}-${destCity}`;
    const exact = dhlTables.find(t => {
      if ((t.franchise_km || 0) !== band) return false;
      const parts = stripDhlOpDescription(t.operation_type);
      const desc = parts.desc;
      if (!desc) return false;
      const hyphenMatch = desc.match(/^([A-Z0-9\s]+?)\s*-\s*([A-Z0-9\s]+?)(?:\s|$)/);
      if (!hyphenMatch) return false;
      const tOrigin = hyphenMatch[1].trim();
      const tDest = hyphenMatch[2].trim();
      const tRoute = `${tOrigin}-${tDest}`;
      return tRoute === routeKey;
    });
    if (exact) {
      return {
        table: exact,
        matchLevel: 'exact_route',
        detectedRegion,
        band,
        reason: `Rota Exata (${detectedRegion} + ${band}km)`,
      };
    }
  }

  const regionCandidates = dhlTables.filter(t => {
    if ((t.franchise_km || 0) !== band) return false;
    const region = regionFromDhlOperationType(t.operation_type);
    if (!region) return false;
    if (region === 'BRASIL') return true;
    return region === detectedRegion;
  });

  if (regionCandidates.length === 0) {
    return {
      table: null,
      matchLevel: 'none',
      detectedRegion,
      band,
      reason: `Sem tabela DHL para ${detectedRegion} + ${band}km — selecione manualmente`,
    };
  }

  const k = Math.max(0, Number(googleKm) || 0);
  const scored = regionCandidates.map(t => {
    const desc = stripDhlOpDescription(t.operation_type).desc;
    const embedded = extractEmbeddedKms(desc);
    const diff = embedded.length > 0
      ? Math.min(...embedded.map(n => Math.abs(n - k)))
      : Number.POSITIVE_INFINITY;
    return { t, diff, op: t.operation_type || '' };
  });
  scored.sort((a, b) => {
    if (a.diff !== b.diff) return a.diff - b.diff;
    return a.op.localeCompare(b.op);
  });
  const chosen = scored[0].t;

  return {
    table: chosen,
    matchLevel: 'region_band',
    detectedRegion,
    band,
    reason: `Sugestão por Proximidade (${detectedRegion} + ${band}km)`,
  };
};
