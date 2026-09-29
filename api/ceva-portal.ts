/**
 * Portal CEVA — handler leve (não usa Express / api/index).
 * O catch-all Express estourava tempo e o botão ficava em "Aguarde...".
 */
export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');
    const mod = await import('../lib/cevaPortal/httpHandler.js');
    await mod.handleCevaPortalHttp(req, res);
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
