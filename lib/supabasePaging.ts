/** Paginação Supabase reutilizável — evita .limit(N) silencioso em conjuntos grandes. */

export class SupabasePagingIntegrityError extends Error {
  constructor(
    message: string,
    public readonly code: 'NULL_PAGE' | 'DUPLICATE_ROW' | 'COUNT_CHANGED' | 'ROW_COUNT_MISMATCH',
  ) {
    super(message);
    this.name = 'SupabasePagingIntegrityError';
  }
}

export interface FetchAllPagesOptions<T> {
  /** Chave estável usada para detectar sobreposição/duplicidade entre ranges. */
  getRowKey?: (row: T) => string | number;
}

export interface FetchAllPagesResult<T> {
  rows: T[];
  truncated: boolean;
  pagesLoaded: number;
  complete: boolean;
  expectedRows: number | null;
}

export interface FetchAllKeysetPagesOptions<T, TKey extends string | number> {
  /** Chave única e estável usada como cursor. */
  getRowKey: (row: T) => TKey;
}

export async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    size: number,
  ) => Promise<{ data: T[] | null; error: unknown; count?: number | null }>,
  pageSize = 1000,
  maxRows = 50_000,
  options: FetchAllPagesOptions<T> = {},
): Promise<FetchAllPagesResult<T>> {
  const all: T[] = [];
  const seenKeys = new Set<string | number>();
  let from = 0;
  let exhausted = false;
  let pagesLoaded = 0;
  let expectedRows: number | null = null;
  while (all.length < maxRows) {
    const take = Math.min(pageSize, maxRows - all.length);
    const { data, error, count } = await buildQuery(from, take);
    pagesLoaded += 1;
    if (error) throw error;
    if (typeof count === 'number') {
      if (expectedRows !== null && count !== expectedRows) {
        throw new SupabasePagingIntegrityError(
          `A contagem mudou durante a paginação (${expectedRows} → ${count}).`,
          'COUNT_CHANGED',
        );
      }
      expectedRows = count;
    }
    if (data === null) {
      throw new SupabasePagingIntegrityError(
        `Página ${pagesLoaded} retornou dados nulos sem erro explícito.`,
        'NULL_PAGE',
      );
    }
    if (data.length === 0) {
      exhausted = true;
      break;
    }
    for (const row of data) {
      const key = options.getRowKey?.(row);
      if (key !== undefined) {
        if (seenKeys.has(key)) {
          throw new SupabasePagingIntegrityError(
            `Registro duplicado entre páginas: ${String(key)}.`,
            'DUPLICATE_ROW',
          );
        }
        seenKeys.add(key);
      }
      all.push(row);
    }
    if (expectedRows !== null && all.length > expectedRows) {
      throw new SupabasePagingIntegrityError(
        `Foram carregados ${all.length} registros para uma contagem esperada de ${expectedRows}.`,
        'ROW_COUNT_MISMATCH',
      );
    }
    if (expectedRows !== null && all.length === expectedRows) {
      exhausted = true;
      break;
    }
    if (data.length < take) {
      exhausted = true;
      break;
    }
    from += data.length;
  }

  let truncated = false;
  if (!exhausted && all.length >= maxRows) {
    if (expectedRows !== null) {
      truncated = expectedRows > maxRows;
    } else {
      const { data, error } = await buildQuery(maxRows, 1);
      pagesLoaded += 1;
      if (error) throw error;
      if (data === null) {
        throw new SupabasePagingIntegrityError(
          `Página sentinela retornou dados nulos sem erro explícito.`,
          'NULL_PAGE',
        );
      }
      truncated = data.length > 0;
    }
  }

  if (!truncated && expectedRows !== null && all.length !== expectedRows) {
    throw new SupabasePagingIntegrityError(
      `A paginação terminou com ${all.length} de ${expectedRows} registros esperados.`,
      'ROW_COUNT_MISMATCH',
    );
  }

  return { rows: all, truncated, pagesLoaded, complete: !truncated, expectedRows };
}

/**
 * Paginação por cursor estável. Diferentemente de range/offset, inserções antes
 * do cursor não deslocam os registros ainda não lidos.
 *
 * A função percorre até o fim real mesmo quando alcança o count inicial. Isso é
 * intencional: count é evidência auxiliar, não prova isolada de integralidade.
 */
export async function fetchAllKeysetPages<T, TKey extends string | number>(
  buildQuery: (
    afterKey: TKey | null,
    size: number,
  ) => Promise<{ data: T[] | null; error: unknown; count?: number | null }>,
  pageSize = 1000,
  maxRows = 50_000,
  options: FetchAllKeysetPagesOptions<T, TKey>,
): Promise<FetchAllPagesResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new Error('maxRows deve ser um inteiro positivo.');
  }

  const all: T[] = [];
  const seenKeys = new Set<TKey>();
  let afterKey: TKey | null = null;
  let exhausted = false;
  let pagesLoaded = 0;
  let expectedRows: number | null = null;

  while (all.length < maxRows) {
    const take = Math.min(pageSize, maxRows - all.length);
    const { data, error, count } = await buildQuery(afterKey, take);
    pagesLoaded += 1;
    if (error) throw error;
    if (typeof count === 'number') {
      if (expectedRows !== null && count !== expectedRows) {
        throw new SupabasePagingIntegrityError(
          `A contagem mudou durante a paginação (${expectedRows} → ${count}).`,
          'COUNT_CHANGED',
        );
      }
      expectedRows = count;
    }
    if (data === null) {
      throw new SupabasePagingIntegrityError(
        `Página ${pagesLoaded} retornou dados nulos sem erro explícito.`,
        'NULL_PAGE',
      );
    }
    if (data.length === 0) {
      exhausted = true;
      break;
    }

    for (const row of data) {
      const key = options.getRowKey(row);
      if (seenKeys.has(key)) {
        throw new SupabasePagingIntegrityError(
          `Registro duplicado entre páginas: ${String(key)}.`,
          'DUPLICATE_ROW',
        );
      }
      seenKeys.add(key);
      all.push(row);
    }

    afterKey = options.getRowKey(data[data.length - 1]);
    if (expectedRows !== null && all.length > expectedRows) {
      throw new SupabasePagingIntegrityError(
        `Foram carregados ${all.length} registros para uma contagem esperada de ${expectedRows}.`,
        'ROW_COUNT_MISMATCH',
      );
    }
    if (data.length < take) {
      exhausted = true;
      break;
    }
  }

  let truncated = false;
  if (!exhausted && all.length >= maxRows) {
    const { data, error } = await buildQuery(afterKey, 1);
    pagesLoaded += 1;
    if (error) throw error;
    if (data === null) {
      throw new SupabasePagingIntegrityError(
        'Página sentinela retornou dados nulos sem erro explícito.',
        'NULL_PAGE',
      );
    }
    truncated = data.length > 0;
  }

  if (!truncated && expectedRows !== null && all.length !== expectedRows) {
    throw new SupabasePagingIntegrityError(
      `A paginação terminou com ${all.length} de ${expectedRows} registros esperados.`,
      'ROW_COUNT_MISMATCH',
    );
  }

  return { rows: all, truncated, pagesLoaded, complete: !truncated, expectedRows };
}
