/**
 * Pedido de análise de OS — handler leve (não usa Express / api/index).
 * Ops: request | list | open | respond | review | inbox | claim
 */
export default async function handler(req: any, res: any) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');

    const op = String(req.query?.op || '').trim().toLowerCase();
    if (!op) {
      res.status(400).json({ ok: false, error: 'Informe op=request|list|open|respond|review|inbox|claim|diag' });
      return;
    }

    const {
      describeOsAnalysisSupabaseConfig,
      extractAuthToken,
      principalCanRequestAnalysis,
      resolveOsAnalysisPrincipal,
    } = await import('../lib/osAnalysis/apiAuth.js');
    const service = await import('../lib/osAnalysis/osAnalysisService.js');

    const token = extractAuthToken(req);
    const principal = await resolveOsAnalysisPrincipal(token, req);
    if (!principal) {
      res.status(401).json({ ok: false, error: 'Não autorizado' });
      return;
    }

    // Diagnóstico seguro da SUPABASE_SERVICE_ROLE_KEY (sem expor o segredo)
    if (op === 'diag') {
      if (!principalCanRequestAnalysis(principal)) {
        res.status(403).json({ ok: false, error: 'Somente Diretoria.' });
        return;
      }
      res.status(200).json({ ok: true, ...describeOsAnalysisSupabaseConfig() });
      return;
    }

    const readBody = (): any => {
      if (req.body && typeof req.body === 'object') return req.body;
      if (typeof req.body === 'string') {
        try {
          return JSON.parse(req.body);
        } catch {
          return {};
        }
      }
      return {};
    };

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
      const items = await service.listOsAnalysisRequests(status || undefined);
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
      const request = await service.getOpenOsAnalysisRequest(missionId);
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
      const body = readBody();
      const result = await service.requestOsAnalysis(principal, {
        missionId: body.missionId || body.id,
        note: body.note || body.observation,
        source: body.source,
        revenueBefore: body.revenueBefore,
        costBefore: body.costBefore,
        resultBefore: body.resultBefore,
        client: body.client,
        provider: body.provider,
        recipients: body.recipients,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'inbox') {
      if (req.method !== 'GET') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      const items = await service.listInboxForUser(principal.id);
      res.status(200).json({ ok: true, items });
      return;
    }

    if (op === 'claim') {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      const body = readBody();
      const id = String(req.query?.id || body?.id || body?.requestId || '').trim();
      const result = await service.claimOsAnalysis(principal, id);
      res.status(result.conflict ? 409 : 200).json(result);
      return;
    }

    if (op === 'respond') {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
      }
      const body = readBody();
      const result = await service.respondOsAnalysis(principal, {
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
      const body = readBody();
      const id = String(req.query?.id || body?.id || '').trim();
      if (!id) {
        res.status(400).json({ ok: false, error: 'Informe id' });
        return;
      }
      const request = await service.reviewOsAnalysis(principal, id, body?.notes);
      res.status(200).json({ ok: true, request });
      return;
    }

    res.status(400).json({ ok: false, error: `op desconhecida: ${op}` });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[os-analysis]', message);
    try {
      res.status(500).json({ ok: false, error: message || 'Falha na análise de OS' });
    } catch {
      // ignore
    }
  }
}

export const config = { maxDuration: 60 };
