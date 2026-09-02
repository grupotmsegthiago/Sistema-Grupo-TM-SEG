import { fetchAllPages } from '../supabasePaging';

export const BILLING_DATASET_INCOMPLETE_MESSAGE =
  'Não foi possível carregar todas as OS do período. O faturamento foi bloqueado para evitar valores incompletos.';

export class BillingDatasetIncompleteError extends Error {
  constructor(
    public readonly reason: 'ROW_CAP_EXCEEDED',
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
  const commonQuery = (withExactCount: boolean) =>
    supabase
      .from('missions')
      .select(
        '*, company_vehicle:vehicles(*)',
        withExactCount ? { count: 'exact' } : undefined,
      )
      .in(params.filterColumn, params.canonicalNames)
      .neq('status', 'Recusada');

  const base = await fetchAllPages<T>(
    async (from, size) => {
      const { data, error, count } = await commonQuery(from === 0)
        .not('start_time', 'is', null)
        .gte('start_time', params.rangeStart)
        .lte('start_time', params.rangeEnd)
        .order('start_time', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + size - 1);
      return { data: data as T[] | null, error, count };
    },
    pageSize,
    maxRows,
    { getRowKey: (row) => row.id },
  );

  const overrides = await fetchAllPages<T>(
    async (from, size) => {
      const { data, error, count } = await commonQuery(from === 0)
        .not('billing_period_override', 'is', null)
        .gte('billing_period_override', params.rangeStart)
        .lte('billing_period_override', params.rangeEnd)
        .order('billing_period_override', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + size - 1);
      return { data: data as T[] | null, error, count };
    },
    pageSize,
    maxRows,
    { getRowKey: (row) => row.id },
  );

  if (base.truncated || overrides.truncated) {
    throw new BillingDatasetIncompleteError('ROW_CAP_EXCEEDED');
  }

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
