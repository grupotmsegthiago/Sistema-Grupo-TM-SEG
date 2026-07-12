import { extractAuthToken, assertBillingAccess } from '../lib/services/systemAccess.js';

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
    const { runBillingUsageMigrations } = await import('../lib/billing/usageMigrations.js');
    const result = await runBillingUsageMigrations();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, message });
  }
}

export const config = { maxDuration: 60 };
