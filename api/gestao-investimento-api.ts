/**
 * Gestão Investimento — handler leve na Vercel (não usa Express / api/index).
 * Core empacotado em _gestao-investimento-core.cjs (evita ERR_MODULE_NOT_FOUND
 * de imports TS sem extensão no runtime ESM).
 *
 * Ops: health | summary | ensure-schema | profile | positions | watchlist | audit | risk-limits
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// require estático — Vercel empacota o .cjs junto (prefixo _ não vira função).
const core = require('./_gestao-investimento-core.cjs') as {
  handleGestaoInvestimentoOp: (
    op: string,
    req: any,
  ) => Promise<{ status: number; body: any }>;
};

export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');

    const pathHint = String(req.query?.path || req.query?.op || '').trim().toLowerCase();
    let op = pathHint.split('/')[0] || '';

    if (!op) {
      const url = String(req.url || '');
      const m = url.match(/gestao-investimento(?:-api)?\/?([^?&#]*)/i);
      const tail = (m?.[1] || '').replace(/^\/+|\/+$/g, '');
      op = tail.split('/')[0] || '';
    }
    if (!op) op = 'summary';

    const url = String(req.url || '');
    const idMatch = url.match(/(?:positions|watchlist)\/([0-9a-f-]{8,})/i);
    if (idMatch && !req.query?.id) {
      req.query = { ...(req.query || {}), id: idMatch[1] };
    }
    if (pathHint.includes('/')) {
      const parts = pathHint.split('/').filter(Boolean);
      if (parts[1] && !req.query?.id) {
        req.query = { ...(req.query || {}), id: parts[1] };
      }
    }

    const result = await core.handleGestaoInvestimentoOp(op, req);
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/gestao-investimento]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Falha interna' });
  }
}

export const config = { maxDuration: 60 };
