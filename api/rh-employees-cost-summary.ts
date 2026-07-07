import { authToken } from '../lib/email/missionEmailHelpers.js';
import { createRhAdminClient } from '../lib/rh/adminSupabase.js';
import { loadEmployeeCostSummary } from '../lib/rh/loadEmployeeCostSummary.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = authToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const month = String(req.query?.month || new Date().toISOString().slice(0, 7));
    const sb = createRhAdminClient();
    const result = await loadEmployeeCostSummary(sb, month);
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[rh-employees-cost-summary]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao calcular custos' });
  }
}

export const config = { maxDuration: 60 };
