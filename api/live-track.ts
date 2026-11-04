/**
 * Rastreio velada — handler leve (não usa Express / api/index).
 * O catch-all Express estourava tempo e o botão Gerar link não respondia.
 * O pacote CJS entra no build: import solto de lib/liveTrack deixava
 * lib/publicAppUrl de fora e a Vercel respondia Cannot find module.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleLiveTrackHttp } = require('./_live-track-core.cjs') as {
  handleLiveTrackHttp: (req: any, res: any) => Promise<void>;
};

export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');
    await handleLiveTrackHttp(req, res);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[live-track]', message);
    try {
      if (!res.headersSent) {
        res.status(500).json({ error: message || 'Falha no rastreio ao vivo' });
      }
    } catch {
      // ignore
    }
  }
}

export const config = { maxDuration: 30 };
