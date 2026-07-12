import { assertBillingApiAccess, extractAuthToken } from '../lib/billingApiAuth.js';

/** Painel de custos IA — handler leve (evita cold start do Express). */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  const denied = await assertBillingApiAccess(token, req);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 80));
    const month = typeof req.query?.month === 'string' ? req.query.month : undefined;

    const billing = await import('../lib/billing/billingService.js');
    const [summary, rows] = await Promise.all([
      billing.getBillingMonthSummary(month),
      billing.getBillingUsageLog(limit, month),
    ]);
    const efficiency = billing.buildTokenEfficiencyReport(rows);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, summary, rows, efficiency });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[billing-dashboard]', message);
    res.status(500).json({ ok: false, error: message || 'Falha ao carregar custos de IA' });
  }
}

export const config = { maxDuration: 60 };
