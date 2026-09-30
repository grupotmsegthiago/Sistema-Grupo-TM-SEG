/**
 * Pergunta ao operador se a tabela escolhida bate com a origem e o destino.
 * Não altera valor de OS. Só aponta a tabela exclusiva da cidade, quando existir.
 */
import {
  TABLE_SPECIFIC_CITY_KEYWORDS,
  evaluateRegionalTableConstraint,
  extractCityFromAddress,
  extractUF,
  identifyRegionFromText,
} from './financialUtils';

export type TableRouteCandidate = {
  id: string | number;
  operation_type?: string | null;
  franchise_km?: number | null;
};

export type TableRouteQuestion = {
  fits: boolean;
  headline: string;
  answer: string;
  suggestedTableId?: string;
  suggestedTableName?: string;
};

const HEADLINE = 'A tabela bate com a origem e o destino?';

function fold(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/** Cidades exclusivas citadas no endereço, da mais específica para a mais curta. */
export function exclusiveCitiesInAddress(address: string | null | undefined): string[] {
  const text = fold(address);
  if (!text) return [];
  return [...TABLE_SPECIFIC_CITY_KEYWORDS]
    .map((city) => fold(city))
    .filter((city) => city && text.includes(city))
    .sort((a, b) => b.length - a.length);
}

function citiesNamedByTable(tableName: string): string[] {
  const text = fold(tableName);
  return [...TABLE_SPECIFIC_CITY_KEYWORDS]
    .map((city) => fold(city))
    .filter((city) => city && text.includes(city))
    .sort((a, b) => b.length - a.length);
}

function placeLabel(address: string, city: string): string {
  return city || address || 'não informada';
}

/** Entre as tabelas exclusivas da origem, a menor franquia que cobre o KM. */
export function suggestExclusiveOriginTable(
  candidates: TableRouteCandidate[] | undefined,
  origin: string,
  distanceKm?: number,
): { id: string; name: string } | null {
  const originCities = exclusiveCitiesInAddress(origin);
  if (!originCities.length || !candidates?.length) return null;
  const dist = Number(distanceKm) || 0;
  const matches = candidates.filter((table) => {
    const name = fold(table.operation_type);
    return originCities.some((city) => name.includes(city));
  });
  if (!matches.length) return null;
  const ranked = [...matches].sort((a, b) => {
    const ka = Number(a.franchise_km) || 0;
    const kb = Number(b.franchise_km) || 0;
    const aCovers = dist <= 0 || ka <= 0 || ka >= dist;
    const bCovers = dist <= 0 || kb <= 0 || kb >= dist;
    if (aCovers !== bCovers) return aCovers ? -1 : 1;
    if (aCovers && ka !== kb) return ka - kb;
    return kb - ka;
  });
  const best = ranked[0];
  return { id: String(best.id), name: String(best.operation_type || '').trim() };
}

export function questionTableAgainstRoute(input: {
  tableName?: string | null;
  origin?: string | null;
  destination?: string | null;
  candidates?: TableRouteCandidate[];
  distanceKm?: number;
}): TableRouteQuestion {
  const tableName = String(input.tableName || '').trim();
  const origin = String(input.origin || '').trim();
  const destination = String(input.destination || '').trim();
  const originCity = fold(extractCityFromAddress(origin));
  const destCity = fold(extractCityFromAddress(destination));
  const originCities = exclusiveCitiesInAddress(`${origin} ${originCity}`);
  const destCities = exclusiveCitiesInAddress(`${destination} ${destCity}`);
  const suggestion = suggestExclusiveOriginTable(input.candidates, `${origin} ${originCity}`, input.distanceKm);
  const named = citiesNamedByTable(tableName);
  const originPlace = placeLabel(origin, originCity);
  const destPlace = placeLabel(destination, destCity);

  const withSuggestion = (base: TableRouteQuestion): TableRouteQuestion => {
    if (!suggestion || suggestion.name.toUpperCase() === tableName.toUpperCase()) return base;
    if (base.fits) return base;
    return {
      ...base,
      suggestedTableId: suggestion.id,
      suggestedTableName: suggestion.name,
      answer: `${base.answer} A tabela mais apropriada para esta origem é ${suggestion.name}.`,
    };
  };

  if (!tableName) {
    return withSuggestion({
      fits: false,
      headline: HEADLINE,
      answer: `Ainda não há tabela. Origem: ${originPlace}. Destino: ${destPlace}.`,
    });
  }

  const gate = evaluateRegionalTableConstraint(tableName, {
    originCity,
    destCity,
    originRegion: identifyRegionFromText(origin) || identifyRegionFromText(extractUF(origin)),
    originUF: extractUF(origin),
    originAddress: origin,
  });
  if (gate.blocked) {
    return withSuggestion({
      fits: false,
      headline: HEADLINE,
      answer: `Não. ${tableName} não corresponde à origem ${originPlace} nem ao destino ${destPlace}. ${gate.reason}.`,
    });
  }

  if (named.length > 0) {
    const hitsOrigin = named.some((city) => originCities.includes(city));
    const hitsDest = named.some((city) => destCities.includes(city));
    if (!hitsOrigin) {
      const where = hitsDest
        ? `${named[0]} aparece no destino, e a tabela exclusiva vale para a origem`
        : `${named[0]} não está na origem nem no destino`;
      return withSuggestion({
        fits: false,
        headline: HEADLINE,
        answer: `Não. ${tableName} é exclusiva de ${named[0]}. ${where}. Esta OS sai de ${originPlace} e vai para ${destPlace}.`,
      });
    }
    return {
      fits: true,
      headline: HEADLINE,
      answer: `Sim. ${tableName} é a tabela exclusiva da origem ${named.find((city) => originCities.includes(city)) || named[0]}, de ${originPlace} para ${destPlace}.`,
    };
  }

  if (suggestion) {
    return {
      fits: false,
      headline: HEADLINE,
      suggestedTableId: suggestion.id,
      suggestedTableName: suggestion.name,
      answer: `Não. A origem ${originPlace} tem tabela exclusiva (${suggestion.name}). ${tableName} é genérica e não é a da cidade. Destino: ${destPlace}.`,
    };
  }

  return {
    fits: true,
    headline: HEADLINE,
    answer: `Sim. Não há tabela exclusiva para ${originPlace}. ${tableName} é a faixa apropriada para ir até ${destPlace}.`,
  };
}
