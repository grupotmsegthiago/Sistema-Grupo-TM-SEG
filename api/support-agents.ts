/**
 * GET /api/support-agents — handler leve.
 * Imports iguais ao deploy f11920ce (401 já comprovado em produção).
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import { extractAuthToken } from '../lib/rh/apiEmployeesAuth.js';
import { resolvePrincipalFromToken } from '../lib/auth/resolvePrincipal.js';
import { canReadSupportAgents } from '../lib/supportAgents/supportAgentsAccess.js';

const PAGE_SIZE = 1000;
const SELECT_COLS =
  'id,name,cpf,phone,is_armed,is_24h,base_address,latitude,longitude,service_cities,status,cost_value,pix_key,is_virtual,parent_agent_id,created_at';

function fail(res: any, status: number, error: string) {
  res.status(status).json({
    ok: false,
    agents: [],
    total: 0,
    hasMore: false,
    completeness: 'ERRO',
    error,
  });
}

function pageRange(fromRaw: unknown, toRaw: unknown): { from: number; to: number } {
  let from = Number.parseInt(String(fromRaw ?? '0'), 10);
  let to = Number.parseInt(String(toRaw ?? String(PAGE_SIZE - 1)), 10);
  if (!Number.isFinite(from) || from < 0) from = 0;
  if (!Number.isFinite(to) || to < from) to = from + PAGE_SIZE - 1;
  if (to - from + 1 > PAGE_SIZE) to = from + PAGE_SIZE - 1;
  return { from, to };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'GET') {
    fail(res, 405, 'method_not_allowed');
    return;
  }

  const token = extractAuthToken(req);
  if (!token) {
    fail(res, 401, 'Não autorizado');
    return;
  }

  try {
    const principal = await resolvePrincipalFromToken(token);
    if (!principal || !canReadSupportAgents(principal)) {
      fail(
        res,
        403,
        principal
          ? 'Permissão negada — Rede de Apoio é restrita a usuários internos'
          : 'Permissão negada — usuário inativo ou não encontrado',
      );
      return;
    }

    const sb = createSupabaseAdminClient();
    if (!sb) {
      fail(res, 503, 'Supabase admin indisponível — não é possível carregar a Rede de Apoio');
      return;
    }

    const { from, to } = pageRange(req.query?.from, req.query?.to);
    const status = String(req.query?.status || '').trim();
    let query = sb.from('support_agents').select(SELECT_COLS);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('id', { ascending: true }).range(from, to);
    if (error) {
      fail(res, 500, error.message || 'Falha ao consultar support_agents');
      return;
    }

    const agents = Array.isArray(data) ? data : [];
    res.status(200).json({
      ok: true,
      agents,
      total: agents.length,
      from,
      to,
      hasMore: agents.length >= (to - from + 1),
      completeness: agents.length > 0 || from > 0 ? 'ENCONTRADO' : 'NÃO EXISTE',
    });
  } catch (e: any) {
    console.error('[support-agents]', e?.message);
    fail(res, 500, e?.message || 'Falha ao listar agentes da Rede de Apoio');
  }
}

export const config = { maxDuration: 60 };
