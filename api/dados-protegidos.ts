import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { atenderDadosProtegidos } = require('./_dados-protegidos-core.cjs') as {
  atenderDadosProtegidos: (pedido: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    authorization: string | null;
  }) => Promise<{ status: number; body: string; contentType: string; contentRange: string | null }>;
};

type Requisicao = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Resposta = {
  setHeader: (nome: string, valor: string) => void;
  status: (codigo: number) => { json: (corpo: unknown) => void; end: (corpo?: string) => void };
};

function cabecalho(req: Requisicao, nome: string): string {
  const valor = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  if (Array.isArray(valor)) return String(valor[0] || '');
  return String(valor || '');
}

function corpoDe(body: unknown): { method?: string; url?: string; headers?: Record<string, string>; body?: string | null } {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as { method?: string; url?: string; headers?: Record<string, string>; body?: string | null };
  if (typeof body === 'string' && body.trim()) {
    try {
      return JSON.parse(body) as { method?: string; url?: string; headers?: Record<string, string>; body?: string | null };
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: Requisicao, res: Resposta): Promise<void> {
  if (String(req.method || 'GET').toUpperCase() !== 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ ok: false, codigo: 'metodo_nao_permitido' });
    return;
  }
  const pedido = corpoDe(req.body);
  const resposta = await atenderDadosProtegidos({
    method: String(pedido.method || 'GET'),
    url: String(pedido.url || ''),
    headers: pedido.headers || {},
    body: pedido.body ?? null,
    authorization: cabecalho(req, 'authorization'),
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: resposta.status,
    body: resposta.body,
    contentType: resposta.contentType,
    contentRange: resposta.contentRange,
  });
}
