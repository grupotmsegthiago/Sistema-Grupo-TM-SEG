import type { SupportAgent } from '../../types';
import type { SupportAgentsCompleteness } from './fetchAllSupportAgents';

export type SupportAgentsApiResponse = {
  ok: boolean;
  agents?: SupportAgent[];
  total?: number;
  hasMore?: boolean;
  completeness?: SupportAgentsCompleteness;
  error?: string;
};

/** Interpreta o corpo HTTP sem assumir JSON. Fail-closed se o corpo não for objeto. */
export function parseSupportAgentsResponse(
  status: number,
  rawText: string,
  contentType = '',
): SupportAgentsApiResponse {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      agents: [],
      total: 0,
      completeness: 'ERRO',
      error: `Resposta vazia da API da Rede de Apoio (HTTP ${status})`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const snippet = trimmed.replace(/\s+/g, ' ').slice(0, 80);
    const typeHint = contentType ? `, ${contentType}` : '';
    return {
      ok: false,
      agents: [],
      total: 0,
      completeness: 'ERRO',
      error: `Resposta inválida da API da Rede de Apoio (HTTP ${status}${typeHint}: ${snippet})`,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      agents: [],
      total: 0,
      completeness: 'ERRO',
      error: `Resposta inválida da API da Rede de Apoio (HTTP ${status})`,
    };
  }

  return parsed as SupportAgentsApiResponse;
}
