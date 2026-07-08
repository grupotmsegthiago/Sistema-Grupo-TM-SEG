import { authToken } from '../lib/email/missionEmailHelpers.js';
import { runEmailHealthCheck } from '../server/emailHealth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const sendTestTo = typeof req.query?.sendTestTo === 'string' ? req.query.sendTestTo : undefined;
    const health = await runEmailHealthCheck(sendTestTo ? { sendTestTo } : undefined);
    res.status(health.ok ? 200 : 503).json(health);
  } catch (e: any) {
    console.error('[email-health]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha no health check' });
  }
}

export const config = { maxDuration: 60 };
