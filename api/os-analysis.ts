/**
 * Pedido de análise de OS — handler leve (não usa Express / api/index).
 * Ops: request | list | open | respond | review
 */
import {
  extractAuthToken,
  principalCanRequestAnalysis,
  resolveOsAnalysisPrincipal,
} from '../lib/osAnalysis/apiAuth.js';
import {
  getOpenOsAnalysisRequest,
  listOsAnalysisRequests,
  requestOsAnalysis,
  respondOsAnalysis,
  reviewOsAnalysis,
} from '../lib/osAnalysis/osAnalysisService.js';

function readBody(req: any): any {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  const op = String(req.query?.op || '').trim().toLowerCase();
  if (!op) {
    res.status(400).json({ ok: false, error: 'Informe op=request|list|open|respond|review' });
    return;
  }

  const token = extractAuthToken(req);
  const principal = await resolveOsAnalysisPrincipal(token, req);
  if (!principal) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  try {
    if (op === 'list') {
      if (req.method !== 'GET') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      if (!principalCanRequestAnalysis(principal)) {
        res.status(403).json({ ok: false, error: 'Somente Diretoria.' });
        return;
      }
      const status = typeof req.query?.status === 'string' ? req.query.status : '';
      const items = await listOsAnalysisRequests(status || undefined);
      res.status(200).json({ ok: true, items });
      return;
    }

    if (op === 'open') {
      if (req.method !== 'GET') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      const missionId = String(req.query?.missionId || '').trim();
      if (!missionId) {
        res.status(400).json({ ok: false, error: 'Informe missionId' });
        return;
      }
      const request = await getOpenOsAnalysisRequest(missionId);
      res.status(200).json({ ok: true, request });
      return;
    }

    if (op === 'request') {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      if (!principalCanRequestAnalysis(principal)) {
        res.status(403).json({ ok: false, error: 'Somente Diretoria pode pedir análise de OS.' });
        return;
      }
      const body = readBody(req);
      const result = await requestOsAnalysis(principal, {
        missionId: body.missionId || body.id,
        note: body.note || body.observation,
        source: body.source,
        revenueBefore: body.revenueBefore,
        costBefore: body.costBefore,
        resultBefore: body.resultBefore,
        client: body.client,
        provider: body.provider,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'respond') {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      const body = readBody(req);
      const result = await respondOsAnalysis(principal, {
        missionId: body.missionId || String(req.query?.missionId || ''),
        reason: body.reason,
        revenueAfter: body.revenueAfter,
        costAfter: body.costAfter,
        resultAfter: body.resultAfter,
        changesSummary: body.changesSummary,
        requestId: body.requestId,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'review') {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      if (!principalCanRequestAnalysis(principal)) {
        res.status(403).json({ ok: false, error: 'Somente Diretoria.' });
        return;
      }
      const id = String(req.query?.id || readBody(req)?.id || '').trim();
      if (!id) {
        res.status(400).json({ ok: false, error: 'Informe id' });
        return;
      }
      const body = readBody(req);
      const request = await reviewOsAnalysis(principal, id, body?.notes);
      res.status(200).json({ ok: true, request });
      return;
    }

    res.status(400).json({ ok: false, error: `op desconhecida: ${op}` });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[os-analysis]', op, message);
    res.status(500).json({ ok: false, error: message || 'Falha na análise de OS' });
  }
}

export const config = { maxDuration: 60 };
