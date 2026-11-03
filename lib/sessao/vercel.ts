import { atenderLoginProducao, type PedidoLogin, type RespostaLogin } from './loginProducao';

type RequisicaoVercel = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type RespostaVercel = {
  setHeader: (nome: string, valor: string | string[]) => void;
  status: (codigo: number) => { json: (corpo: unknown) => void };
};

function cabecalho(req: RequisicaoVercel, nome: string): string | null {
  const valor = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

function corpoDe(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  if (typeof body === 'string' && body.trim()) {
    try {
      const lido = JSON.parse(body) as unknown;
      if (lido && typeof lido === 'object' && !Array.isArray(lido)) return lido as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export function criarHandlerSessao(acao: PedidoLogin['acao']) {
  return async function handler(req: RequisicaoVercel, res: RespostaVercel): Promise<void> {
    const resposta: RespostaLogin = await atenderLoginProducao({
      method: String(req.method || 'GET').toUpperCase(),
      acao,
      authorization: cabecalho(req, 'authorization'),
      body: corpoDe(req.body),
    });
    res.setHeader('Cache-Control', 'no-store');
    if (resposta.cookies.length) res.setHeader('Set-Cookie', resposta.cookies);
    res.status(resposta.status).json(resposta.body);
  };
}
