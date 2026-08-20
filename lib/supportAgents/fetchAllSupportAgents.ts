export const SUPPORT_AGENTS_PAGE_SIZE = 1000;
export const SUPPORT_AGENTS_MAX_PAGES = 50;

type SupportAgent = Record<string, unknown> & { id?: string };

export type SupportAgentsCompleteness =
  | 'ENCONTRADO'
  | 'NÃO EXISTE'
  | 'CONSULTA INCOMPLETA'
  | 'ERRO';

export type SupportAgentsPage = {
  data: SupportAgent[] | null;
  error: { message?: string } | null;
};

export type SupportAgentsRangeQuery = {
  range: (from: number, to: number) => PromiseLike<SupportAgentsPage>;
};

export type FetchAllSupportAgentsOptions = {
  pageSize?: number;
  maxPages?: number;
};

export type FetchAllSupportAgentsResult = {
  ok: boolean;
  agents: SupportAgent[];
  total: number;
  pages: number;
  completeness: SupportAgentsCompleteness;
  error?: string;
};

/**
 * Lê o universo de support_agents por páginas.
 * Não trata a primeira página como conjunto completo.
 * Falha fechada: erro ou corte por limite de páginas = CONSULTA INCOMPLETA / ERRO.
 */
export async function fetchAllSupportAgents(
  query: SupportAgentsRangeQuery,
  options: FetchAllSupportAgentsOptions = {},
): Promise<FetchAllSupportAgentsResult> {
  const pageSize = options.pageSize ?? SUPPORT_AGENTS_PAGE_SIZE;
  const maxPages = options.maxPages ?? SUPPORT_AGENTS_MAX_PAGES;
  const agents: SupportAgent[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let result: SupportAgentsPage;
    try {
      result = await query.range(from, to);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        agents,
        total: agents.length,
        pages: page,
        completeness: agents.length > 0 ? 'CONSULTA INCOMPLETA' : 'ERRO',
        error: message || 'Falha ao consultar support_agents',
      };
    }

    if (result.error) {
      return {
        ok: false,
        agents,
        total: agents.length,
        pages: page,
        completeness: agents.length > 0 ? 'CONSULTA INCOMPLETA' : 'ERRO',
        error: result.error.message || 'Falha ao consultar support_agents',
      };
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    agents.push(...rows);

    if (rows.length < pageSize) {
      return {
        ok: true,
        agents,
        total: agents.length,
        pages: page + 1,
        completeness: agents.length > 0 ? 'ENCONTRADO' : 'NÃO EXISTE',
      };
    }
  }

  return {
    ok: false,
    agents,
    total: agents.length,
    pages: maxPages,
    completeness: 'CONSULTA INCOMPLETA',
    error: `Consulta interrompida no limite de ${maxPages} páginas`,
  };
}
