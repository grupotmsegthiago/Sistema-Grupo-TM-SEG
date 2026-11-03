import type { Express, Request, Response } from 'express';
import { atenderLoginProducao, type PedidoLogin } from './loginProducao';

function authorizationDe(req: Request): string | null {
  const valor = req.headers.authorization;
  if (Array.isArray(valor)) return valor[0] || null;
  return valor || null;
}

function registrar(app: Express, caminho: string, acao: PedidoLogin['acao']): void {
  app.all(caminho, async (req: Request, res: Response) => {
    const resposta = await atenderLoginProducao({
      method: req.method,
      acao,
      authorization: authorizationDe(req),
      body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>,
    });
    res.setHeader('Cache-Control', 'no-store');
    if (resposta.cookies.length) res.setHeader('Set-Cookie', resposta.cookies);
    res.status(resposta.status).json(resposta.body);
  });
}

export function registrarSessaoExpress(app: Express): void {
  registrar(app, '/api/ponte-auth/login', 'login');
  registrar(app, '/api/ponte-auth/sessao', 'sessao');
  registrar(app, '/api/ponte-auth/logout', 'logout');
  registrar(app, '/api/ponte-auth/senha', 'senha');
  registrar(app, '/api/ponte-auth/confirmar-senha', 'confirmar');
  registrar(app, '/api/ponte-auth/personificar', 'personificar');
}
