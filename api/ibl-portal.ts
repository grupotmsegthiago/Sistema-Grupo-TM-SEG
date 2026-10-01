/**
 * Portal IBL — handler leve (não usa Express / api/index).
 * Reusa o mesmo bundle do portal CEVA, com a configuração da Intermodal Brasil Logística.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const core = require('./_ceva-portal-core.cjs') as {
  handleIblPortalHttp: (req: any, res: any) => Promise<void>;
};

export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');
    await core.handleIblPortalHttp(req, res);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[ibl-portal]', message);
    try {
      if (!res.headersSent) {
        res.status(500).json({ error: message || 'Falha no portal IBL' });
      }
    } catch {
      // ignore
    }
  }
}

export const config = { maxDuration: 60 };
