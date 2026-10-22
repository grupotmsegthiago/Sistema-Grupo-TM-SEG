import type { Express, Request, Response } from 'express';
import { handleClientePortalHttp, handleIblPortalHttp } from '../lib/cevaPortal/httpHandler';

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
  app.get('/api/ibl-portal/catalogo', withOp('catalogo'));
  app.get('/api/ibl-portal/frota', withOp('frota'));
  app.post('/api/ibl-portal/catalogo', withOp('catalogo'));
  app.delete('/api/ibl-portal/catalogo', withOp('catalogo'));
  app.get('/api/ibl-portal/status', withOp('status'));
  app.get('/api/ibl-portal/pgr/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pgr', os: String(req.params.os || '') });
    await handleIblPortalHttp(req, res);
  });
  app.get('/api/ibl-portal/solicitacoes', withOp('solicitacoes'));
  app.post('/api/ibl-portal/solicitacoes', withOp('solicitacoes'));
  app.post('/api/ibl-portal/medicao', withOp('medicao'));
  app.get('/api/ibl-portal/cotacao', withOp('cotacao'));
  app.post('/api/ibl-portal/cotacao', withOp('cotacao'));
  app.get('/api/ibl-portal/fotos/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'fotos', os: String(req.params.os || '') });
    await handleIblPortalHttp(req, res);
  });
}

function withCliente(op: string) {
  return async (req: Request, res: Response) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op });
    await handleClientePortalHttp(req, res);
  };
}

/** Mesma API do portal, no slug do cliente. Em produção o rewrite cai em api/ibl-portal.ts. */
export function registerClientePortalRoutes(app: Express): void {
  app.get('/api/cliente-portal/marca', withCliente('marca'));
  app.post('/api/cliente-portal/marca-site', withCliente('marca-site'));
  app.post('/api/cliente-portal/provisionar', withCliente('provisionar'));
  app.get('/api/cliente-portal/acesso', withCliente('acesso'));
  app.post('/api/cliente-portal/login', withCliente('login'));
  app.post('/api/cliente-portal/primeiro-acesso', withCliente('primeiro-acesso'));
  app.get('/api/cliente-portal/me', withCliente('me'));
  app.post('/api/cliente-portal/trocar-senha', withCliente('trocar-senha'));
  app.get('/api/cliente-portal/pessoas', withCliente('pessoas'));
  app.post('/api/cliente-portal/pessoas', withCliente('pessoas'));
  app.patch('/api/cliente-portal/pessoas/:id', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pessoas-item', id: String(req.params.id || '') });
    await handleClientePortalHttp(req, res);
  });
  app.get('/api/cliente-portal/ao-vivo', withCliente('ao-vivo'));
  app.get('/api/cliente-portal/relatorio', withCliente('relatorio'));
  app.post('/api/cliente-portal/campos', withCliente('campos'));
  app.get('/api/cliente-portal/catalogo', withCliente('catalogo'));
  app.get('/api/cliente-portal/frota', withCliente('frota'));
  app.post('/api/cliente-portal/catalogo', withCliente('catalogo'));
  app.delete('/api/cliente-portal/catalogo', withCliente('catalogo'));
  app.get('/api/cliente-portal/status', withCliente('status'));
  app.get('/api/cliente-portal/pgr/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pgr', os: String(req.params.os || '') });
    await handleClientePortalHttp(req, res);
  });
  app.get('/api/cliente-portal/solicitacoes', withCliente('solicitacoes'));
  app.post('/api/cliente-portal/solicitacoes', withCliente('solicitacoes'));
  app.post('/api/cliente-portal/medicao', withCliente('medicao'));
  app.get('/api/cliente-portal/cotacao', withCliente('cotacao'));
  app.post('/api/cliente-portal/cotacao', withCliente('cotacao'));
  app.get('/api/cliente-portal/fotos/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'fotos', os: String(req.params.os || '') });
    await handleClientePortalHttp(req, res);
  });
}
