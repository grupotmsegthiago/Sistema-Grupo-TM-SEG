import { authFetch } from '../authFetch';
import type { SupportAgent } from '../../types';
import {
  SUPPORT_AGENTS_MAX_PAGES,
  SUPPORT_AGENTS_PAGE_SIZE,
  type SupportAgentsCompleteness,
} from './fetchAllSupportAgents';
import { parseSupportAgentsResponse, type SupportAgentsApiResponse } from './parseSupportAgentsResponse';

export type { SupportAgentsApiResponse };

async function loadSupportAgentsPage(
  from: number,
  options?: { status?: string },
): Promise<SupportAgentsApiResponse & { hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  params.set('from', String(from));
  params.set('to', String(from + SUPPORT_AGENTS_PAGE_SIZE - 1));

  const response = await authFetch(`/api/support-agents?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const rawText = await response.text();
  const payload = parseSupportAgentsResponse(
    response.status,
    rawText,
    response.headers.get('content-type') || '',
  );

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      agents: [],
      total: 0,
      hasMore: false,
      completeness: payload.completeness || 'ERRO',
      error: payload.error || `Falha ao carregar a Rede de Apoio (HTTP ${response.status})`,
    };
  }

  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  const hasMore = payload.hasMore === true || agents.length >= SUPPORT_AGENTS_PAGE_SIZE;
  return {
    ok: true,
    agents,
    total: typeof payload.total === 'number' ? payload.total : agents.length,
    hasMore,
    completeness: payload.completeness || (agents.length > 0 ? 'ENCONTRADO' : 'NÃO EXISTE'),
  };
}

export async function loadSupportAgentsFromApi(options?: {
  status?: string;
}): Promise<SupportAgentsApiResponse> {
  const all: SupportAgent[] = [];

  for (let page = 0; page < SUPPORT_AGENTS_MAX_PAGES; page++) {
    const from = page * SUPPORT_AGENTS_PAGE_SIZE;
    const result = await loadSupportAgentsPage(from, options);
    if (!result.ok) {
      return {
        ok: false,
        agents: all,
        total: all.length,
        completeness: all.length > 0 ? 'CONSULTA INCOMPLETA' : (result.completeness || 'ERRO'),
        error: result.error,
      };
    }

    all.push(...(result.agents || []));
    if (!result.hasMore) {
      return {
        ok: true,
        agents: all,
        total: all.length,
        completeness: all.length > 0 ? 'ENCONTRADO' : 'NÃO EXISTE',
      };
    }
  }

  return {
    ok: false,
    agents: all,
    total: all.length,
    completeness: 'CONSULTA INCOMPLETA',
    error: `Consulta interrompida no limite de ${SUPPORT_AGENTS_MAX_PAGES} páginas`,
  };
}
