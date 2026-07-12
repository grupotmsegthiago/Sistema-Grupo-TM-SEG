import { assertBillingAccess, extractAuthToken } from '../lib/services/billingAccess.js';

/** Painel de custos IA — handler leve (evita cold start do Express). */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  const denied = await assertBillingAccess(token);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 80));
    const month = typeof req.query?.month === 'string' ? req.query.month : undefined;

    const {
      getBillingMonthSummary,
      getBillingUsageLog,
      buildTokenEfficiencyReport,
    } = await import('../server/billingService.js');

    const [summary, rows] = await Promise.all([
      getBillingMonthSummary(month),
      getBillingUsageLog(limit, month),
    ]);
    const efficiency = buildTokenEfficiencyReport(rows);

    res.status(200).json({ ok: true, summary, rows, efficiency });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[billing-dashboard]', message);
    res.status(500).json({ ok: false, error: message || 'Falha ao carregar custos de IA' });
  }
}

export const config = { maxDuration: 60 };
