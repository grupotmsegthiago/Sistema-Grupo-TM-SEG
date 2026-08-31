/**
 * GET /api/rh/employees — handler leve (rewrite vercel.json).
 */
import {
  authorizeRhApiRequest,
  createRhServiceRoleClient,
  type RhApiAccessDeps,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

export type RhEmployeeListDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  accessDeps?: RhApiAccessDeps;
  list?: () => Promise<unknown[]>;
};

export async function handleRhEmployeeListRequest(
  req: any,
  res: any,
  deps: RhEmployeeListDeps = {},
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const authorization = await (
    deps.authorize
    || ((request: any) => authorizeRhApiRequest(request, deps.accessDeps))
  )(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ ok: false, error: authorization.error });
    return;
  }

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    let employees: unknown[];
    if (deps.list) {
      employees = await deps.list();
    } else {
      const sb = createRhServiceRoleClient();
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
      employees = data || [];
    }

    res.status(200).json({
      ok: true,
      employees,
      total: employees.length,
    });
  } catch (e: any) {
    console.error('[rh-employees]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao listar funcionários' });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhEmployeeListRequest(req, res);
}

export const config = { maxDuration: 60 };
