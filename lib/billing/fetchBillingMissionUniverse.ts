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
 * As duas fontes de inclusão (start_time e billing_period_override) usam a
 * paginação central. Qualquer erro, teto atingido ou duplicidade dentro de um
 * range interrompe a carga; nenhum subconjunto parcial é retornado ao chamador.
 */
export async function fetchBillingMissionUniverse<T extends { id: string; start_time?: string | null }>(
  supabase: SupabaseLike,
  params: BillingMissionUniverseParams,
): Promise<BillingMissionUniverseResult<T>> {
  const pageSize = params.pageSize ?? 1000;
  const maxRows = params.maxRows ?? 50_000;
  type PeriodColumn = 'start_time' | 'billing_period_override';

  const buildSourceQuery = (
    periodColumn: PeriodColumn,
    selectColumns: string,
    withExactCount: boolean,
    head = false,
  ) =>
    supabase
      .from('missions')
      .select(selectColumns, withExactCount ? { count: 'exact', head } : undefined)
      .in(params.filterColumn, params.canonicalNames)
      .neq('status', 'Recusada')
      .not(periodColumn, 'is', null)
      .gte(periodColumn, params.rangeStart)
      .lte(periodColumn, params.rangeEnd);

  const loadStableSource = async (periodColumn: PeriodColumn) => {
    const rows = await fetchAllKeysetPages<T, string>(
      async (afterId, size) => {
        let query = buildSourceQuery(
          periodColumn,
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
        let query = buildSourceQuery(periodColumn, 'id', afterId === null)
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

    const finalCountQuery = buildSourceQuery(periodColumn, 'id', true, true);
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

    return {
      rows: rows.rows,
      pagesLoaded: rows.pagesLoaded + identities.pagesLoaded,
    };
  };

  const base = await loadStableSource('start_time');
  const overrides = await loadStableSource('billing_period_override');

  const seen = new Set(base.rows.map((mission) => mission.id));
  const rows = [
    ...base.rows,
    ...overrides.rows.filter((mission) => {
      if (seen.has(mission.id)) return false;
      seen.add(mission.id);
      return true;
    }),
  ];

  rows.sort((a, b) => {
    const dateDiff =
      new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
    return dateDiff || String(a.id).localeCompare(String(b.id));
  });

  return {
    rows,
    recordsLoaded: rows.length,
    pagesLoaded: base.pagesLoaded + overrides.pagesLoaded,
    complete: true,
  };
}
