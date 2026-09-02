import { fetchAllKeysetPages } from '../supabasePaging';

export const BILLING_DATASET_INCOMPLETE_MESSAGE =
  'Não foi possível carregar todas as OS do período. O faturamento foi bloqueado para evitar valores incompletos.';

export class BillingDatasetIncompleteError extends Error {
  constructor(
    public readonly reason: 'ROW_CAP_EXCEEDED' | 'UNSTABLE_SNAPSHOT' | 'COUNT_UNAVAILABLE',
  ) {
    super(BILLING_DATASET_INCOMPLETE_MESSAGE);
    this.name = 'BillingDatasetIncompleteError';
  }
}

export interface BillingMissionUniverseParams {
  filterColumn: 'client' | 'provider';
  canonicalNames: string[];
  rangeStart: string;
  rangeEnd: string;
  pageSize?: number;
  maxRows?: number;
}

export interface BillingMissionUniverseResult<T> {
  rows: T[];
  recordsLoaded: number;
  pagesLoaded: number;
  complete: true;
}

type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Carrega o universo integral de OS do boletim.
 *
 * As duas regras de inclusão (start_time e billing_period_override) formam uma
 * única consulta lógica. Qualquer erro, teto atingido ou mudança de identidade
 * entre a carga e a validação interrompe a operação.
 */
export async function fetchBillingMissionUniverse<T extends { id: string; start_time?: string | null }>(
  supabase: SupabaseLike,
  params: BillingMissionUniverseParams,
): Promise<BillingMissionUniverseResult<T>> {
  const pageSize = params.pageSize ?? 1000;
  const maxRows = params.maxRows ?? 50_000;
  const periodUnionFilter = [
    `and(start_time.gte.${params.rangeStart},start_time.lte.${params.rangeEnd})`,
    `and(billing_period_override.gte.${params.rangeStart},billing_period_override.lte.${params.rangeEnd})`,
  ].join(',');

  const buildUniverseQuery = (
    selectColumns: string,
    withExactCount: boolean,
    head = false,
  ) =>
    supabase
      .from('missions')
      .select(selectColumns, withExactCount ? { count: 'exact', head } : undefined)
      .in(params.filterColumn, params.canonicalNames)
      .neq('status', 'Recusada')
      .or(periodUnionFilter);

  const rows = await fetchAllKeysetPages<T, string>(
    async (afterId, size) => {
      let query = buildUniverseQuery(
        '*, company_vehicle:vehicles(*)',
        afterId === null,
      )
        .order('id', { ascending: true })
        .limit(size);
      if (afterId !== null) query = query.gt('id', afterId);
      const { data, error, count } = await query;
      return { data: data as T[] | null, error, count };
    },
    pageSize,
    maxRows,
    { getRowKey: (row) => row.id },
  );

  if (rows.truncated) {
    throw new BillingDatasetIncompleteError('ROW_CAP_EXCEEDED');
  }

  const identities = await fetchAllKeysetPages<{ id: string }, string>(
    async (afterId, size) => {
      let query = buildUniverseQuery('id', afterId === null)
        .order('id', { ascending: true })
        .limit(size);
      if (afterId !== null) query = query.gt('id', afterId);
      const { data, error, count } = await query;
      return { data: data as { id: string }[] | null, error, count };
    },
    pageSize,
    maxRows,
    { getRowKey: (row) => row.id },
  );

  if (identities.truncated) {
    throw new BillingDatasetIncompleteError('ROW_CAP_EXCEEDED');
  }

  const finalCountQuery = buildUniverseQuery('id', true, true);
  const { error: finalCountError, count: finalCount } = await finalCountQuery;
  if (finalCountError) throw finalCountError;
  if (
    rows.expectedRows === null ||
    identities.expectedRows === null ||
    typeof finalCount !== 'number'
  ) {
    throw new BillingDatasetIncompleteError('COUNT_UNAVAILABLE');
  }

  const rowIds = rows.rows.map((row) => row.id);
  const identityIds = identities.rows.map((row) => row.id);
  const sameIdentities =
    rowIds.length === identityIds.length &&
    rowIds.every((id, index) => id === identityIds[index]);
  const sameCounts =
    rows.expectedRows === identities.expectedRows &&
    identities.expectedRows === finalCount &&
    rowIds.length === finalCount;

  if (!sameIdentities || !sameCounts) {
    throw new BillingDatasetIncompleteError('UNSTABLE_SNAPSHOT');
  }

  const sortedRows = [...rows.rows].sort((a, b) => {
    const dateDiff =
      new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
    return dateDiff || String(a.id).localeCompare(String(b.id));
  });

  return {
    rows: sortedRows,
    recordsLoaded: sortedRows.length,
    pagesLoaded: rows.pagesLoaded + identities.pagesLoaded,
    complete: true,
  };
}
