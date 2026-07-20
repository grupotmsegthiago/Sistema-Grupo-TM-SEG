/**
 * GET /api/rh/employees/cost-summary — handler leve (rewrite vercel.json).
 * Usa createSupabaseAdminClient (mesmo padrão das demais APIs) e auth com
 * fallback de headers x-tmseg-* quando o service_role falha na resolução.
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  assertEmployeesApiAccess,
  extractAuthToken,
} from '../lib/rh/apiEmployeesAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  try {
    const denied = await assertEmployeesApiAccess(token, req);
    if (denied) {
      res.status(403).json({ ok: false, error: denied });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const month = String(req.query?.month || new Date().toISOString().slice(0, 7));
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      return;
    }

    const { loadEmployeeCostSummary } = await import('../lib/rh/loadEmployeeCostSummary.js');
    const result = await loadEmployeeCostSummary(sb, month);
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[rh-employees-cost-summary]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao calcular custos' });
  }
}

export const config = { maxDuration: 60 };
