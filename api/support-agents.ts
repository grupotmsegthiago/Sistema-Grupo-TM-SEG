/**
 * GET /api/support-agents — handler leve (rewrite vercel.json).
 * Não usar /api/index (Express): em produção essa função estoura timeout.
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import { extractAuthToken } from '../lib/rh/apiEmployeesAuth.js';
import { resolvePrincipalFromToken } from '../lib/auth/resolvePrincipal.js';
import { canReadSupportAgents } from '../lib/supportAgents/supportAgentsAccess.js';
import { fetchAllSupportAgents } from '../lib/supportAgents/fetchAllSupportAgents.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  if (!token) {
    res.status(401).json({
      ok: false,
      agents: [],
      total: 0,
      completeness: 'ERRO',
      error: 'Não autorizado',
    });
    return;
  }

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const principal = await resolvePrincipalFromToken(token);
    if (!principal || !canReadSupportAgents(principal)) {
      res.status(403).json({
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: principal
          ? 'Permissão negada — Rede de Apoio é restrita a usuários internos'
          : 'Permissão negada — usuário inativo ou não encontrado',
      });
      return;
    }

    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: 'Supabase admin indisponível — não é possível carregar a Rede de Apoio',
      });
      return;
    }

    const status = String(req.query?.status || '').trim();
    const result = await fetchAllSupportAgents({
      async range(from, to) {
        let query = sb.from('support_agents').select('*').order('id', { ascending: true });
        if (status) query = query.eq('status', status);
        return query.range(from, to);
      },
    });

    const statusCode = result.ok ? 200 : result.completeness === 'CONSULTA INCOMPLETA' ? 206 : 500;
    res.status(statusCode).json(result);
  } catch (e: any) {
    console.error('[support-agents]', e?.message);
    res.status(500).json({
      ok: false,
      agents: [],
      total: 0,
      completeness: 'ERRO',
      error: e?.message || 'Falha ao listar agentes da Rede de Apoio',
    });
  }
}

export const config = { maxDuration: 60 };
