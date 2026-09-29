import type { Express, Request, Response } from 'express';
import { handleCevaPortalHttp } from '../lib/cevaPortal/httpHandler';

function withOp(op: string, extraQuery?: Record<string, string>) {
  return async (req: Request, res: Response) => {
    req.query = { ...(req.query || {}), op, ...(extraQuery || {}) };
    await handleCevaPortalHttp(req, res);
  };
}

/** Portal externo CEVA. Em produção Vercel usa api/ceva-portal.ts (leve). */
export function registerCevaPortalRoutes(app: Express): void {
  app.get('/api/ceva-portal/acesso', withOp('acesso'));
  app.post('/api/ceva-portal/login', withOp('login'));
  app.post('/api/ceva-portal/primeiro-acesso', withOp('primeiro-acesso'));
  app.get('/api/ceva-portal/me', withOp('me'));
  app.post('/api/ceva-portal/trocar-senha', withOp('trocar-senha'));
  app.get('/api/ceva-portal/pessoas', withOp('pessoas'));
  app.post('/api/ceva-portal/pessoas', withOp('pessoas'));
  app.patch('/api/ceva-portal/pessoas/:id', async (req, res) => {
    req.query = { ...(req.query || {}), op: 'pessoas-item', id: String(req.params.id || '') };
    await handleCevaPortalHttp(req, res);
  });
  app.get('/api/ceva-portal/ao-vivo', withOp('ao-vivo'));
  app.get('/api/ceva-portal/relatorio', withOp('relatorio'));
  app.post('/api/ceva-portal/campos', withOp('campos'));
  app.get('/api/ceva-portal/pgr/:os', async (req, res) => {
    req.query = { ...(req.query || {}), op: 'pgr', os: String(req.params.os || '') };
    await handleCevaPortalHttp(req, res);
  });
  app.get('/api/ceva-portal/solicitacoes', withOp('solicitacoes'));
  app.post('/api/ceva-portal/solicitacoes', withOp('solicitacoes'));
}
