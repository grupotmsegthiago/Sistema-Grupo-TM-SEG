/**
 * Portal CEVA — handler leve (não usa Express / api/index).
 * O core vem de bundle CJS (build-server.mjs) para não quebrar no ESM da Vercel
 * com financialUtils / imports sem extensão (mesmo padrão de recalculate-open).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Require ESTÁTICO — o file tracer da Vercel precisa ver o caminho literal.
const core = require('./_ceva-portal-core.cjs') as {
  handleCevaPortalHttp: (req: any, res: any) => Promise<void>;
};

export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');
    await core.handleCevaPortalHttp(req, res);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[ceva-portal]', message);
    try {
      if (!res.headersSent) {
        res.status(500).json({ error: message || 'Falha no portal CEVA' });
      }
    } catch {
      // ignore
    }
  }
}

export const config = { maxDuration: 60 };
