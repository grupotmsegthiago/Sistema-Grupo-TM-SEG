import type { Express, Request, Response } from 'express';
import { handleSupportAgentsList } from '../lib/supportAgents/handleSupportAgentsList';

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;
type RoleMiddlewareFactory = (...roles: string[]) => AuthMiddleware;

export function registerSupportAgentsRoutes(
  app: Express,
  requireAuth: AuthMiddleware,
  requireRole: RoleMiddlewareFactory,
) {
  app.get('/api/support-agents', requireAuth, requireRole('*'), async (req: Request, res: Response) => {
    try {
      const token = String((req as any).authToken || '');
      const result = await handleSupportAgentsList(
        token,
        req.query.status,
        req.query.from,
        req.query.to,
      );
      res.status(result.status).json(result.body);
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
