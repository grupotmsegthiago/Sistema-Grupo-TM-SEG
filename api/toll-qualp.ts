import { fetchQualpToll } from '../lib/toll/qualpToll.js';

function parseBody(body: unknown): Record<string, any> {
  if (typeof body !== 'string') return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function hasAuth(req: any): boolean {
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers?.['x-auth-token'] || '');
  return !!token;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasAuth(req)) {
    res.status(401).json({ success: false, apiError: 'Não autorizado' });
    return;
  }

  try {
    const body = parseBody(req.body);
    const origin = String(body.origin || '').trim();
    const destination = String(body.destination || '').trim();
    const axis = Number(body.axis) || 2;
    const result = await fetchQualpToll(origin, destination, axis);
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[toll-qualp]', e?.message);
    res.status(200).json({ success: false, tollValue: 0, tollCount: 0, tolls: [], provider: 'qualp', apiError: e?.message || 'erro' });
  }
}
