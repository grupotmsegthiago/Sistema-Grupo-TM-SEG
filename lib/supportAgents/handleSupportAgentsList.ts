import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { fetchAllSupportAgents } from './fetchAllSupportAgents';
import { canReadSupportAgents } from './supportAgentsAccess';
import { resolvePrincipalFromToken } from '../auth/resolvePrincipal.js';

export type SupportAgentsListResponse = {
  status: number;
  body: Record<string, unknown>;
};

function rangeQuery(status?: string) {
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  return {
    async range(from: number, to: number) {
      let query = sb.from('support_agents').select('*').order('id', { ascending: true });
      if (status) query = query.eq('status', status);
      return query.range(from, to);
    },
  };
}

/** Lista a Rede de Apoio com service_role. Fail-closed se auth/consulta falhar. */
export async function handleSupportAgentsList(
  token: string,
  statusFilter?: string,
): Promise<SupportAgentsListResponse> {
  if (!token) {
    return {
      status: 401,
      body: { ok: false, agents: [], total: 0, completeness: 'ERRO', error: 'Não autorizado' },
    };
  }

  const principal = await resolvePrincipalFromToken(token);
  if (!principal || !canReadSupportAgents(principal)) {
    return {
      status: principal ? 403 : 403,
      body: {
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: principal
          ? 'Permissão negada — Rede de Apoio é restrita a usuários internos'
          : 'Permissão negada — usuário inativo ou não encontrado',
      },
    };
  }

  const status = String(statusFilter || '').trim();
  const query = rangeQuery(status || undefined);
  if (!query) {
    return {
      status: 503,
      body: {
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: 'Supabase admin indisponível — não é possível carregar a Rede de Apoio',
      },
    };
  }

  const result = await fetchAllSupportAgents(query);
  const statusCode = result.ok ? 200 : result.completeness === 'CONSULTA INCOMPLETA' ? 206 : 500;
  return { status: statusCode, body: result };
}
