/**
 * POST /api/comissoes/ingest — TORRES (e outros) enviam faturamento/baixa/cancelamento.
 * GET  /api/comissoes/ingest — lista comerciais ativos da TM SEG para o select da TORRES.
 * GET  /api/comissoes/quadro — quadro TM SEG (faturas) + TORRES (ingest), service_role.
 * POST /api/comissoes/sync-faturas — gera comissões das faturas TM SEG, service_role.
 * Fail-soft no chamador: este endpoint não altera cálculo de OS/Asaas da TM SEG.
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import { DEFAULT_SUPABASE_ANON_KEY } from '../lib/supabaseDefaults.js';
import {
  isComissaoIngestAuthorized,
  listarComerciaisParaIngest,
  parseComissaoIngestPayload,
  processarComissaoIngest,
} from '../lib/comissao/comissaoIngest.js';
import { assertComissoesQuadroAccess } from '../lib/comissao/comissaoQuadroAuth.js';
import { montarQuadroComissoesApi, sincronizarComissoesViaAdmin } from '../lib/comissao/comissaoQuadroApi.js';

function extractToken(req: { headers?: Record<string, unknown> }): string {
  const headers = req.headers || {};
  const rawAuth = String(headers.authorization || headers.Authorization || '');
  const bearer = rawAuth.toLowerCase().startsWith('bearer ') ? rawAuth.slice(7).trim() : '';
  return String(
    headers['x-comissao-ingest-token'] ||
    headers['x-torres-ingest-token'] ||
    bearer ||
    '',
  ).trim();
}

function queryOp(req: { query?: Record<string, unknown>; url?: string }): string {
  const fromQuery = String(req.query?.op || req.query?.OP || '').trim().toLowerCase();
  if (fromQuery) return fromQuery;
  const url = String(req.url || '');
  if (url.includes('/comissoes/quadro')) return 'quadro';
  if (url.includes('/comissoes/sync-faturas')) return 'sync-faturas';
  return '';
}

function searchParam(req: { query?: Record<string, unknown>; url?: string }, key: string): string {
  const fromQuery = String(req.query?.[key] || '').trim();
  if (fromQuery) return fromQuery;
  try {
    return new URL(String(req.url || ''), 'http://local').searchParams.get(key) || '';
  } catch {
    return '';
  }
}

function queryDate(req: { query?: Record<string, unknown>; url?: string }, key: string): string {
  return searchParam(req, key).slice(0, 10);
}

async function handleQuadroOps(req: any, res: any, op: string) {
  const access = await assertComissoesQuadroAccess(req);
  if (!access.ok) {
    res.status(access.status).json({ ok: false, error: access.error });
    return;
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(500).json({ ok: false, error: 'supabase_unavailable' });
    return;
  }
  if (op === 'quadro') {
    const start = queryDate(req, 'start');
    const end = queryDate(req, 'end');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      res.status(400).json({ ok: false, error: 'periodo inválido' });
      return;
    }
    const result = await montarQuadroComissoesApi(sb, start, end);
    res.status(200).json(result);
    return;
  }
  const result = await sincronizarComissoesViaAdmin(sb);
  res.status(200).json(result);
}

export async function handleComissoesIngest(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    return;
  }

  const op = queryOp(req);
  if (op === 'quadro' || op === 'sync-faturas') {
    if (op === 'quadro' && req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (op === 'sync-faturas' && req.method !== 'POST' && req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    try {
      await handleQuadroOps(req, res, op);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[comissao-quadro]', message);
      res.status(200).json({ ok: false, error: message, linhasTm: [], linhasTorres: [], meses: [], pendencias: [], cobertura: { estado: 'ERRO', consultaIncompleta: true, itens: [], porCliente: [], totais: { missoes: 0, faturadas: 0, semFatura: 0, receita: 0, custo: 0, lucro: 0 } } });
    }
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = extractToken(req);
  const authorized = isComissaoIngestAuthorized(token, [
    process.env.COMISSAO_INGEST_TOKEN,
    process.env.CRON_SECRET,
    DEFAULT_SUPABASE_ANON_KEY,
  ]);
  if (!authorized) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(500).json({ error: 'supabase_unavailable' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const list = await listarComerciaisParaIngest(sb);
      res.status(list.ok ? 200 : 500).json(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(200).json({ ok: false, comerciais: [], error: message });
    }
    return;
  }

  const parsed = parseComissaoIngestPayload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const result = await processarComissaoIngest(sb, parsed.data);
    res.status(200).json({ ok: result.ok !== false, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[comissao-ingest]', message);
    res.status(200).json({ ok: false, error: message });
  }
}

export default async function handler(req: any, res: any) {
  return handleComissoesIngest(req, res);
}

export const config = { maxDuration: 60 };
