import type { ClientPriceTable } from '../types';
import { UF_TO_REGION, extractUF, extractCityFromAddress } from './financialUtils';

export const DHL_CLIENT_NAME = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';

// Task #109: registro de razões sociais DHL cobertas pelo motor automático.
// Cada entrada é uma razão social distinta. O motor isola as tabelas por
// nome exato (após normalização), garantindo que contratos de empresas DHL
// diferentes nunca se misturem. Para adicionar uma nova razão social, basta
// incluir o nome canônico aqui — o gatilho e o filtro de tabelas se ajustam
// automaticamente.
export const DHL_AUTO_CLIENT_NAMES: readonly string[] = [
  DHL_CLIENT_NAME,
  'DHL EXPRESS BRAZIL LTDA',
  'DHL GLOBAL FORWARDING (BRAZIL) LTDA',
  'DHL LOGISTICS (BRASIL) LTDA',
];

const normalize = (s?: string | null): string => {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
};

const NORMALIZED_DHL_CLIENTS: ReadonlyMap<string, string> = new Map(
  DHL_AUTO_CLIENT_NAMES.map(name => [normalize(name), name]),
);

export const findDhlAutoClient = (clientName?: string | null): string | null => {
  const n = normalize(clientName);
  if (!n) return null;
  return NORMALIZED_DHL_CLIENTS.get(n) ?? null;
};

export const isDhlAutoClient = (clientName?: string | null): boolean => {
  return findDhlAutoClient(clientName) !== null;
};

export const isDhlSupplyClient = (clientName?: string | null): boolean => {
  const n = normalize(clientName);
  if (!n) return false;
  return n === normalize(DHL_CLIENT_NAME);
};

const sameDhlClient = (a?: string | null, b?: string | null): boolean => {
  const na = normalize(a);
  const nb = normalize(b);
  return !!na && na === nb;
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

export interface DhlNameValidation {
  valid: boolean;
  hasRegionPrefix: boolean;
  hasValidRegion: boolean;
  hasKmSuffix: boolean;
  reason: string;
}

export const validateDhlTableName = (op?: string | null): DhlNameValidation => {
  const raw = (op || '').trim();
  if (!raw) {
    return {
      valid: false,
      hasRegionPrefix: false,
      hasValidRegion: false,
      hasKmSuffix: false,
      reason: 'Nome da tabela vazio.',
    };
  }
  const regionMatch = raw.match(/^REGI[ÃA]O\s*-\s*([A-ZÀ-Ú\- ]+?)\s*-\s*(.+)$/i);
  const hasRegionPrefix = !!regionMatch;
  const hasValidRegion = hasRegionPrefix && VALID_REGIONS.has(normalize(regionMatch![1]));
  const rest = regionMatch ? regionMatch[2] : raw;
  const hasKmSuffix = /\s+\d{2,5}\s*KM\s*$/i.test(rest);

  if (hasRegionPrefix && hasValidRegion && hasKmSuffix) {
    return { valid: true, hasRegionPrefix, hasValidRegion, hasKmSuffix, reason: '' };
  }

  const problems: string[] = [];
  if (!hasRegionPrefix) {
    problems.push('falta o prefixo "REGIÃO - {REGIÃO} -"');
  } else if (!hasValidRegion) {
    problems.push(`região "${regionMatch![1].trim()}" não é válida (use SUDESTE, SUL, CENTRO-OESTE, NORDESTE, NORTE ou BRASIL)`);
  }
  if (!hasKmSuffix) {
    problems.push('falta a faixa de KM no final (ex.: "... 300KM")');
  }
  return {
    valid: false,
    hasRegionPrefix,
    hasValidRegion,
    hasKmSuffix,
    reason: problems.join('; '),
  };
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
  clientName: string;
}

export interface DhlSelectionOptions {
  /**
   * Razão social DHL alvo. Quando informada, o motor isola as tabelas
   * exclusivamente para esse cliente, evitando misturar contratos entre
   * empresas diferentes do grupo DHL. Quando omitida (compatibilidade
   * retro), assume DHL SUPPLY CHAIN (BRAZIL) LTDA.
   */
  clientName?: string | null;
}

export const selectDhlClientTable = (
  tables: ClientPriceTable[],
  mission: { origin?: string | null; destination?: string | null },
  googleKm: number,
  options?: DhlSelectionOptions,
): DhlSelectionResult => {
  const targetClient = findDhlAutoClient(options?.clientName) || DHL_CLIENT_NAME;
  const originUF = extractUF(mission.origin || '');
  const detectedRegion = UF_TO_REGION[originUF] || '';
  const band = computeDhlBand(googleKm);
  const originCity = normalize(extractCityFromAddress(mission.origin || ''));
  const destCity = normalize(extractCityFromAddress(mission.destination || ''));

  // Task #109: isola tabelas pelo nome exato (normalizado) do cliente alvo.
  // Garante que tabelas de outras empresas DHL não vazem para este motor.
  const dhlTables = (tables || []).filter(t => sameDhlClient(t.client, targetClient));

  if (!detectedRegion) {
    return {
      table: null,
      matchLevel: 'none',
      detectedRegion: '',
      band,
      reason: `Origem sem UF identificada (faixa ${band}km) — selecione manualmente`,
      clientName: targetClient,
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
        clientName: targetClient,
      };
    }
  }

  const regionCandidates = dhlTables.filter(t => {
    if ((t.franchise_km || 0) !== band) return false;
    const region = regionFromDhlOperationType(t.operation_type);
    if (!region) return false;
    return region === detectedRegion;
  });

  if (regionCandidates.length === 0) {
    return {
      table: null,
      matchLevel: 'none',
      detectedRegion,
      band,
      reason: `Sem tabela DHL para ${detectedRegion} + ${band}km — selecione manualmente`,
      clientName: targetClient,
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
    clientName: targetClient,
  };
};
