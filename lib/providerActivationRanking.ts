// Ranking de acionamento 100 km por região/cidade/UF.
// Prioridade 0 = fornecedor mais em conta naquele recorte.

import { UF_TO_REGION } from './financialUtils';

export const REGION_ORDER = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'] as const;
export type MacroRegion = (typeof REGION_ORDER)[number];

export const UF_LABEL: Record<string, string> = {
  SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', ES: 'Espírito Santo',
  DF: 'Distrito Federal', GO: 'Goiás', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  PR: 'Paraná', SC: 'Santa Catarina', RS: 'Rio Grande do Sul',
  BA: 'Bahia', PE: 'Pernambuco', CE: 'Ceará', RN: 'Rio Grande do Norte',
  PB: 'Paraíba', AL: 'Alagoas', SE: 'Sergipe', PI: 'Piauí', MA: 'Maranhão',
  AM: 'Amazonas', PA: 'Pará', AC: 'Acre', RO: 'Rondônia', RR: 'Roraima', AP: 'Amapá', TO: 'Tocantins',
};

const REGION_WORDS: Record<string, MacroRegion> = {
  SUDESTE: 'SUDESTE',
  SUL: 'SUL',
  NORDESTE: 'NORDESTE',
  NORTE: 'NORTE',
  'CENTRO-OESTE': 'CENTRO-OESTE',
  'CENTRO OESTE': 'CENTRO-OESTE',
  'CENTRO -OESTE': 'CENTRO-OESTE',
};

const UF_WORDS: Record<string, string> = {
  'SAO PAULO': 'SP',
  'RIO DE JANEIRO': 'RJ',
  MINAS: 'MG',
  'ESPIRITO SANTO': 'ES',
  BAHIA: 'BA',
  PERNAMBUCO: 'PE',
  PARANA: 'PR',
  'SANTA CATARINA': 'SC',
  'RIO GRANDE DO SUL': 'RS',
  GOIAS: 'GO',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO': 'MT',
  'DISTRITO FEDERAL': 'DF',
  AMAZONAS: 'AM',
  PARAIBA: 'PB',
  'RIO GRANDE DO NORTE': 'RN',
  SERGIPE: 'SE',
};

/** Cadastro com cidade/UF divergente do mercado real. */
const NAME_MARKET_UF: Record<string, string> = {
  'COLISEU PE': 'PE',
};

const NAME_MARKET_CITY: Record<string, string> = {
  'COLISEU PE': 'Recife',
};

export interface RankingProviderInput {
  id?: string | number | null;
  name: string;
  trading_name?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  auto_calc_enabled?: boolean | null;
  auto_base_value?: number | null;
  auto_base_km?: number | null;
  auto_region?: string | null;
}

export interface RankingTableInput {
  provider: string;
  operation_type?: string | null;
  activation_cost?: number | null;
  franchise_km?: number | null;
}

export interface ActivationOffer {
  provider: string;
  providerId?: string;
  city: string;
  hqUf: string;
  marketUf: string;
  region: MacroRegion | '';
  cost: number;
  source: string;
  phone?: string;
  contactName?: string;
  tradingName?: string;
}

export interface RankedActivationRow extends ActivationOffer {
  priority: number;
}

export function stripAccents(value: string): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normKey(value: string): string {
  return stripAccents(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

export function titleCity(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const n = stripAccents(raw).toUpperCase();
  const fixes: Record<string, string> = {
    'SAO PAULO': 'São Paulo',
    'SAO JOAO DE MERITI': 'São João de Meriti',
    'NOVA IGUACU': 'Nova Iguaçu',
    'BELO HORIZONTE': 'Belo Horizonte',
    'RIO DE JANEIRO': 'Rio de Janeiro',
    'LAURO DE FREITAS': 'Lauro de Freitas',
    'APARECIDA DE GOIANIA': 'Aparecida de Goiânia',
    'GOIANIA': 'Goiânia',
    'MONTES CLAROS': 'Montes Claros',
    'CAMPO GRANDE': 'Campo Grande',
    'SAO BENTO DO SUL': 'São Bento do Sul',
    'SAPUCAIA DO SUL': 'Sapucaia do Sul',
    'SANTA CRUZ DO SUL': 'Santa Cruz do Sul',
    'VERA CRUZ': 'Vera Cruz',
    'SAO JOSE DOS PINHAIS': 'São José dos Pinhais',
    'FRANCISCO BELTRAO': 'Francisco Beltrão',
    'NOVA ESPERANCA': 'Nova Esperança',
    'CALDAS NOVAS': 'Caldas Novas',
    'PORTO ALEGRE': 'Porto Alegre',
    'GUARULHOS': 'Guarulhos',
    'CAJAMAR': 'Cajamar',
    'PAULINIA': 'Paulínia',
    'BERTIOGA': 'Bertioga',
    'MANAUS': 'Manaus',
    'RECIFE': 'Recife',
    'OLINDA': 'Olinda',
    'SERRA': 'Serra',
    'JOINVILLE': 'Joinville',
    'ITAJAI': 'Itajaí',
    'GARUVA': 'Garuva',
    'ARACAJU': 'Aracaju',
    'BRASILIA': 'Brasília',
    'RESERVA': 'Reserva',
    'CASCAVEL': 'Cascavel',
  };
  return fixes[n] || raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function isGeneric100KmTable(table: RankingTableInput): boolean {
  const op = table.operation_type || '';
  const n = normKey(op);
  if (n.includes('__AUTO_MASTER__')) return false;
  const km = Number(table.franchise_km);
  const looks100 = km === 100 || km === 110 || /(^|\D)(50|100|110)\s*KM/.test(n);
  if (!looks100) return false;
  if (Number.isFinite(km) && km > 0 && km < 90) return false;
  if (n.includes('PRONTA RESPOSTA') || n.includes('02 ARMAD') || n.includes('01 ARMAD')) return false;
  if (n.includes('PALHOCA') || n.includes('FLORIAN')) return false;
  if (n.includes('SINOP') || n.includes('SORRISO')) return false;
  if (n.includes('MOGI') || n.includes('VILA MARIA')) return false;
  if (n.includes('SANTOS') && n.includes('BARUERI')) return false;
  if (n.trim() === 'CARACTERIZADA') return false;
  if (/\bX\b/.test(n) && !n.includes('ATE')) return false;
  return true;
}

function detectUfsAndRegions(operationType: string, providerState: string): { ufs: string[]; regions: string[] } {
  const n = normKey(operationType);
  const ufs = new Set<string>();
  const regions = new Set<string>();

  for (const uf of Object.keys(UF_TO_REGION)) {
    const re = new RegExp(`(^|[^A-Z])${uf}([^A-Z]|$)`);
    if (re.test(n)) ufs.add(uf);
  }
  for (const [word, uf] of Object.entries(UF_WORDS)) {
    if (n.includes(word)) ufs.add(uf);
  }
  for (const [word, region] of Object.entries(REGION_WORDS)) {
    if (n.includes(word)) regions.add(region);
  }
  if (n.includes('BRASIL') || n.includes('OUTROS ESTADOS')) {
    regions.add('TODAS');
  }
  const hq = (providerState || '').toUpperCase();
  if (ufs.size === 0 && regions.size === 0 && UF_TO_REGION[hq]) {
    ufs.add(hq);
  }
  if (regions.size === 0) {
    for (const uf of ufs) {
      const region = UF_TO_REGION[uf];
      if (region) regions.add(region);
    }
  }
  return { ufs: [...ufs], regions: [...regions] };
}

function applyNameMarket(name: string, operationType: string, hqUf: string, city: string): { ufs?: string[]; city: string } {
  const key = normKey(name);
  const mapped = NAME_MARKET_UF[key];
  if (!mapped) return { city };
  const op = normKey(operationType);
  if (/\b(SP|RJ|MG|ES)\b/.test(op)) return { city };
  return {
    ufs: [mapped],
    city: mapped !== hqUf ? (NAME_MARKET_CITY[key] || city) : city,
  };
}

function resolveMarketUfs(
  detectedUfs: string[],
  detectedRegions: string[],
  hqUf: string,
): string[] {
  let ufs = [...detectedUfs];
  const regions = [...detectedRegions];
  if (regions.includes('TODAS')) {
    return UF_TO_REGION[hqUf] ? [hqUf] : [];
  }
  if (ufs.length === 0 && regions.length > 0) {
    if (hqUf && UF_TO_REGION[hqUf] && regions.includes(UF_TO_REGION[hqUf])) {
      ufs = [hqUf];
    } else {
      ufs = Object.entries(UF_TO_REGION)
        .filter(([, region]) => regions.includes(region))
        .map(([uf]) => uf);
    }
  }
  return ufs;
}

export function buildActivationOffers(
  providers: RankingProviderInput[],
  tables: RankingTableInput[],
): ActivationOffer[] {
  const active = (providers || []).filter((p) => (p.status || 'Ativo') === 'Ativo' && (p.name || '').trim());
  const byName = new Map<string, RankingProviderInput>();
  for (const p of active) {
    byName.set(normKey(p.name), p);
    if (p.trading_name) byName.set(normKey(p.trading_name), p);
  }

  const offers: ActivationOffer[] = [];

  for (const table of tables || []) {
    if (!isGeneric100KmTable(table)) continue;
    const providerName = (table.provider || '').trim();
    const provider = byName.get(normKey(providerName));
    if (!provider) continue;
    const cost = Number(table.activation_cost);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const hqUf = (provider.state || '').toUpperCase();
    let city = titleCity(provider.city || '');
    const detected = detectUfsAndRegions(table.operation_type || '', hqUf);
    const named = applyNameMarket(provider.name, table.operation_type || '', hqUf, city);
    if (named.ufs) {
      detected.ufs = named.ufs;
      detected.regions = named.ufs.map((uf) => UF_TO_REGION[uf]).filter(Boolean);
    }
    city = named.city;
    const marketUfs = resolveMarketUfs(detected.ufs, detected.regions, hqUf);

    for (const uf of marketUfs) {
      const region = (UF_TO_REGION[uf] || '') as MacroRegion | '';
      offers.push({
        provider: provider.name.trim(),
        providerId: provider.id != null ? String(provider.id) : undefined,
        city,
        hqUf,
        marketUf: uf,
        region,
        cost,
        source: (table.operation_type || '').trim(),
        phone: provider.phone || undefined,
        contactName: provider.contact_name || undefined,
        tradingName: provider.trading_name || undefined,
      });
    }
  }

  const have = new Set(offers.map((o) => `${o.provider}|${o.marketUf}`));

  for (const provider of active) {
    if (!provider.auto_calc_enabled) continue;
    const km = Number(provider.auto_base_km);
    if (km < 90 || km > 120) continue;
    const cost = Number(provider.auto_base_value);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const hqUf = (provider.state || '').toUpperCase();
    const filt = (provider.auto_region || '').toUpperCase().trim();
    let ufs: string[] = [];
    if (UF_TO_REGION[filt]) {
      ufs = [filt];
    } else if (REGION_WORDS[filt]) {
      const region = REGION_WORDS[filt];
      if (hqUf && UF_TO_REGION[hqUf] === region) ufs = [hqUf];
      else ufs = Object.entries(UF_TO_REGION).filter(([, r]) => r === region).map(([uf]) => uf);
    } else if (UF_TO_REGION[hqUf]) {
      ufs = [hqUf];
    }

    let city = titleCity(provider.city || '');
    const named = applyNameMarket(provider.name, filt, hqUf, city);
    if (named.ufs) ufs = named.ufs;
    city = named.city;
    const name = provider.name.trim();

    for (const uf of ufs) {
      if (have.has(`${name}|${uf}`)) continue;
      offers.push({
        provider: name,
        providerId: provider.id != null ? String(provider.id) : undefined,
        city,
        hqUf,
        marketUf: uf,
        region: (UF_TO_REGION[uf] || '') as MacroRegion | '',
        cost,
        source: `MOTOR AUTO (${filt || 'TODAS'})`,
        phone: provider.phone || undefined,
        contactName: provider.contact_name || undefined,
        tradingName: provider.trading_name || undefined,
      });
    }
  }

  const best = new Map<string, ActivationOffer>();
  for (const offer of offers) {
    const key = `${offer.provider}|${offer.marketUf}`;
    const prev = best.get(key);
    if (!prev || offer.cost < prev.cost) best.set(key, offer);
  }
  return [...best.values()];
}

export function rankOffers(offers: ActivationOffer[]): RankedActivationRow[] {
  return [...offers]
    .sort((a, b) => a.cost - b.cost || a.provider.localeCompare(b.provider, 'pt-BR'))
    .map((offer, index) => ({ ...offer, priority: index }));
}

export function rankByUf(offers: ActivationOffer[]): Record<string, RankedActivationRow[]> {
  const grouped: Record<string, ActivationOffer[]> = {};
  for (const offer of offers) {
    if (!offer.marketUf) continue;
    (grouped[offer.marketUf] ||= []).push(offer);
  }
  const ranked: Record<string, RankedActivationRow[]> = {};
  for (const [uf, list] of Object.entries(grouped)) {
    ranked[uf] = rankOffers(list);
  }
  return ranked;
}

export interface CityRankGroup {
  region: MacroRegion | '';
  city: string;
  uf: string;
  rows: RankedActivationRow[];
}

export function rankByHomeCity(offers: ActivationOffer[]): CityRankGroup[] {
  const grouped = new Map<string, ActivationOffer[]>();
  for (const offer of offers) {
    if (offer.marketUf !== offer.hqUf && normKey(offer.provider) !== 'COLISEU PE') continue;
    const key = `${offer.region}|${offer.city}|${offer.marketUf}`;
    const list = grouped.get(key) || [];
    list.push(offer);
    grouped.set(key, list);
  }

  const groups: CityRankGroup[] = [];
  for (const [key, list] of grouped) {
    const [region, city, uf] = key.split('|');
    groups.push({
      region: (region || '') as MacroRegion | '',
      city,
      uf,
      rows: rankOffers(list),
    });
  }

  return groups.sort((a, b) => {
    const ra = REGION_ORDER.indexOf(a.region as MacroRegion);
    const rb = REGION_ORDER.indexOf(b.region as MacroRegion);
    if (ra !== rb) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    if (a.uf !== b.uf) return a.uf.localeCompare(b.uf);
    return a.city.localeCompare(b.city, 'pt-BR');
  });
}

export function formatActivationCost(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function shortProviderName(name: string): string {
  const cleaned = (name || '').replace(/\s+/g, ' ').trim();
  const cut = cleaned
    .replace(/\s+(LTDA|S\.?A\.?|EIRELI|ME|EPP)\.?$/i, '')
    .replace(/\s+SEGURANCA.*$/i, '')
    .replace(/\s+VIGILANCIA.*$/i, '')
    .trim();
  if (cut.length >= 3 && cut.length < cleaned.length) return cut;
  return cleaned.length > 36 ? `${cleaned.slice(0, 34)}…` : cleaned;
}
