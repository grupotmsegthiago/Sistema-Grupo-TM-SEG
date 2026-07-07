import { authToken } from '../lib/email/missionEmailHelpers.js';
import { createRhAdminClient } from '../lib/rh/adminSupabase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = authToken(req);
  if (!token) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const sb = createRhAdminClient();
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
