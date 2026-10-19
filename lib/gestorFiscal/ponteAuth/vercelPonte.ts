/**
 * Adaptador fino das rotas HTTP. Não liga testeLocal e não abre depósito.
 */
import { atenderPonteHttp, type AcaoHttp, type RequisicaoPonte, type RespostaPonte } from './httpPonte';

type RequisicaoVercel = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
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

function consultaDe(query: RequisicaoVercel['query']): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(query || {})) {
    saida[chave] = Array.isArray(valor) ? String(valor[0] ?? '') : String(valor ?? '');
  }
  return saida;
}

export function daRequisicaoVercel(req: RequisicaoVercel, acao: AcaoHttp): RequisicaoPonte {
  let body: Record<string, unknown> = {};
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) body = req.body as Record<string, unknown>;
  else if (typeof req.body === 'string' && req.body.trim()) {
    try {
      const lido = JSON.parse(req.body) as unknown;
      if (lido && typeof lido === 'object' && !Array.isArray(lido)) body = lido as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  return {
    acao,
    method: String(req.method || 'GET').toUpperCase(),
    cookie: cabecalho(req, 'cookie'),
    csrf: cabecalho(req, 'x-tmseg-csrf'),
    authorization: cabecalho(req, 'authorization'),
    body,
    consulta: consultaDe(req.query),
  };
}

export function escreverResposta(res: RespostaVercel, resposta: RespostaPonte): void {
  res.setHeader('Cache-Control', resposta.headers['Cache-Control'] || 'no-store');
  if (resposta.cookies.length) res.setHeader('Set-Cookie', resposta.cookies);
  res.status(resposta.status).json(resposta.body);
}

export function criarHandlerHttp(acao: AcaoHttp) {
  return async function handler(req: RequisicaoVercel, res: RespostaVercel): Promise<void> {
    const resposta = await atenderPonteHttp(daRequisicaoVercel(req, acao));
    escreverResposta(res, resposta);
  };
}
