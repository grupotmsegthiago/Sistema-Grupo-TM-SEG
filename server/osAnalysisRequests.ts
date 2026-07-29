/**
 * Rotas Express de Pedido de Análise (dev local / fallback).
 * Em produção na Vercel o fluxo usa o handler leve api/os-analysis.ts
 * porque o catch-all Express (api/index) está com timeout.
 */
import type { Express, Request, Response } from 'express';
import {
  claimOsAnalysis,
  getOpenOsAnalysisRequest,
  listInboxForUser,
  listOsAnalysisRequests,
  requestOsAnalysis,
  respondOsAnalysis,
  reviewOsAnalysis,
} from '../lib/osAnalysis/osAnalysisService';
import { canRequestOsAnalysis } from '../lib/osAnalysisAccess';

async function resolveUser(req: Request): Promise<{ name: string; role: string; id: string; email: string | null } | null> {
  if ((req as any).user?.name) {
    return {
      id: String((req as any).user.id || ''),
      name: String((req as any).user.name),
      role: String((req as any).user.role || '').toLowerCase(),
      email: (req as any).user.email || null,
    };
  }
  const { resolveOsAnalysisPrincipal, extractAuthToken } = await import('../lib/osAnalysis/apiAuth');
  return resolveOsAnalysisPrincipal(extractAuthToken(req), req);
}

export function registerOsAnalysisRoutes(app: Express, requireAuth: any): void {
  app.post('/api/os-analysis', requireAuth, async (req: Request, res: Response) => {
    try {
      const op = String(req.query.op || req.body?.op || '').trim().toLowerCase();
      const user = await resolveUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Não autorizado' });

      if (op === 'request') {
        if (!canRequestOsAnalysis(user)) {
          return res.status(403).json({ ok: false, error: 'Somente Diretoria pode pedir análise de OS.' });
        }
        const result = await requestOsAnalysis(user, {
          missionId: req.body?.missionId || req.body?.id,
          note: req.body?.note || req.body?.observation,
          source: req.body?.source,
          revenueBefore: req.body?.revenueBefore,
          costBefore: req.body?.costBefore,
          resultBefore: req.body?.resultBefore,
          client: req.body?.client,
          provider: req.body?.provider,
          recipients: req.body?.recipients,
        });
        return res.json({ ok: true, ...result });
      }
      if (op === 'claim') {
        const id = String(req.query.id || req.body?.id || req.body?.requestId || '');
        const result = await claimOsAnalysis(user, id);
        return res.status(result.conflict ? 409 : 200).json(result);
      }
      if (op === 'respond') {
        const result = await respondOsAnalysis(user, {
          missionId: req.body?.missionId,
          reason: req.body?.reason,
          revenueAfter: req.body?.revenueAfter,
          costAfter: req.body?.costAfter,
          resultAfter: req.body?.resultAfter,
          changesSummary: req.body?.changesSummary,
          requestId: req.body?.requestId,
        });
        return res.json({ ok: true, ...result });
      }
      if (op === 'review') {
        if (!canRequestOsAnalysis(user)) return res.status(403).json({ ok: false, error: 'Somente Diretoria.' });
        const id = String(req.query.id || req.body?.id || '');
        const request = await reviewOsAnalysis(user, id, req.body?.notes);
        return res.json({ ok: true, request });
      }
      return res.status(400).json({ ok: false, error: 'op inválida' });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.get('/api/os-analysis', requireAuth, async (req: Request, res: Response) => {
    try {
      const op = String(req.query.op || '').trim().toLowerCase();
      const user = await resolveUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Não autorizado' });

      if (op === 'list') {
        if (!canRequestOsAnalysis(user)) return res.status(403).json({ ok: false, error: 'Somente Diretoria.' });
        const items = await listOsAnalysisRequests(String(req.query.status || '') || undefined);
        return res.json({ ok: true, items });
      }
      if (op === 'open') {
        const request = await getOpenOsAnalysisRequest(String(req.query.missionId || ''));
        return res.json({ ok: true, request });
      }
      if (op === 'inbox') {
        const items = await listInboxForUser(user.id);
        return res.json({ ok: true, items });
      }
      return res.status(400).json({ ok: false, error: 'op inválida' });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });
}

/** @deprecated — schema agora em lib/osAnalysis/osAnalysisService */
export async function ensureOsAnalysisSchema(): Promise<void> {
  const { ensureOsAnalysisSchema: ensure } = await import('../lib/osAnalysis/osAnalysisService');
  await ensure();
}
