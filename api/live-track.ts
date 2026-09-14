import {
  endLiveTrack,
  generateLiveTrack,
  publicConsentLiveTrack,
  publicGetLiveTrack,
  publicPingLiveTrack,
  watchLiveTrack,
} from '../lib/liveTrack/service.js';

function parseBody(body: unknown): any {
  if (typeof body === 'string') {
    if (!body.trim()) return {};
    return JSON.parse(body);
  }
  return body || {};
}

function authToken(req: any): string {
  return String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers?.['x-auth-token'] || '');
}

function createdBy(req: any): string {
  return String(req.headers?.['x-tmseg-user-name'] || req.headers?.['x-tmseg-user-id'] || '').slice(0, 120);
}

export default async function handler(req: any, res: any) {
  res.setHeader?.('Cache-Control', 'no-store');
  const op = String(req.query?.op || req.body?.op || '').trim();
  const method = String(req.method || 'GET').toUpperCase();

  try {
    if (op === 'public-get' && method === 'GET') {
      const token = String(req.query?.token || '').trim();
      const result = await publicGetLiveTrack({ token, req });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === 'public-consent' && method === 'POST') {
      const body = parseBody(req.body);
      const token = String(req.query?.token || body.token || '').trim();
      const result = await publicConsentLiveTrack({ token, accepted: body.accepted === true, req });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === 'public-ping' && method === 'POST') {
      const body = parseBody(req.body);
      const token = String(req.query?.token || body.token || '').trim();
      const result = await publicPingLiveTrack({ token, body, req });
      res.status(result.status).json(result.body);
      return;
    }

    if (!authToken(req)) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    if (op === 'generate' && method === 'POST') {
      const body = parseBody(req.body);
      const result = await generateLiveTrack({
        missionId: String(body.missionId || req.query?.missionId || ''),
        createdBy: createdBy(req),
        req,
      });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === 'watch' && method === 'GET') {
      const result = await watchLiveTrack({
        missionId: String(req.query?.missionId || ''),
        includeTrail: String(req.query?.trail || '') === '1',
      });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === 'end' && method === 'POST') {
      const body = parseBody(req.body);
      const result = await endLiveTrack({
        missionId: String(body.missionId || req.query?.missionId || ''),
        reason: String(body.reason || 'operator_end'),
      });
      res.status(result.status).json(result.body);
      return;
    }

    res.status(400).json({ error: 'op inválida' });
  } catch (e: any) {
    console.error('[live-track]', e);
    res.status(500).json({ error: e?.message || 'Erro interno' });
  }
}
