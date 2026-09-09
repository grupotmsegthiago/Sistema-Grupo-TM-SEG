/**
 * Rotas Express do quadro de comissões (dev local).
 * Em produção a Vercel reescreve /api/comissoes/quadro para api/comissoes-ingest.ts.
 */
import type { Express, Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import { assertComissoesQuadroAccess } from '../lib/comissao/comissaoQuadroAuth';
import { montarQuadroComissoesApi, sincronizarComissoesViaAdmin } from '../lib/comissao/comissaoQuadroApi';

export function registerComissaoQuadroRoutes(app: Express, requireAuth: any): void {
  app.get('/api/comissoes/quadro', requireAuth, async (req: Request, res: Response) => {
    const access = await assertComissoesQuadroAccess(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
    const sb = createSupabaseAdminClient();
    if (!sb) return res.status(500).json({ ok: false, error: 'supabase_unavailable' });
    const start = String(req.query.start || '').slice(0, 10);
    const end = String(req.query.end || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ ok: false, error: 'periodo inválido' });
    }
    try {
      const result = await montarQuadroComissoesApi(sb, start, end);
      return res.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return res.status(200).json({ ok: false, error: message, linhasTm: [], linhasTorres: [], meses: [], pendencias: [] });
    }
  });

  app.post('/api/comissoes/sync-faturas', requireAuth, async (req: Request, res: Response) => {
    const access = await assertComissoesQuadroAccess(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
    const sb = createSupabaseAdminClient();
    if (!sb) return res.status(500).json({ ok: false, error: 'supabase_unavailable' });
    try {
      const result = await sincronizarComissoesViaAdmin(sb);
      return res.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return res.status(200).json({ ok: false, error: message });
    }
  });
}
