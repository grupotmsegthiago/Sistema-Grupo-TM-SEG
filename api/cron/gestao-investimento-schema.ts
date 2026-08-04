/**
 * Cron leve — aplica schema da Gestão Investimento (idempotente).
 * Path real em /api/cron/* (Vercel Cron não confia só em rewrite).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../_gestao-investimento-core.cjs') as {
  handleGestaoInvestimentoOp: (
    op: string,
    req: any,
  ) => Promise<{ status: number; body: any }>;
};

function isCronAuthorized(req: any): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const raw = Array.isArray(auth) ? auth[0] : auth;
  return String(raw || '') === `Bearer ${secret}`;
}

export default async function handler(req: any, res: any) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!isCronAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }
  try {
    // Reaproveita ensure-schema do core (já aceita Bearer CRON_SECRET).
    const result = await core.handleGestaoInvestimentoOp('ensure-schema', req);
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[cron/gestao-investimento-schema]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Falha' });
  }
}

export const config = { maxDuration: 60 };
