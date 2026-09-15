/**
 * Rastreio velada — handler leve (não usa Express / api/index).
 * O catch-all Express estourava tempo e o botão Gerar link não respondia.
 */
export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');
    const mod = await import('../lib/liveTrack/httpHandler.js');
    await mod.handleLiveTrackHttp(req, res);
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
