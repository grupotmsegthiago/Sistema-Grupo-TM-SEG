// Cobertura de atuação do fornecedor: UFs (sede + filiais) e valor 100 km por UF.
// Usado no cadastro e no ranking do mapa de acionamento.

import { UF_TO_REGION } from './financialUtils';

const REGION_ORDER = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'] as const;
type CoverageRegion = (typeof REGION_ORDER)[number];

const UF_NAME: Record<string, string> = {
  SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', ES: 'Espírito Santo',
  DF: 'Distrito Federal', GO: 'Goiás', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  PR: 'Paraná', SC: 'Santa Catarina', RS: 'Rio Grande do Sul',
  BA: 'Bahia', PE: 'Pernambuco', CE: 'Ceará', RN: 'Rio Grande do Norte',
  PB: 'Paraíba', AL: 'Alagoas', SE: 'Sergipe', PI: 'Piauí', MA: 'Maranhão',
  AM: 'Amazonas', PA: 'Pará', AC: 'Acre', RO: 'Rondônia', RR: 'Roraima', AP: 'Amapá', TO: 'Tocantins',
};

export interface ProviderOperatingCoverageRow {
  uf: string;
  city?: string;
  cost100km?: number;
  isHq?: boolean;
}

export interface CoverageUfOption {
  uf: string;
  name: string;
  region: CoverageRegion;
}

export const COVERAGE_UFS: CoverageUfOption[] = Object.keys(UF_TO_REGION)
  .map((uf) => ({
    uf,
    name: UF_NAME[uf] || uf,
    region: (UF_TO_REGION[uf] || 'SUDESTE') as CoverageRegion,
  }));

export const COVERAGE_UFS_BY_REGION: { region: CoverageRegion; ufs: CoverageUfOption[] }[] = REGION_ORDER.map((region) => ({
  region,
  ufs: COVERAGE_UFS.filter((item) => item.region === region),
}));

export function parseOperatingCoverage(raw: unknown): ProviderOperatingCoverageRow[] {
  if (raw == null || raw === '') return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const rows: ProviderOperatingCoverageRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const uf = String((item as ProviderOperatingCoverageRow).uf || '').toUpperCase().trim();
    if (!UF_TO_REGION[uf] || seen.has(uf)) continue;
    seen.add(uf);
    const cost = Number((item as ProviderOperatingCoverageRow).cost100km);
    rows.push({
      uf,
      city: String((item as ProviderOperatingCoverageRow).city || '').trim(),
      cost100km: Number.isFinite(cost) && cost > 0 ? cost : 0,
      isHq: Boolean((item as ProviderOperatingCoverageRow).isHq),
    });
  }
  return rows;
}

export function serializeOperatingCoverage(
  rows: ProviderOperatingCoverageRow[],
  hqUf?: string,
  hqCity?: string,
): ProviderOperatingCoverageRow[] {
  const hq = (hqUf || '').toUpperCase().trim();
  const selected = parseOperatingCoverage(rows).map((row) => ({
    ...row,
    isHq: hq ? row.uf === hq : Boolean(row.isHq),
  }));
  if (hq && UF_TO_REGION[hq] && !selected.some((row) => row.uf === hq)) {
    selected.unshift({
      uf: hq,
      city: (hqCity || '').trim(),
      cost100km: 0,
      isHq: true,
    });
  }
  return selected.map((row) => ({
    uf: row.uf,
    city: row.uf === hq ? (hqCity || row.city || '').trim() : (row.city || '').trim(),
    cost100km: row.cost100km || 0,
    isHq: Boolean(row.isHq),
  }));
}

export function hasExplicitOperatingCoverage(rows: ProviderOperatingCoverageRow[] | null | undefined): boolean {
  return Array.isArray(rows) && rows.some((row) => row && UF_TO_REGION[(row.uf || '').toUpperCase()]);
}

export function toggleCoverageUf(
  rows: ProviderOperatingCoverageRow[],
  uf: string,
  selected: boolean,
  hqUf?: string,
  hqCity?: string,
): ProviderOperatingCoverageRow[] {
  const target = uf.toUpperCase().trim();
  const hq = (hqUf || '').toUpperCase().trim();
  if (!UF_TO_REGION[target]) return rows;
  if (target === hq && !selected) return rows;
  const current = parseOperatingCoverage(rows);
  if (selected) {
    if (current.some((row) => row.uf === target)) return current;
    return [
      ...current,
      {
        uf: target,
        city: target === hq ? (hqCity || '').trim() : '',
        cost100km: 0,
        isHq: target === hq,
      },
    ];
  }
  return current.filter((row) => row.uf !== target);
}

export function setCoverageCost(
  rows: ProviderOperatingCoverageRow[],
  uf: string,
  cost100km: number,
): ProviderOperatingCoverageRow[] {
  const target = uf.toUpperCase().trim();
  return parseOperatingCoverage(rows).map((row) => (
    row.uf === target
      ? { ...row, cost100km: Number.isFinite(cost100km) && cost100km > 0 ? cost100km : 0 }
      : row
  ));
}

export function setCoverageCity(
  rows: ProviderOperatingCoverageRow[],
  uf: string,
  city: string,
): ProviderOperatingCoverageRow[] {
  const target = uf.toUpperCase().trim();
  return parseOperatingCoverage(rows).map((row) => (
    row.uf === target ? { ...row, city: (city || '').trim() } : row
  ));
}
