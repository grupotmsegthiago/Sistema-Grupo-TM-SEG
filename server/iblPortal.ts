import type { Express, Request, Response } from 'express';
import { handleIblPortalHttp } from '../lib/cevaPortal/httpHandler';

function withOp(op: string, extraQuery?: Record<string, string>) {
  return async (req: Request, res: Response) => {
    // Express 5 expõe req.query só como getter. Acrescentar a chave, sem trocar o objeto.
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op, ...(extraQuery || {}) });
    await handleIblPortalHttp(req, res);
  };
}

/** Portal externo IBL. Em produção Vercel usa api/ibl-portal.ts (leve). */
export function registerIblPortalRoutes(app: Express): void {
  app.get('/api/ibl-portal/acesso', withOp('acesso'));
  app.post('/api/ibl-portal/login', withOp('login'));
  app.post('/api/ibl-portal/primeiro-acesso', withOp('primeiro-acesso'));
  app.get('/api/ibl-portal/me', withOp('me'));
  app.post('/api/ibl-portal/trocar-senha', withOp('trocar-senha'));
  app.get('/api/ibl-portal/pessoas', withOp('pessoas'));
  app.post('/api/ibl-portal/pessoas', withOp('pessoas'));
  app.patch('/api/ibl-portal/pessoas/:id', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pessoas-item', id: String(req.params.id || '') });
    await handleIblPortalHttp(req, res);
  });
  app.get('/api/ibl-portal/ao-vivo', withOp('ao-vivo'));
  app.get('/api/ibl-portal/relatorio', withOp('relatorio'));
  app.post('/api/ibl-portal/campos', withOp('campos'));
  app.post('/api/ibl-portal/catalogo', withOp('catalogo'));
  app.get('/api/ibl-portal/status', withOp('status'));
  app.get('/api/ibl-portal/pgr/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pgr', os: String(req.params.os || '') });
    await handleIblPortalHttp(req, res);
  });
  app.get('/api/ibl-portal/solicitacoes', withOp('solicitacoes'));
  app.post('/api/ibl-portal/solicitacoes', withOp('solicitacoes'));
}
