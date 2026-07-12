import { assertBillingAccess, extractAuthToken } from '../lib/services/billingAccess.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  const denied = await assertBillingAccess(token);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  try {
    const { syncBillingUsage } = await import('../server/billingService.js');
    const result = await syncBillingUsage();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message });
  }
}

export const config = { maxDuration: 120 };
