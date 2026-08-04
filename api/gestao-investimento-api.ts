/**
 * Gestão Investimento — handler leve na Vercel (não usa Express / api/index).
 * Evita loading infinito quando o monólito Express está lento/travado.
 *
 * Ops: health | summary | ensure-schema | profile | positions | watchlist | audit | risk-limits
 */
export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');

    const pathHint = String(req.query?.path || req.query?.op || '').trim().toLowerCase();
    let op = pathHint.split('/')[0] || '';

    // Reescreve /api/gestao-investimento/summary → ?path=summary (vercel rewrite)
    if (!op) {
      const url = String(req.url || '');
      const m = url.match(/gestao-investimento\/?([^?&#]*)/i);
      const tail = (m?.[1] || '').replace(/^\/+|\/+$/g, '');
      op = tail.split('/')[0] || '';
    }
    if (!op) op = 'summary';

    // id em path: positions/<uuid> ou watchlist/<uuid>
    const url = String(req.url || '');
    const idMatch = url.match(/(?:positions|watchlist)\/([0-9a-f-]{8,})/i);
    if (idMatch && !req.query?.id) {
      req.query = { ...(req.query || {}), id: idMatch[1] };
    }
    // path=positions/uuid
    if (pathHint.includes('/')) {
      const parts = pathHint.split('/').filter(Boolean);
      if (parts[1] && !req.query?.id) {
        req.query = { ...(req.query || {}), id: parts[1] };
      }
    }

    const { handleGestaoInvestimentoOp } = await import('../lib/investimentos/gestaoInvestimentoApi.js');
    const result = await handleGestaoInvestimentoOp(op, req);
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/gestao-investimento]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Falha interna' });
  }
}

export const config = { maxDuration: 60 };
