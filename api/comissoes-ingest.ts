/**
 * POST /api/comissoes/ingest — TORRES (e outros) enviam faturamento/baixa/cancelamento.
 * GET  /api/comissoes/ingest — lista comerciais ativos da TM SEG para o select da TORRES.
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

export async function handleComissoesIngest(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(200).json({ ok: true });
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

export const config = { maxDuration: 30 };
