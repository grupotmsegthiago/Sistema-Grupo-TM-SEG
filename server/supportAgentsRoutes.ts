import type { Express, Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import { fetchAllSupportAgents } from '../lib/supportAgents/fetchAllSupportAgents';
import { canReadSupportAgents } from '../lib/supportAgents/supportAgentsAccess';

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;
type RoleMiddlewareFactory = (...roles: string[]) => AuthMiddleware;

function buildRangeQuery(status?: string) {
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

export function registerSupportAgentsRoutes(
  app: Express,
  requireAuth: AuthMiddleware,
  requireRole: RoleMiddlewareFactory,
) {
  app.get('/api/support-agents', requireAuth, requireRole('*'), async (req: Request, res: Response) => {
    const principal = (req as any).user || (req as any).auth;
    if (!canReadSupportAgents(principal)) {
      res.status(403).json({
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: 'Permissão negada — Rede de Apoio é restrita a usuários internos',
      });
      return;
    }

    const status = String(req.query.status || '').trim();
    const query = buildRangeQuery(status || undefined);
    if (!query) {
      res.status(503).json({
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: 'Supabase admin indisponível — não é possível carregar a Rede de Apoio',
      });
      return;
    }

    try {
      const result = await fetchAllSupportAgents(query);
      const statusCode = result.ok ? 200 : result.completeness === 'CONSULTA INCOMPLETA' ? 206 : 500;
      res.status(statusCode).json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Falha ao listar agentes da Rede de Apoio';
      res.status(500).json({
        ok: false,
        agents: [],
        total: 0,
        completeness: 'ERRO',
        error: message,
      });
    }
  });
}
