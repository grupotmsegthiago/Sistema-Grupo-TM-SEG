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
