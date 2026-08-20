import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import {
  parseSupportAgentsPageRange,
  SUPPORT_AGENTS_SELECT,
} from './fetchAllSupportAgents';
import { canReadSupportAgents } from './supportAgentsAccess';
import { resolvePrincipalFromToken } from '../auth/resolvePrincipal.js';

export type SupportAgentsListResponse = {
  status: number;
  body: Record<string, unknown>;
};

function errorBody(error: string, statusHint: 'ERRO' | 'CONSULTA INCOMPLETA' = 'ERRO') {
  return { ok: false, agents: [], total: 0, hasMore: false, completeness: statusHint, error };
}

/** Uma página da Rede de Apoio com service_role. O browser pagina o universo. */
export async function handleSupportAgentsList(
  token: string,
  statusFilter?: string,
  fromRaw?: unknown,
  toRaw?: unknown,
): Promise<SupportAgentsListResponse> {
  if (!token) {
    return { status: 401, body: errorBody('Não autorizado') };
  }

  const principal = await resolvePrincipalFromToken(token);
  if (!principal || !canReadSupportAgents(principal)) {
    return {
      status: 403,
      body: errorBody(
        principal
          ? 'Permissão negada — Rede de Apoio é restrita a usuários internos'
          : 'Permissão negada — usuário inativo ou não encontrado',
      ),
    };
  }

  const sb = createSupabaseAdminClient();
  if (!sb) {
    return {
      status: 503,
      body: errorBody('Supabase admin indisponível — não é possível carregar a Rede de Apoio'),
    };
  }

  const { from, to } = parseSupportAgentsPageRange(fromRaw, toRaw);
  const status = String(statusFilter || '').trim();
  let query = sb.from('support_agents').select(SUPPORT_AGENTS_SELECT);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('id', { ascending: true }).range(from, to);

  if (error) {
    return {
      status: 500,
      body: errorBody(error.message || 'Falha ao consultar support_agents'),
    };
  }

  const agents = Array.isArray(data) ? data : [];
  const requested = to - from + 1;
  const hasMore = agents.length >= requested;
  return {
    status: 200,
    body: {
      ok: true,
      agents,
      total: agents.length,
      from,
      to,
      hasMore,
      completeness: agents.length > 0 || from > 0 ? 'ENCONTRADO' : 'NÃO EXISTE',
    },
  };
}
