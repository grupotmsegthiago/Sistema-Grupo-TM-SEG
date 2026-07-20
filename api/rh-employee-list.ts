/**
 * GET /api/rh/employees — handler leve (rewrite vercel.json).
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  assertEmployeesApiAccess,
  extractAuthToken,
} from '../lib/rh/apiEmployeesAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  if (!token) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  try {
    const denied = await assertEmployeesApiAccess(token, req);
    if (denied) {
      res.status(403).json({ ok: false, error: denied });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      return;
    }

    const { data, error } = await sb
      .from('rh_employees')
      .select('*, rh_positions(name), rh_departments(name)')
      .is('deleted_at', null)
      .order('full_name');

    if (error) throw error;

    res.status(200).json({
      ok: true,
      employees: data || [],
      total: data?.length || 0,
    });
  } catch (e: any) {
    console.error('[rh-employees]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao listar funcionários' });
  }
}

export const config = { maxDuration: 60 };
