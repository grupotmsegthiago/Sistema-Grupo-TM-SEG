/** Paginação Supabase reutilizável — evita .limit(N) silencioso em conjuntos grandes. */

export async function fetchAllPages<T>(
  buildQuery: (from: number, size: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxRows = 50_000,
): Promise<{ rows: T[]; truncated: boolean }> {
  const all: T[] = [];
  let from = 0;
  let exhausted = false;
  while (all.length < maxRows) {
    const take = Math.min(pageSize, maxRows - all.length);
    const { data, error } = await buildQuery(from, take);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < take) {
      exhausted = true;
      break;
    }
    from += data.length;
  }

  let truncated = false;
  if (!exhausted && all.length >= maxRows) {
    const { data, error } = await buildQuery(maxRows, 1);
    if (error) throw error;
    truncated = !!(data && data.length > 0);
  }

  return { rows: all, truncated };
}
