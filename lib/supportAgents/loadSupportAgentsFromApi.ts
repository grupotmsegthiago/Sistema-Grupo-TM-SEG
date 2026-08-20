import { authFetch } from '../authFetch';
import type { SupportAgent } from '../../types';
import type { SupportAgentsCompleteness } from './fetchAllSupportAgents';

export type SupportAgentsApiResponse = {
  ok: boolean;
  agents?: SupportAgent[];
  total?: number;
  completeness?: SupportAgentsCompleteness;
  error?: string;
};

export async function loadSupportAgentsFromApi(options?: {
  status?: string;
}): Promise<SupportAgentsApiResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  const query = params.toString();
  const url = query ? `/api/support-agents?${query}` : '/api/support-agents';

  const response = await authFetch(url);
  let payload: SupportAgentsApiResponse = { ok: false };
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, error: 'Resposta inválida da API da Rede de Apoio' };
  }

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      agents: [],
      total: 0,
      completeness: payload.completeness || 'ERRO',
      error: payload.error || `Falha ao carregar a Rede de Apoio (HTTP ${response.status})`,
    };
  }

  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  return {
    ok: true,
    agents,
    total: typeof payload.total === 'number' ? payload.total : agents.length,
    completeness: payload.completeness || (agents.length > 0 ? 'ENCONTRADO' : 'NÃO EXISTE'),
  };
}
